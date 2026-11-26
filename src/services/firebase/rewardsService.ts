import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  where,
  writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from './config';
import { logFirestoreListenerError, OperationType } from './errorHandler';
import { recordAuditLog } from './adminService';
import { dispatchDualNotification } from '../notifications/notificationDispatcher';
import {
  BankAccountResolution,
  BankProviderStatus,
  InvitationRecord,
  NigerianBankInfo,
  PlatformRole,
  ReferralClaim,
  ReferralFraudAlert,
  RewardsConfig,
  TaskItem,
  TaskSubmission,
  UserProfile,
  WalletAccount,
  WalletTransaction,
  WithdrawalPrivatePII,
  WithdrawalRequest,
  WithdrawalStatus,
} from '../../types/nexora';
import {
  calculateReferralMilestonesToAward,
  canTransitionWithdrawalStatus,
  computeConvertedNaira,
  DEFAULT_MIN_WITHDRAWAL_NAIRA,
  DEFAULT_REWARDS_CONFIG,
  evaluateReferralFraudSignals,
  FOUNDER_OWNER_EMAIL,
  generateInviteCode,
  hasAdminPermission,
  maskBankAccountNumber,
  sanitizeInviteCode,
  sanitizeString,
  STARTER_FREE_TASKS,
  validateWithdrawalEligibility,
} from '../../utils/validation';

function sortByTimestampDesc<T extends { createdAt?: Timestamp; registeredAt?: Timestamp }>(
  items: T[],
  field: 'createdAt' | 'registeredAt' = 'createdAt'
): T[] {
  return items.sort((a, b) => (b[field]?.toMillis?.() || 0) - (a[field]?.toMillis?.() || 0));
}

const PENDING_REF_STORAGE_KEY = 'nexora_pending_ref_code';

export function savePendingReferralCode(rawCode: string): string {
  const clean = sanitizeInviteCode(rawCode);
  if (typeof window !== 'undefined' && clean.length >= 3) {
    try {
      window.localStorage.setItem(PENDING_REF_STORAGE_KEY, clean);
    } catch {
      // Ignore storage quota errors
    }
  }
  return clean;
}

export function getPendingReferralCode(): string {
  if (typeof window === 'undefined') return '';
  try {
    return sanitizeInviteCode(window.localStorage.getItem(PENDING_REF_STORAGE_KEY) || '');
  } catch {
    return '';
  }
}

export function clearPendingReferralCode(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PENDING_REF_STORAGE_KEY);
  } catch {
    // Ignore storage access errors
  }
}

export function buildReferralShareUrl(code: string): string {
  const clean = sanitizeInviteCode(code);
  if (typeof window === 'undefined') return `?ref=${clean}`;
  return `${window.location.origin}/?ref=${encodeURIComponent(clean)}`;
}

export async function computeClientDeviceHash(): Promise<string> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return '';
  try {
    const fingerprint = [
      navigator.language || 'en',
      navigator.platform || 'web',
      String(window.screen?.width || 0),
      String(window.screen?.height || 0),
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      String(navigator.hardwareConcurrency || 0),
    ].join('|');
    const encoded = new TextEncoder().encode(fingerprint);
    const digest = await window.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 64);
  } catch {
    return '';
  }
}

function isActorRewardsAdmin(actor: UserProfile, roleDoc: PlatformRole | null): boolean {
  const email = auth.currentUser?.email?.toLowerCase() || '';
  if (email === FOUNDER_OWNER_EMAIL) return true;
  return (
    hasAdminPermission(roleDoc, 'manage_rewards') ||
    hasAdminPermission(roleDoc, 'manage_platform')
  );
}

function isActorWithdrawalsAdmin(actor: UserProfile, roleDoc: PlatformRole | null): boolean {
  const email = auth.currentUser?.email?.toLowerCase() || '';
  if (email === FOUNDER_OWNER_EMAIL) return true;
  return (
    hasAdminPermission(roleDoc, 'manage_withdrawals') ||
    hasAdminPermission(roleDoc, 'manage_platform')
  );
}

function isActorPlatformOwner(roleDoc: PlatformRole | null): boolean {
  const email = auth.currentUser?.email?.toLowerCase() || '';
  if (email === FOUNDER_OWNER_EMAIL) return true;
  return Boolean(roleDoc?.active && roleDoc.role === 'owner');
}

function isCallableUnavailableError(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err || '').toLowerCase();
  return (
    code.includes('not-found') ||
    code.includes('unimplemented') ||
    code.includes('unavailable') ||
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('not-found') ||
    msg.includes('cors')
  );
}

// --- Real-Time Subscriptions ---

export function subscribeRewardsConfig(
  callback: (config: RewardsConfig) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'rewards_config', 'global'),
    (snap) => {
      if (!snap.exists()) {
        callback({ ...DEFAULT_REWARDS_CONFIG });
        return;
      }
      const d = snap.data();
      callback({
        id: 'global',
        withdrawalsOpen: d.withdrawalsOpen === true,
        pointRateNaira:
          typeof d.pointRateNaira === 'number' && Number.isFinite(d.pointRateNaira) && d.pointRateNaira > 0
            ? d.pointRateNaira
            : null,
        minWithdrawalNaira:
          typeof d.minWithdrawalNaira === 'number' && d.minWithdrawalNaira >= 100
            ? d.minWithdrawalNaira
            : DEFAULT_MIN_WITHDRAWAL_NAIRA,
        referralsPerPoint:
          typeof d.referralsPerPoint === 'number' && d.referralsPerPoint >= 1
            ? d.referralsPerPoint
            : DEFAULT_REWARDS_CONFIG.referralsPerPoint,
        pointsPerMilestone:
          typeof d.pointsPerMilestone === 'number' && d.pointsPerMilestone > 0
            ? d.pointsPerMilestone
            : DEFAULT_REWARDS_CONFIG.pointsPerMilestone,
        invitationsEnabled: d.invitationsEnabled !== false,
        tasksEnabled: d.tasksEnabled !== false,
        lockReason: typeof d.lockReason === 'string' ? d.lockReason : undefined,
        updatedBy: typeof d.updatedBy === 'string' ? d.updatedBy : 'system',
        updatedAt: d.updatedAt as Timestamp | undefined,
      });
    },
    (err) => {
      logFirestoreListenerError(err, OperationType.GET, 'rewards_config/global');
      callback({ ...DEFAULT_REWARDS_CONFIG });
    }
  );
}

export function emptyWalletAccount(uid: string): WalletAccount {
  return {
    uid,
    availablePoints: 0,
    pendingPoints: 0,
    lockedPoints: 0,
    lifetimeEarnedPoints: 0,
    lifetimeWithdrawnPoints: 0,
    lifetimeWithdrawnNaira: 0,
    frozen: false,
  };
}

export function subscribeMyWallet(
  uid: string,
  callback: (wallet: WalletAccount) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'wallets', uid),
    (snap) => {
      if (!snap.exists()) {
        callback(emptyWalletAccount(uid));
        return;
      }
      callback({ ...(snap.data() as WalletAccount), uid });
    },
    (err) => {
      logFirestoreListenerError(err, OperationType.GET, `wallets/${uid}`);
      callback(emptyWalletAccount(uid));
    }
  );
}

export function subscribeAllWalletsAdmin(
  callback: (wallets: WalletAccount[]) => void
): Unsubscribe {
  const q = query(collection(db, 'wallets'), where('availablePoints', '>=', 0), limit(200));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ ...(d.data() as WalletAccount), uid: d.id }));
      items.sort((a, b) => (b.availablePoints || 0) - (a.availablePoints || 0));
      callback(items);
    },
    (err) => logFirestoreListenerError(err, OperationType.LIST, 'wallets')
  );
}

export function subscribeMyWalletTransactions(
  uid: string,
  callback: (txs: WalletTransaction[]) => void
): Unsubscribe {
  const q = query(collection(db, 'wallet_transactions'), where('uid', '==', uid), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<WalletTransaction, 'id'>),
      }));
      callback(sortByTimestampDesc(items, 'createdAt'));
    },
    (err) => logFirestoreListenerError(err, OperationType.LIST, `wallet_transactions/${uid}`)
  );
}

export function subscribeAllWalletTransactionsAdmin(
  callback: (txs: WalletTransaction[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'wallet_transactions'),
    where('direction', 'in', ['credit', 'debit']),
    limit(200)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<WalletTransaction, 'id'>),
      }));
      callback(sortByTimestampDesc(items, 'createdAt'));
    },
    (err) => logFirestoreListenerError(err, OperationType.LIST, 'wallet_transactions')
  );
}

export function subscribeMyInvitations(
  uid: string,
  callback: (invitations: InvitationRecord[]) => void
): Unsubscribe {
  const q = query(collection(db, 'invitations'), where('ownerUid', '==', uid), limit(20));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ ...(d.data() as InvitationRecord), code: d.id }));
      items.sort((a, b) => (a.kind === 'personal' ? -1 : b.kind === 'personal' ? 1 : 0));
      callback(items);
    },
    (err) => logFirestoreListenerError(err, OperationType.LIST, `invitations/${uid}`)
  );
}

export function subscribeAllInvitationsAdmin(
  callback: (invitations: InvitationRecord[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'invitations'),
    where('kind', 'in', ['personal', 'admin']),
    limit(200)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ ...(d.data() as InvitationRecord), code: d.id }));
      items.sort((a, b) => (b.qualifiedReferralsCount || 0) - (a.qualifiedReferralsCount || 0));
      callback(items);
    },
    (err) => logFirestoreListenerError(err, OperationType.LIST, 'invitations')
  );
}

export function subscribeMyReferralClaims(
  inviterUid: string,
  callback: (claims: ReferralClaim[]) => void
): Unsubscribe {
  const q = query(collection(db, 'referral_claims'), where('inviterUid', '==', inviterUid), limit(150));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ReferralClaim, 'id'>),
      }));
      callback(sortByTimestampDesc(items, 'registeredAt'));
    },
    (err) => logFirestoreListenerError(err, OperationType.LIST, `referral_claims/inviter/${inviterUid}`)
  );
}

export function subscribeAllReferralClaimsAdmin(
  callback: (claims: ReferralClaim[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'referral_claims'),
    where('status', 'in', ['pending', 'qualified', 'flagged', 'rejected']),
    limit(200)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ReferralClaim, 'id'>),
      }));
      callback(sortByTimestampDesc(items, 'registeredAt'));
    },
    (err) => logFirestoreListenerError(err, OperationType.LIST, 'referral_claims')
  );
}

export function subscribeFraudAlertsAdmin(
  callback: (alerts: ReferralFraudAlert[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'referral_fraud_alerts'),
    where('status', 'in', ['open', 'dismissed', 'confirmed_fraud']),
    limit(150)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReferralFraudAlert, 'id'>) }));
      items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      callback(items);
    },
    (err) => logFirestoreListenerError(err, OperationType.LIST, 'referral_fraud_alerts')
  );
}

export function subscribeTasks(callback: (tasks: TaskItem[]) => void): Unsubscribe {
  const q = query(collection(db, 'tasks'), where('freeToParticipate', '==', true), limit(150));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TaskItem, 'id'>) }));
      items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      callback(items);
    },
    (err) => logFirestoreListenerError(err, OperationType.LIST, 'tasks')
  );
}

export function subscribeMyTaskSubmissions(
  uid: string,
  callback: (submissions: TaskSubmission[]) => void
): Unsubscribe {
  const q = query(collection(db, 'task_submissions'), where('uid', '==', uid), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<TaskSubmission, 'id'>),
      }));
      callback(sortByTimestampDesc(items, 'createdAt'));
    },
    (err) => logFirestoreListenerError(err, OperationType.LIST, `task_submissions/${uid}`)
  );
}

export function subscribeAllTaskSubmissionsAdmin(
  callback: (submissions: TaskSubmission[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'task_submissions'),
    where('status', 'in', ['pending', 'approved', 'rejected']),
    limit(200)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<TaskSubmission, 'id'>),
      }));
      callback(sortByTimestampDesc(items, 'createdAt'));
    },
    (err) => logFirestoreListenerError(err, OperationType.LIST, 'task_submissions')
  );
}

export function subscribeMyWithdrawals(
  uid: string,
  callback: (items: WithdrawalRequest[]) => void
): Unsubscribe {
  const q = query(collection(db, 'withdrawal_requests'), where('uid', '==', uid), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<WithdrawalRequest, 'id'>),
      }));
      callback(sortByTimestampDesc(items, 'createdAt'));
    },
    (err) => logFirestoreListenerError(err, OperationType.LIST, `withdrawal_requests/${uid}`)
  );
}

export function subscribeAllWithdrawalsAdmin(
  callback: (items: WithdrawalRequest[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'withdrawal_requests'),
    where('status', 'in', ['pending', 'under_review', 'approved', 'rejected', 'processing', 'paid']),
    limit(200)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<WithdrawalRequest, 'id'>),
      }));
      callback(sortByTimestampDesc(items, 'createdAt'));
    },
    (err) => logFirestoreListenerError(err, OperationType.LIST, 'withdrawal_requests')
  );
}

export async function getWithdrawalPrivateBankDetailsAdmin(
  withdrawalId: string
): Promise<WithdrawalPrivatePII | null> {
  const snap = await getDoc(doc(db, 'withdrawal_private', withdrawalId));
  if (!snap.exists()) return null;
  return snap.data() as WithdrawalPrivatePII;
}

// --- Invitations & Referral Claims ---

export async function ensurePersonalInvitationCode(user: UserProfile): Promise<InvitationRecord | null> {
  if (!auth.currentUser || !user?.uid) return null;
  const existingQ = query(
    collection(db, 'invitations'),
    where('ownerUid', '==', user.uid),
    limit(20)
  );
  const existingSnap = await getDocs(existingQ);
  const personalDoc = existingSnap.docs.find((d) => d.data().kind === 'personal');
  if (personalDoc) {
    return { ...(personalDoc.data() as InvitationRecord), code: personalDoc.id };
  }

  let candidateCode = generateInviteCode(user.username || user.displayName || user.uid);
  const collisionCheck = await getDoc(doc(db, 'invitations', candidateCode));
  if (collisionCheck.exists()) {
    candidateCode = generateInviteCode(`${user.username || 'NX'}${user.uid.slice(0, 3)}`);
  }

  const record: Omit<InvitationRecord, 'createdAt' | 'updatedAt'> & {
    createdAt: ReturnType<typeof serverTimestamp>;
    updatedAt: ReturnType<typeof serverTimestamp>;
  } = {
    code: candidateCode,
    ownerUid: user.uid,
    ownerName: sanitizeString(user.displayName || user.username, 80),
    ownerUsername: sanitizeString(user.username || 'member', 30),
    kind: 'personal',
    label: 'Personal Referral Link',
    active: true,
    totalRegistrations: 0,
    qualifiedReferralsCount: 0,
    milestonesAwarded: 0,
    pointsEarned: 0,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'invitations', candidateCode), record);
  const saved = await getDoc(doc(db, 'invitations', candidateCode));
  return saved.exists() ? ({ ...(saved.data() as InvitationRecord), code: saved.id }) : null;
}

export async function createAdminInvitationCode(
  actor: UserProfile,
  roleDoc: PlatformRole | null,
  params: { label: string; customCode?: string }
): Promise<InvitationRecord> {
  if (!isActorRewardsAdmin(actor, roleDoc)) {
    throw new Error('Only authorized administrators or the Owner can generate campaign invitation links.');
  }
  const cleanLabel = sanitizeString(params.label, 80);
  if (cleanLabel.length < 2) {
    throw new Error('Please enter a campaign label (at least 2 characters).');
  }

  const code = params.customCode?.trim()
    ? sanitizeInviteCode(params.customCode)
    : generateInviteCode(`ADM_${cleanLabel}`);
  if (code.length < 3 || code.length > 24) {
    throw new Error('Invitation code must be 3-24 uppercase letters, numbers, underscores, or hyphens.');
  }

  const ref = doc(db, 'invitations', code);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    throw new Error(`Invitation code ${code} is already in use. Please choose another.`);
  }

  await setDoc(ref, {
    code,
    ownerUid: actor.uid,
    ownerName: sanitizeString(actor.displayName || actor.username, 80),
    ownerUsername: sanitizeString(actor.username || 'admin', 30),
    kind: 'admin',
    label: cleanLabel,
    active: true,
    totalRegistrations: 0,
    qualifiedReferralsCount: 0,
    milestonesAwarded: 0,
    pointsEarned: 0,
    createdBy: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await recordAuditLog({
    actor,
    actorRole: roleDoc?.role || 'administrator',
    action: 'create_admin_invitation_link',
    category: 'rewards',
    targetType: 'invitation',
    targetId: code,
    targetLabel: cleanLabel,
    details: `Created admin invitation link ${code}`,
  });

  const saved = await getDoc(ref);
  return { ...(saved.data() as InvitationRecord), code: saved.id };
}

export async function toggleInvitationActive(
  actor: UserProfile,
  roleDoc: PlatformRole | null,
  code: string,
  active: boolean
): Promise<void> {
  const ref = doc(db, 'invitations', code);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Invitation code not found.');
  const existing = snap.data() as InvitationRecord;
  if (existing.ownerUid !== actor.uid && !isActorRewardsAdmin(actor, roleDoc)) {
    throw new Error('You do not have permission to update this invitation code.');
  }

  await setDoc(
    ref,
    {
      active,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  if (isActorRewardsAdmin(actor, roleDoc)) {
    await recordAuditLog({
      actor,
      actorRole: roleDoc?.role || 'administrator',
      action: active ? 'enable_invitation_link' : 'disable_invitation_link',
      category: 'rewards',
      targetType: 'invitation',
      targetId: code,
      targetLabel: existing.label || code,
    });
  }
}

export async function claimPendingReferralForCurrentUser(
  user: UserProfile,
  explicitCode?: string
): Promise<{ claimed: boolean; status?: string; message: string }> {
  const rawCode = explicitCode?.trim() || getPendingReferralCode();
  const cleanCode = sanitizeInviteCode(rawCode);
  if (!cleanCode || cleanCode.length < 3) {
    return { claimed: false, message: 'No referral code present.' };
  }

  const deviceHash = await computeClientDeviceHash();

  try {
    const fn = httpsCallable<
      { invitationCode: string; deviceHash?: string },
      { ok: boolean; duplicate?: boolean; status?: string; message?: string }
    >(functions, 'claimReferral');
    const result = await fn({ invitationCode: cleanCode, deviceHash });
    clearPendingReferralCode();
    return {
      claimed: true,
      status: result.data.status || 'qualified',
      message: result.data.message || 'Referral attribution recorded.',
    };
  } catch (err) {
    if (!isCallableUnavailableError(err)) {
      const msg = err instanceof Error ? err.message : 'Unable to apply referral code.';
      clearPendingReferralCode();
      return { claimed: false, message: msg };
    }
  }

  // Fallback when Cloud Functions aren't deployed locally: record pending referral claim under hardened rules
  const existingClaim = await getDoc(doc(db, 'referral_claims', user.uid));
  if (existingClaim.exists()) {
    clearPendingReferralCode();
    return { claimed: false, message: 'A referral attribution already exists for this account.' };
  }

  const invSnap = await getDoc(doc(db, 'invitations', cleanCode));
  if (!invSnap.exists()) {
    clearPendingReferralCode();
    return { claimed: false, message: 'Invitation code was not found.' };
  }
  const invitation = invSnap.data() as InvitationRecord;
  if (!invitation.active) {
    clearPendingReferralCode();
    return { claimed: false, message: 'This invitation link is currently inactive.' };
  }
  if (invitation.ownerUid === user.uid) {
    clearPendingReferralCode();
    return { claimed: false, message: 'Self-referrals are blocked and cannot earn Key Points.' };
  }

  const fraudCheck = evaluateReferralFraudSignals({
    inviteeUid: user.uid,
    inviterUid: invitation.ownerUid,
    inviteeEmail: auth.currentUser?.email || '',
    inviteeVerified: Boolean(auth.currentUser?.emailVerified || auth.currentUser?.phoneNumber),
    inviteeDeviceHash: deviceHash,
  });

  await setDoc(doc(db, 'referral_claims', user.uid), {
    inviteeUid: user.uid,
    inviteeName: sanitizeString(user.displayName || user.username, 80),
    inviteeUsername: sanitizeString(user.username || 'member', 30),
    inviterUid: invitation.ownerUid,
    inviterName: sanitizeString(invitation.ownerName, 80),
    inviterUsername: sanitizeString(invitation.ownerUsername, 30),
    invitationCode: cleanCode,
    status: 'pending',
    rewardStatus: 'uncounted',
    fraudScore: fraudCheck.fraudScore,
    fraudSignals: fraudCheck.signals,
    ...(deviceHash ? { deviceHash } : {}),
    registeredAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  clearPendingReferralCode();
  return {
    claimed: true,
    status: 'pending',
    message: 'Referral linked and pending verification screening.',
  };
}

export async function reviewReferralClaimAdmin(
  actor: UserProfile,
  roleDoc: PlatformRole | null,
  claimId: string,
  decision: 'qualified' | 'rejected'
): Promise<void> {
  if (!isActorRewardsAdmin(actor, roleDoc)) {
    throw new Error('Only authorized administrators or the Owner can verify referral claims.');
  }

  let inviterUidToNotify = '';
  let milestonePointsAwarded = 0;
  let inviteeUsername = '';

  await runTransaction(db, async (tx) => {
    const claimRef = doc(db, 'referral_claims', claimId);
    const claimSnap = await tx.get(claimRef);
    if (!claimSnap.exists()) throw new Error('Referral claim not found.');
    const claim = claimSnap.data() as ReferralClaim;
    if (claim.status === 'qualified' || claim.rewardStatus === 'milestone_paid') {
      throw new Error('This referral has already been qualified and counted.');
    }

    inviteeUsername = claim.inviteeUsername;
    inviterUidToNotify = claim.inviterUid;

    if (decision === 'rejected') {
      tx.update(claimRef, {
        status: 'rejected',
        rewardStatus: 'blocked',
        updatedAt: serverTimestamp(),
      });
      return;
    }

    if (claim.inviteeUid === claim.inviterUid) {
      throw new Error('Self-referrals are permanently blocked.');
    }

    const invRef = doc(db, 'invitations', claim.invitationCode);
    const invSnap = await tx.get(invRef);
    const cfgSnap = await tx.get(doc(db, 'rewards_config', 'global'));
    const cfg = cfgSnap.exists() ? (cfgSnap.data() as RewardsConfig) : DEFAULT_REWARDS_CONFIG;
    const referralsPerPoint = cfg.referralsPerPoint || 10;
    const pointsPerMilestone = cfg.pointsPerMilestone || 1;

    const currentQualified = invSnap.exists()
      ? Number(invSnap.data().qualifiedReferralsCount || 0)
      : 0;
    const currentMilestones = invSnap.exists()
      ? Number(invSnap.data().milestonesAwarded || 0)
      : 0;
    const nextQualified = currentQualified + 1;
    const calc = calculateReferralMilestonesToAward(
      nextQualified,
      currentMilestones,
      referralsPerPoint
    );
    const awardedPoints = calc.newMilestonesToCredit * pointsPerMilestone;
    milestonePointsAwarded = awardedPoints;

    const walletRef = doc(db, 'wallets', claim.inviterUid);
    const walletSnap = await tx.get(walletRef);
    const wallet = walletSnap.exists()
      ? (walletSnap.data() as WalletAccount)
      : emptyWalletAccount(claim.inviterUid);

    tx.update(claimRef, {
      status: 'qualified',
      rewardStatus: awardedPoints > 0 ? 'milestone_paid' : 'counted',
      qualifiedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (invSnap.exists()) {
      tx.update(invRef, {
        totalRegistrations: Number(invSnap.data().totalRegistrations || 0) + 1,
        qualifiedReferralsCount: nextQualified,
        milestonesAwarded: calc.totalEarnedMilestones,
        pointsEarned: Number(invSnap.data().pointsEarned || 0) + awardedPoints,
        updatedAt: serverTimestamp(),
      });
    }

    if (awardedPoints > 0) {
      const nextAvailable = Number(wallet.availablePoints || 0) + awardedPoints;
      tx.set(
        walletRef,
        {
          uid: claim.inviterUid,
          availablePoints: nextAvailable,
          pendingPoints: Number(wallet.pendingPoints || 0),
          lockedPoints: Number(wallet.lockedPoints || 0),
          lifetimeEarnedPoints: Number(wallet.lifetimeEarnedPoints || 0) + awardedPoints,
          lifetimeWithdrawnPoints: Number(wallet.lifetimeWithdrawnPoints || 0),
          lifetimeWithdrawnNaira: Number(wallet.lifetimeWithdrawnNaira || 0),
          frozen: wallet.frozen === true,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      const txId = `ref_milestone_${claim.inviterUid}_${calc.totalEarnedMilestones}`;
      tx.set(doc(db, 'wallet_transactions', txId), {
        uid: claim.inviterUid,
        type: 'referral_milestone',
        direction: 'credit',
        points: awardedPoints,
        nairaEquivalent: computeConvertedNaira(awardedPoints, cfg.pointRateNaira),
        pointRateNaira: cfg.pointRateNaira ?? null,
        referenceId: claimId,
        description: `Referral milestone reached (${nextQualified} qualified referrals)`,
        actorUid: actor.uid,
        balanceAfterAvailable: nextAvailable,
        createdAt: serverTimestamp(),
      });
    }
  });

  await recordAuditLog({
    actor,
    actorRole: roleDoc?.role || 'administrator',
    action: `referral_claim_${decision}`,
    category: 'rewards',
    targetType: 'referral_claim',
    targetId: claimId,
    targetLabel: `@${inviteeUsername}`,
    details:
      decision === 'qualified'
        ? `Qualified referral${milestonePointsAwarded > 0 ? ` (+${milestonePointsAwarded} Key Point milestone)` : ''}`
        : 'Rejected referral claim under anti-fraud review',
  });

  if (decision === 'qualified' && milestonePointsAwarded > 0 && inviterUidToNotify) {
    await dispatchDualNotification({
      recipientUid: inviterUidToNotify,
      actor: { uid: actor.uid, displayName: actor.displayName, avatarUrl: actor.avatarUrl },
      type: 'referral_reward',
      category: 'rewards',
      title: `+${milestonePointsAwarded} Key Point Earned!`,
      targetType: 'wallet',
      targetId: inviterUidToNotify,
      inAppPreview: `You reached a 10-referral milestone and earned +${milestonePointsAwarded} Key Point.`,
      emailSubject: 'You earned a Nexora Key Point referral milestone!',
      emailBodyText: `Great news! Your verified referrals reached a new milestone and +${milestonePointsAwarded} Key Point has been credited to your Nexora Wallet.`,
      ctaLabel: 'Open Nexora Wallet',
      ctaUrl: '/',
      allowSelfInApp: true,
    });
  }
}

export async function reviewFraudAlertAdmin(
  actor: UserProfile,
  roleDoc: PlatformRole | null,
  alertId: string,
  status: 'dismissed' | 'confirmed_fraud',
  reviewNote: string
): Promise<void> {
  if (!isActorRewardsAdmin(actor, roleDoc)) {
    throw new Error('Only authorized administrators or the Owner can review fraud alerts.');
  }

  const alertRef = doc(db, 'referral_fraud_alerts', alertId);
  const snap = await getDoc(alertRef);
  if (!snap.exists()) throw new Error('Fraud alert not found.');
  const alert = snap.data() as ReferralFraudAlert;

  const batch = writeBatch(db);
  batch.update(alertRef, {
    status,
    reviewedBy: actor.uid,
    reviewNote: sanitizeString(reviewNote, 300),
    updatedAt: serverTimestamp(),
  });

  if (status === 'confirmed_fraud' && alert.claimId) {
    batch.update(doc(db, 'referral_claims', alert.claimId), {
      status: 'rejected',
      rewardStatus: 'blocked',
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();

  await recordAuditLog({
    actor,
    actorRole: roleDoc?.role || 'administrator',
    action: `referral_fraud_${status}`,
    category: 'rewards',
    targetType: 'referral_fraud_alert',
    targetId: alertId,
    details: reviewNote || status,
  });
}

// --- Free Tasks & Verification ---

export async function seedStarterTasksIfEmpty(user: UserProfile): Promise<number> {
  if (!auth.currentUser || !user?.uid || user.suspended) return 0;
  try {
    const existingSnap = await getDocs(
      query(collection(db, 'tasks'), where('freeToParticipate', '==', true), limit(1))
    );
    if (!existingSnap.empty) return 0;

    let seededCount = 0;
    for (const starter of STARTER_FREE_TASKS) {
      const taskRef = doc(db, 'tasks', starter.id);
      const docSnap = await getDoc(taskRef);
      if (docSnap.exists()) continue;
      await setDoc(taskRef, {
        title: starter.title,
        description: starter.description,
        category: starter.category,
        rewardPoints: starter.rewardPoints,
        freeToParticipate: true,
        active: true,
        maxCompletionsPerUser: starter.maxCompletionsPerUser,
        proofInstructions: starter.proofInstructions,
        actionUrl: starter.actionUrl,
        submissionsCount: 0,
        approvedCount: 0,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      seededCount += 1;
    }
    return seededCount;
  } catch {
    return 0;
  }
}

export async function seedStarterTasksAdmin(
  actor: UserProfile,
  roleDoc: PlatformRole | null
): Promise<number> {
  if (!isActorRewardsAdmin(actor, roleDoc)) {
    throw new Error('Only authorized administrators or the Owner can seed starter tasks.');
  }

  let seededCount = 0;
  for (const starter of STARTER_FREE_TASKS) {
    const taskRef = doc(db, 'tasks', starter.id);
    const docSnap = await getDoc(taskRef);
    if (docSnap.exists()) continue;
    await setDoc(taskRef, {
      title: starter.title,
      description: starter.description,
      category: starter.category,
      rewardPoints: starter.rewardPoints,
      freeToParticipate: true,
      active: true,
      maxCompletionsPerUser: starter.maxCompletionsPerUser,
      proofInstructions: starter.proofInstructions,
      actionUrl: starter.actionUrl,
      submissionsCount: 0,
      approvedCount: 0,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    seededCount += 1;
  }

  if (seededCount > 0) {
    await recordAuditLog({
      actor,
      actorRole: roleDoc?.role || 'administrator',
      action: 'seed_starter_tasks',
      category: 'rewards',
      targetType: 'task',
      targetId: 'starter_free_tasks',
      targetLabel: `${seededCount} starter task(s)`,
      details: `Seeded ${seededCount} free starter reward tasks`,
    });
  }

  return seededCount;
}

export async function createOrUpdateTaskAdmin(
  actor: UserProfile,
  roleDoc: PlatformRole | null,
  payload: {
    id?: string;
    title: string;
    description: string;
    category: TaskItem['category'];
    rewardPoints: number;
    active: boolean;
    maxCompletionsPerUser: number;
    proofInstructions: string;
    actionUrl?: string;
  }
): Promise<string> {
  if (!isActorRewardsAdmin(actor, roleDoc)) {
    throw new Error('Only authorized administrators or the Owner can create or manage tasks.');
  }

  const title = sanitizeString(payload.title, 120);
  const description = sanitizeString(payload.description, 800);
  const proofInstructions = sanitizeString(payload.proofInstructions, 400);
  const actionUrl = sanitizeString(payload.actionUrl || '', 300);

  if (title.length < 3 || description.length < 5 || proofInstructions.length < 3) {
    throw new Error('Task title, description, and proof instructions are required.');
  }
  if (!Number.isFinite(payload.rewardPoints) || payload.rewardPoints <= 0) {
    throw new Error('Reward Key Points must be greater than zero.');
  }

  const combinedLower = `${title} ${description} ${proofInstructions}`.toLowerCase();
  if (
    combinedLower.includes('deposit') ||
    combinedLower.includes('buy subscription') ||
    combinedLower.includes('pay fee')
  ) {
    throw new Error('All Nexora tasks must be 100% free — never require deposits or paid subscriptions.');
  }

  if (payload.id) {
    const taskRef = doc(db, 'tasks', payload.id);
    const snap = await getDoc(taskRef);
    if (!snap.exists()) throw new Error('Task not found.');
    const existing = snap.data() as TaskItem;
    await setDoc(
      taskRef,
      {
        title,
        description,
        category: payload.category,
        rewardPoints: Number(payload.rewardPoints),
        freeToParticipate: true,
        active: payload.active,
        maxCompletionsPerUser: Math.max(1, Math.min(10, Math.floor(payload.maxCompletionsPerUser || 1))),
        proofInstructions,
        actionUrl,
        submissionsCount: existing.submissionsCount || 0,
        approvedCount: existing.approvedCount || 0,
        createdBy: existing.createdBy,
        createdAt: existing.createdAt,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    await recordAuditLog({
      actor,
      actorRole: roleDoc?.role || 'administrator',
      action: 'update_reward_task',
      category: 'rewards',
      targetType: 'task',
      targetId: payload.id,
      targetLabel: title,
    });
    return payload.id;
  }

  const newRef = doc(collection(db, 'tasks'));
  await setDoc(newRef, {
    title,
    description,
    category: payload.category,
    rewardPoints: Number(payload.rewardPoints),
    freeToParticipate: true,
    active: payload.active,
    maxCompletionsPerUser: Math.max(1, Math.min(10, Math.floor(payload.maxCompletionsPerUser || 1))),
    proofInstructions,
    actionUrl,
    submissionsCount: 0,
    approvedCount: 0,
    createdBy: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await recordAuditLog({
    actor,
    actorRole: roleDoc?.role || 'administrator',
    action: 'create_reward_task',
    category: 'rewards',
    targetType: 'task',
    targetId: newRef.id,
    targetLabel: title,
    details: `Reward: ${payload.rewardPoints} KP (strictly free)`,
  });

  return newRef.id;
}

export async function submitFreeTaskProof(
  user: UserProfile,
  task: TaskItem,
  proofText: string,
  proofUrl?: string
): Promise<string> {
  if (!task.freeToParticipate) {
    throw new Error('This task does not meet free participation requirements.');
  }
  if (!task.active) {
    throw new Error('This task is currently closed.');
  }
  const cleanProof = sanitizeString(proofText, 1000);
  if (cleanProof.length < 3) {
    throw new Error('Please describe or paste proof of completion (at least 3 characters).');
  }
  const cleanUrl = sanitizeString(proofUrl || '', 400);

  try {
    const fn = httpsCallable<
      { taskId: string; proofText: string; proofUrl?: string },
      { ok: boolean; submissionId: string }
    >(functions, 'submitTaskEntry');
    const res = await fn({ taskId: task.id, proofText: cleanProof, proofUrl: cleanUrl || undefined });
    return res.data.submissionId;
  } catch (err) {
    if (!isCallableUnavailableError(err)) {
      throw err;
    }
  }

  const submissionId = `${task.id}_${user.uid}`;
  const subRef = doc(db, 'task_submissions', submissionId);
  const existing = await getDoc(subRef);
  if (existing.exists()) {
    throw new Error('You have already submitted proof for this task.');
  }

  await setDoc(subRef, {
    taskId: task.id,
    taskTitle: sanitizeString(task.title, 120),
    uid: user.uid,
    userDisplayName: sanitizeString(user.displayName || user.username, 80),
    userUsername: sanitizeString(user.username || 'member', 30),
    proofText: cleanProof,
    ...(cleanUrl ? { proofUrl: cleanUrl } : {}),
    rewardPoints: task.rewardPoints,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return submissionId;
}

export async function reviewTaskSubmissionAdmin(
  actor: UserProfile,
  roleDoc: PlatformRole | null,
  submissionId: string,
  decision: 'approved' | 'rejected',
  reviewerNote = ''
): Promise<void> {
  if (!isActorRewardsAdmin(actor, roleDoc)) {
    throw new Error('Only authorized administrators or the Owner can verify task submissions.');
  }

  try {
    const fn = httpsCallable<
      { submissionId: string; decision: 'approved' | 'rejected'; reviewerNote?: string },
      { ok: boolean; status: string }
    >(functions, 'reviewTaskSubmission');
    await fn({ submissionId, decision, reviewerNote });
    return;
  } catch (err) {
    if (!isCallableUnavailableError(err)) {
      throw err;
    }
  }

  const isOwner = isActorPlatformOwner(roleDoc);
  let targetUid = '';
  let taskTitle = '';
  let rewardPoints = 0;

  await runTransaction(db, async (tx) => {
    const subRef = doc(db, 'task_submissions', submissionId);
    const subSnap = await tx.get(subRef);
    if (!subSnap.exists()) throw new Error('Task submission not found.');
    const sub = subSnap.data() as TaskSubmission;

    if (sub.status !== 'pending') {
      throw new Error(`Submission has already been ${sub.status}.`);
    }
    if (sub.uid === actor.uid && !isOwner) {
      throw new Error('Administrators cannot approve their own task submissions.');
    }

    targetUid = sub.uid;
    taskTitle = sub.taskTitle;
    rewardPoints = Number(sub.rewardPoints || 0);

    const taskRef = doc(db, 'tasks', sub.taskId);
    const taskSnap = await tx.get(taskRef);
    const cfgSnap = await tx.get(doc(db, 'rewards_config', 'global'));
    const cfg = cfgSnap.exists() ? (cfgSnap.data() as RewardsConfig) : DEFAULT_REWARDS_CONFIG;

    const walletRef = doc(db, 'wallets', sub.uid);
    const walletSnap = await tx.get(walletRef);
    const wallet = walletSnap.exists()
      ? (walletSnap.data() as WalletAccount)
      : emptyWalletAccount(sub.uid);

    tx.update(subRef, {
      status: decision,
      reviewerUid: actor.uid,
      reviewerNote: sanitizeString(reviewerNote, 300),
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (taskSnap.exists()) {
      tx.update(taskRef, {
        submissionsCount: Number(taskSnap.data().submissionsCount || 0) + 1,
        approvedCount:
          decision === 'approved'
            ? Number(taskSnap.data().approvedCount || 0) + 1
            : Number(taskSnap.data().approvedCount || 0),
        updatedAt: serverTimestamp(),
      });
    }

    if (decision === 'approved' && rewardPoints > 0) {
      const nextAvailable = Number(wallet.availablePoints || 0) + rewardPoints;
      tx.set(
        walletRef,
        {
          uid: sub.uid,
          availablePoints: nextAvailable,
          pendingPoints: Number(wallet.pendingPoints || 0),
          lockedPoints: Number(wallet.lockedPoints || 0),
          lifetimeEarnedPoints: Number(wallet.lifetimeEarnedPoints || 0) + rewardPoints,
          lifetimeWithdrawnPoints: Number(wallet.lifetimeWithdrawnPoints || 0),
          lifetimeWithdrawnNaira: Number(wallet.lifetimeWithdrawnNaira || 0),
          frozen: wallet.frozen === true,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      tx.set(doc(db, 'wallet_transactions', `task_reward_${submissionId}`), {
        uid: sub.uid,
        type: 'task_reward',
        direction: 'credit',
        points: rewardPoints,
        nairaEquivalent: computeConvertedNaira(rewardPoints, cfg.pointRateNaira),
        pointRateNaira: cfg.pointRateNaira ?? null,
        referenceId: submissionId,
        description: `Approved free task: ${sub.taskTitle}`,
        actorUid: actor.uid,
        balanceAfterAvailable: nextAvailable,
        createdAt: serverTimestamp(),
      });
    }
  });

  await recordAuditLog({
    actor,
    actorRole: roleDoc?.role || 'administrator',
    action: `task_submission_${decision}`,
    category: 'rewards',
    targetType: 'task_submission',
    targetId: submissionId,
    targetLabel: taskTitle,
    details: reviewerNote || `${decision} (${rewardPoints} KP)`,
  });

  if (targetUid) {
    await dispatchDualNotification({
      recipientUid: targetUid,
      actor: { uid: actor.uid, displayName: actor.displayName, avatarUrl: actor.avatarUrl },
      type: 'task_reward',
      category: 'rewards',
      title: decision === 'approved' ? `+${rewardPoints} Key Points Credited` : 'Task Submission Update',
      targetType: decision === 'approved' ? 'wallet' : 'tasks',
      targetId: submissionId,
      inAppPreview:
        decision === 'approved'
          ? `Your submission for "${taskTitle}" was approved (+${rewardPoints} Key Points).`
          : `Your submission for "${taskTitle}" was rejected${reviewerNote ? `: ${reviewerNote}` : '.'}`,
      emailSubject:
        decision === 'approved'
          ? `Task Approved: +${rewardPoints} Key Points`
          : `Task Submission Rejected: ${taskTitle}`,
      emailBodyText:
        decision === 'approved'
          ? `Your proof for "${taskTitle}" has been verified and +${rewardPoints} Key Points have been added to your Nexora Wallet.`
          : `Your submission for "${taskTitle}" was not approved${reviewerNote ? `: ${reviewerNote}` : '.'}`,
      ctaLabel: 'View Wallet & Tasks',
      ctaUrl: '/',
      allowSelfInApp: true,
    });
  }
}

// --- Bank Verification & Withdrawals ---

export async function fetchBankProviderStatus(): Promise<BankProviderStatus> {
  try {
    const resp = await fetch('/api/rewards/status');
    if (!resp.ok) throw new Error('Status check failed');
    return (await resp.json()) as BankProviderStatus;
  } catch {
    return {
      configured: false,
      provider: 'none',
      message: 'Unable to check bank provider status right now.',
    };
  }
}

export async function fetchNigerianBanks(): Promise<{
  provider: BankProviderStatus['provider'];
  configured: boolean;
  banks: NigerianBankInfo[];
}> {
  const resp = await fetch('/api/rewards/banks');
  if (!resp.ok) {
    throw new Error('Unable to load Nigerian banks directory right now.');
  }
  return (await resp.json()) as {
    provider: BankProviderStatus['provider'];
    configured: boolean;
    banks: NigerianBankInfo[];
  };
}

export async function verifyNigerianBankAccount(
  accountNumber: string,
  bankCode: string
): Promise<BankAccountResolution> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in first to verify a bank account.');
  }
  const token = await currentUser.getIdToken();
  const resp = await fetch('/api/rewards/resolve-bank', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ accountNumber, bankCode }),
  });
  const data = (await resp.json().catch(() => ({}))) as BankAccountResolution & { error?: string };
  if (!resp.ok) {
    throw new Error(data.error || 'Bank account verification failed.');
  }
  return data;
}

export async function submitBankWithdrawalRequest(
  user: UserProfile,
  roleDoc: PlatformRole | null,
  params: {
    pointsRequested: number;
    bankName: string;
    bankCode: string;
    accountNumber: string;
    accountHolderName: string;
    accountVerificationStatus: WithdrawalRequest['accountVerificationStatus'];
    verificationProvider: WithdrawalRequest['verificationProvider'];
    providerResponseSummary?: string;
    wallet: WalletAccount;
    config: RewardsConfig;
  }
): Promise<{ withdrawalId: string; nairaAmount: number }> {
  const eligibility = validateWithdrawalEligibility({
    pointsRequested: params.pointsRequested,
    availablePoints: params.wallet.availablePoints,
    frozen: params.wallet.frozen,
    config: params.config,
  });
  if (!eligibility.ok || eligibility.nairaAmount === null) {
    throw new Error(eligibility.error || 'Withdrawal request does not meet eligibility criteria.');
  }

  const digits = params.accountNumber.replace(/\D/g, '');
  if (!/^\d{10}$/.test(digits)) {
    throw new Error('Please enter a valid 10-digit Nigerian NUBAN account number.');
  }
  const holderName = sanitizeString(params.accountHolderName, 120);
  if (holderName.length < 2) {
    throw new Error('Please enter the bank account holder name.');
  }

  try {
    const fn = httpsCallable<
      {
        pointsRequested: number;
        bankName: string;
        bankCode: string;
        accountNumber: string;
        accountHolderName: string;
        accountVerificationStatus: WithdrawalRequest['accountVerificationStatus'];
        verificationProvider: WithdrawalRequest['verificationProvider'];
        providerResponseSummary?: string;
      },
      { ok: boolean; withdrawalId: string; nairaAmount: number }
    >(functions, 'requestWithdrawal');
    const res = await fn({
      pointsRequested: params.pointsRequested,
      bankName: sanitizeString(params.bankName, 100),
      bankCode: sanitizeString(params.bankCode, 20),
      accountNumber: digits,
      accountHolderName: holderName,
      accountVerificationStatus: params.accountVerificationStatus,
      verificationProvider: params.verificationProvider,
      providerResponseSummary: params.providerResponseSummary,
    });
    return { withdrawalId: res.data.withdrawalId, nairaAmount: res.data.nairaAmount };
  } catch (err) {
    if (!isCallableUnavailableError(err)) {
      throw err;
    }
  }

  // Only allow direct atomic client wallet locking when Cloud Functions are unavailable if actor holds admin/owner permissions
  if (!isActorWithdrawalsAdmin(user, roleDoc) && !isActorRewardsAdmin(user, roleDoc)) {
    throw new Error(
      'Server-side Cloud Functions are required to lock wallet balances on member withdrawal requests. Please deploy Firebase Cloud Functions (`firebase deploy --only functions`).'
    );
  }

  const newWdRef = doc(collection(db, 'withdrawal_requests'));
  const withdrawalId = newWdRef.id;
  let computedNaira = 0;

  await runTransaction(db, async (tx) => {
    const cfgSnap = await tx.get(doc(db, 'rewards_config', 'global'));
    if (!cfgSnap.exists()) throw new Error('Rewards configuration has not been initialized yet.');
    const cfg = cfgSnap.data() as RewardsConfig;

    const walletRef = doc(db, 'wallets', user.uid);
    const walletSnap = await tx.get(walletRef);
    const wallet = walletSnap.exists() ? (walletSnap.data() as WalletAccount) : emptyWalletAccount(user.uid);

    const check = validateWithdrawalEligibility({
      pointsRequested: params.pointsRequested,
      availablePoints: wallet.availablePoints,
      frozen: wallet.frozen,
      config: cfg,
    });
    if (!check.ok || check.nairaAmount === null || typeof cfg.pointRateNaira !== 'number') {
      throw new Error(check.error || 'Withdrawal validation failed.');
    }

    computedNaira = check.nairaAmount;
    const nextAvailable = Number(wallet.availablePoints) - params.pointsRequested;
    const nextLocked = Number(wallet.lockedPoints || 0) + params.pointsRequested;

    tx.set(
      walletRef,
      {
        uid: user.uid,
        availablePoints: nextAvailable,
        pendingPoints: Number(wallet.pendingPoints || 0),
        lockedPoints: nextLocked,
        lifetimeEarnedPoints: Number(wallet.lifetimeEarnedPoints || 0),
        lifetimeWithdrawnPoints: Number(wallet.lifetimeWithdrawnPoints || 0),
        lifetimeWithdrawnNaira: Number(wallet.lifetimeWithdrawnNaira || 0),
        frozen: wallet.frozen === true,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    tx.set(newWdRef, {
      uid: user.uid,
      userDisplayName: sanitizeString(user.displayName || user.username, 80),
      userUsername: sanitizeString(user.username || 'member', 30),
      pointsRequested: params.pointsRequested,
      pointRateNaira: cfg.pointRateNaira,
      nairaAmount: computedNaira,
      bankName: sanitizeString(params.bankName, 100),
      bankCode: sanitizeString(params.bankCode, 20),
      accountNumberMasked: maskBankAccountNumber(digits),
      accountHolderName: holderName,
      accountVerificationStatus: params.accountVerificationStatus,
      verificationProvider: params.verificationProvider,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    tx.set(doc(db, 'withdrawal_private', withdrawalId), {
      withdrawalId,
      uid: user.uid,
      bankName: sanitizeString(params.bankName, 100),
      bankCode: sanitizeString(params.bankCode, 20),
      accountNumber: digits,
      accountHolderName: holderName,
      verificationProvider: params.verificationProvider,
      providerResponseSummary: sanitizeString(params.providerResponseSummary || '', 240),
      createdAt: serverTimestamp(),
    });

    tx.set(doc(db, 'wallet_transactions', `wd_lock_${withdrawalId}`), {
      uid: user.uid,
      type: 'withdrawal_lock',
      direction: 'debit',
      points: params.pointsRequested,
      nairaEquivalent: computedNaira,
      pointRateNaira: cfg.pointRateNaira,
      referenceId: withdrawalId,
      description: `Withdrawal lock to ${sanitizeString(params.bankName, 60)} (${maskBankAccountNumber(digits)})`,
      actorUid: user.uid,
      balanceAfterAvailable: nextAvailable,
      createdAt: serverTimestamp(),
    });
  });

  return { withdrawalId, nairaAmount: computedNaira };
}

export async function transitionWithdrawalStatusAdmin(
  actor: UserProfile,
  roleDoc: PlatformRole | null,
  params: {
    withdrawalId: string;
    nextStatus: WithdrawalStatus;
    paymentReference?: string;
    adminNote?: string;
  }
): Promise<void> {
  if (!isActorWithdrawalsAdmin(actor, roleDoc)) {
    throw new Error('Only authorized payout administrators or the Owner can manage withdrawals.');
  }

  const paymentReference = sanitizeString(params.paymentReference || '', 120);
  const adminNote = sanitizeString(params.adminNote || '', 300);

  if (params.nextStatus === 'paid' && paymentReference.length < 3) {
    throw new Error('A valid bank payout confirmation reference is required before marking Paid.');
  }

  try {
    const fn = httpsCallable<
      {
        withdrawalId: string;
        nextStatus: WithdrawalStatus;
        paymentReference?: string;
        adminNote?: string;
      },
      { ok: boolean; status: WithdrawalStatus }
    >(functions, 'transitionWithdrawalStatus');
    await fn({
      withdrawalId: params.withdrawalId,
      nextStatus: params.nextStatus,
      paymentReference: paymentReference || undefined,
      adminNote: adminNote || undefined,
    });
    return;
  } catch (err) {
    if (!isCallableUnavailableError(err)) {
      throw err;
    }
  }

  let targetUid = '';
  let nairaAmount = 0;
  let pointsRequested = 0;

  await runTransaction(db, async (tx) => {
    const wdRef = doc(db, 'withdrawal_requests', params.withdrawalId);
    const wdSnap = await tx.get(wdRef);
    if (!wdSnap.exists()) throw new Error('Withdrawal request not found.');
    const wd = wdSnap.data() as WithdrawalRequest;

    if (!canTransitionWithdrawalStatus(wd.status, params.nextStatus)) {
      throw new Error(`Invalid status transition from ${wd.status} to ${params.nextStatus}.`);
    }

    targetUid = wd.uid;
    nairaAmount = Number(wd.nairaAmount || 0);
    pointsRequested = Number(wd.pointsRequested || 0);

    const walletRef = doc(db, 'wallets', wd.uid);
    const walletSnap = await tx.get(walletRef);
    const wallet = walletSnap.exists() ? (walletSnap.data() as WalletAccount) : emptyWalletAccount(wd.uid);

    const updateFields: Record<string, unknown> = {
      status: params.nextStatus,
      reviewedBy: actor.uid,
      adminNote,
      updatedAt: serverTimestamp(),
    };

    if (params.nextStatus === 'rejected') {
      const nextAvailable = Number(wallet.availablePoints || 0) + pointsRequested;
      const nextLocked = Math.max(0, Number(wallet.lockedPoints || 0) - pointsRequested);
      tx.set(
        walletRef,
        {
          ...wallet,
          uid: wd.uid,
          availablePoints: nextAvailable,
          lockedPoints: nextLocked,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      tx.set(doc(db, 'wallet_transactions', `wd_refund_${params.withdrawalId}`), {
        uid: wd.uid,
        type: 'withdrawal_refund',
        direction: 'credit',
        points: pointsRequested,
        nairaEquivalent: nairaAmount,
        pointRateNaira: wd.pointRateNaira,
        referenceId: params.withdrawalId,
        description: `Refund for rejected withdrawal: ${adminNote || 'Review declined'}`,
        actorUid: actor.uid,
        balanceAfterAvailable: nextAvailable,
        createdAt: serverTimestamp(),
      });
    } else if (params.nextStatus === 'paid') {
      const nextLocked = Math.max(0, Number(wallet.lockedPoints || 0) - pointsRequested);
      tx.set(
        walletRef,
        {
          ...wallet,
          uid: wd.uid,
          lockedPoints: nextLocked,
          lifetimeWithdrawnPoints: Number(wallet.lifetimeWithdrawnPoints || 0) + pointsRequested,
          lifetimeWithdrawnNaira: Number(wallet.lifetimeWithdrawnNaira || 0) + nairaAmount,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      tx.set(doc(db, 'wallet_transactions', `wd_paid_${params.withdrawalId}`), {
        uid: wd.uid,
        type: 'withdrawal_paid',
        direction: 'debit',
        points: pointsRequested,
        nairaEquivalent: nairaAmount,
        pointRateNaira: wd.pointRateNaira,
        referenceId: paymentReference,
        description: `Bank payout completed (Ref: ${paymentReference})`,
        actorUid: actor.uid,
        balanceAfterAvailable: Number(wallet.availablePoints || 0),
        createdAt: serverTimestamp(),
      });
      updateFields.paymentReference = paymentReference;
      updateFields.paidBy = actor.uid;
      updateFields.paidAt = serverTimestamp();
    }

    tx.update(wdRef, updateFields);
  });

  await recordAuditLog({
    actor,
    actorRole: roleDoc?.role || 'administrator',
    action: `withdrawal_${params.nextStatus}`,
    category: 'wallet',
    targetType: 'withdrawal_request',
    targetId: params.withdrawalId,
    targetLabel: `₦${nairaAmount.toLocaleString('en-NG')}`,
    details: paymentReference ? `Ref: ${paymentReference}` : adminNote || params.nextStatus,
  });

  if (targetUid) {
    await dispatchDualNotification({
      recipientUid: targetUid,
      actor: { uid: actor.uid, displayName: actor.displayName, avatarUrl: actor.avatarUrl },
      type: 'withdrawal_update',
      category: 'rewards',
      title: `Withdrawal ${params.nextStatus.replace('_', ' ').toUpperCase()}`,
      targetType: 'wallet',
      targetId: params.withdrawalId,
      inAppPreview:
        params.nextStatus === 'paid'
          ? `Your ₦${nairaAmount.toLocaleString('en-NG')} payout has been marked Paid (Ref: ${paymentReference}).`
          : params.nextStatus === 'rejected'
          ? `Your withdrawal was rejected and ${pointsRequested} Key Points were refunded.`
          : `Your ₦${nairaAmount.toLocaleString('en-NG')} withdrawal status updated to ${params.nextStatus.replace('_', ' ')}.`,
      emailSubject: `Nexora Withdrawal Update: ${params.nextStatus.replace('_', ' ')}`,
      emailBodyText:
        params.nextStatus === 'paid'
          ? `Your ₦${nairaAmount.toLocaleString('en-NG')} bank payout is complete. Payment Reference: ${paymentReference}.`
          : params.nextStatus === 'rejected'
          ? `Your ₦${nairaAmount.toLocaleString('en-NG')} withdrawal was rejected and ${pointsRequested} Key Points were returned to your available wallet balance.`
          : `Your ₦${nairaAmount.toLocaleString('en-NG')} withdrawal request is now ${params.nextStatus.replace('_', ' ')}.`,
      ctaLabel: 'View Nexora Wallet',
      ctaUrl: '/',
      allowSelfInApp: true,
    });
  }
}

export async function adminCreditOrDebitWallet(
  actor: UserProfile,
  roleDoc: PlatformRole | null,
  params: {
    targetUid: string;
    direction: 'credit' | 'debit';
    points: number;
    reason: string;
  }
): Promise<{ nextAvailablePoints: number }> {
  if (!isActorRewardsAdmin(actor, roleDoc) && !isActorWithdrawalsAdmin(actor, roleDoc)) {
    throw new Error('Administrative rewards permissions required.');
  }
  const cleanReason = sanitizeString(params.reason, 280);
  if (cleanReason.length < 3) {
    throw new Error('A mandatory audit reason (at least 3 characters) is required.');
  }
  if (!Number.isFinite(params.points) || params.points <= 0) {
    throw new Error('Key Points adjustment must be greater than zero.');
  }

  try {
    const fn = httpsCallable<
      { targetUid: string; direction: 'credit' | 'debit'; points: number; reason: string },
      { ok: boolean; nextAvailablePoints: number }
    >(functions, 'adminAdjustWallet');
    const res = await fn({
      targetUid: params.targetUid,
      direction: params.direction,
      points: params.points,
      reason: cleanReason,
    });
    return { nextAvailablePoints: res.data.nextAvailablePoints };
  } catch (err) {
    if (!isCallableUnavailableError(err)) {
      throw err;
    }
  }

  let nextAvailablePoints = 0;

  await runTransaction(db, async (tx) => {
    const cfgSnap = await tx.get(doc(db, 'rewards_config', 'global'));
    const cfg = cfgSnap.exists() ? (cfgSnap.data() as RewardsConfig) : DEFAULT_REWARDS_CONFIG;

    const walletRef = doc(db, 'wallets', params.targetUid);
    const walletSnap = await tx.get(walletRef);
    const wallet = walletSnap.exists()
      ? (walletSnap.data() as WalletAccount)
      : emptyWalletAccount(params.targetUid);

    const currentAvail = Number(wallet.availablePoints || 0);
    if (params.direction === 'debit' && currentAvail < params.points) {
      throw new Error('Cannot debit more Key Points than the user currently has available.');
    }

    nextAvailablePoints =
      params.direction === 'credit' ? currentAvail + params.points : currentAvail - params.points;

    tx.set(
      walletRef,
      {
        uid: params.targetUid,
        availablePoints: nextAvailablePoints,
        pendingPoints: Number(wallet.pendingPoints || 0),
        lockedPoints: Number(wallet.lockedPoints || 0),
        lifetimeEarnedPoints:
          params.direction === 'credit'
            ? Number(wallet.lifetimeEarnedPoints || 0) + params.points
            : Number(wallet.lifetimeEarnedPoints || 0),
        lifetimeWithdrawnPoints: Number(wallet.lifetimeWithdrawnPoints || 0),
        lifetimeWithdrawnNaira: Number(wallet.lifetimeWithdrawnNaira || 0),
        frozen: wallet.frozen === true,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    const txRef = doc(collection(db, 'wallet_transactions'));
    tx.set(txRef, {
      uid: params.targetUid,
      type: params.direction === 'credit' ? 'admin_credit' : 'admin_debit',
      direction: params.direction,
      points: params.points,
      nairaEquivalent: computeConvertedNaira(params.points, cfg.pointRateNaira),
      pointRateNaira: cfg.pointRateNaira ?? null,
      referenceId: txRef.id,
      description: `${params.direction === 'credit' ? 'Admin Credit' : 'Admin Debit'}: ${cleanReason}`,
      actorUid: actor.uid,
      balanceAfterAvailable: nextAvailablePoints,
      createdAt: serverTimestamp(),
    });
  });

  await recordAuditLog({
    actor,
    actorRole: roleDoc?.role || 'administrator',
    action: params.direction === 'credit' ? 'admin_credit_wallet' : 'admin_debit_wallet',
    category: 'wallet',
    targetType: 'wallet',
    targetId: params.targetUid,
    details: `${params.direction === 'credit' ? '+' : '-'}${params.points} KP — ${cleanReason}`,
  });

  await dispatchDualNotification({
    recipientUid: params.targetUid,
    actor: { uid: actor.uid, displayName: actor.displayName, avatarUrl: actor.avatarUrl },
    type: 'wallet_adjustment',
    category: 'rewards',
    title:
      params.direction === 'credit'
        ? `+${params.points} Key Points Credited`
        : `-${params.points} Key Points Adjusted`,
    targetType: 'wallet',
    targetId: params.targetUid,
    inAppPreview: `Your Nexora Wallet was adjusted by ${params.direction === 'credit' ? '+' : '-'}${params.points} KP (${cleanReason}).`,
    emailSubject: 'Nexora Wallet Balance Adjustment',
    emailBodyText: `An administrator adjusted your Nexora Wallet by ${params.direction === 'credit' ? '+' : '-'}${params.points} Key Points. Reason: ${cleanReason}.`,
    ctaLabel: 'View Wallet',
    ctaUrl: '/',
    allowSelfInApp: true,
  });

  return { nextAvailablePoints };
}

export async function updateRewardsConfigAdmin(
  actor: UserProfile,
  roleDoc: PlatformRole | null,
  patch: Partial<
    Pick<
      RewardsConfig,
      | 'withdrawalsOpen'
      | 'pointRateNaira'
      | 'minWithdrawalNaira'
      | 'referralsPerPoint'
      | 'pointsPerMilestone'
      | 'invitationsEnabled'
      | 'tasksEnabled'
      | 'lockReason'
    >
  >
): Promise<void> {
  const isOwner = isActorPlatformOwner(roleDoc);
  const canManage =
    isOwner ||
    isActorRewardsAdmin(actor, roleDoc) ||
    isActorWithdrawalsAdmin(actor, roleDoc);
  if (!canManage) {
    throw new Error('Administrative rewards permissions required.');
  }

  const configRef = doc(db, 'rewards_config', 'global');
  const existingSnap = await getDoc(configRef);
  const current = existingSnap.exists()
    ? ({ ...DEFAULT_REWARDS_CONFIG, ...(existingSnap.data() as Partial<RewardsConfig>) } as RewardsConfig)
    : { ...DEFAULT_REWARDS_CONFIG };

  if ('pointRateNaira' in patch && patch.pointRateNaira !== current.pointRateNaira && !isOwner) {
    throw new Error('Only the Nexora Founder/Owner can set or change the Key Point conversion rate.');
  }

  if (patch.minWithdrawalNaira !== undefined && patch.minWithdrawalNaira < 100) {
    throw new Error('Minimum withdrawal amount must be at least ₦100.');
  }
  if (
    patch.pointRateNaira !== undefined &&
    patch.pointRateNaira !== null &&
    (!Number.isFinite(patch.pointRateNaira) || patch.pointRateNaira <= 0)
  ) {
    throw new Error('Key Point conversion rate must be a positive Naira value.');
  }

  const nextConfig: RewardsConfig = {
    id: 'global',
    withdrawalsOpen: patch.withdrawalsOpen ?? current.withdrawalsOpen,
    pointRateNaira: isOwner && 'pointRateNaira' in patch ? (patch.pointRateNaira ?? null) : current.pointRateNaira,
    minWithdrawalNaira: patch.minWithdrawalNaira ?? current.minWithdrawalNaira,
    referralsPerPoint: patch.referralsPerPoint ?? current.referralsPerPoint,
    pointsPerMilestone: patch.pointsPerMilestone ?? current.pointsPerMilestone,
    invitationsEnabled: patch.invitationsEnabled ?? current.invitationsEnabled,
    tasksEnabled: patch.tasksEnabled ?? current.tasksEnabled,
    lockReason: sanitizeString(patch.lockReason ?? current.lockReason ?? '', 240),
    updatedBy: actor.uid,
  };

  await setDoc(configRef, {
    ...nextConfig,
    updatedAt: serverTimestamp(),
  });

  await recordAuditLog({
    actor,
    actorRole: roleDoc?.role || 'administrator',
    action: 'update_rewards_config',
    category: 'rewards',
    targetType: 'rewards_config',
    targetId: 'global',
    details: `Withdrawals: ${nextConfig.withdrawalsOpen ? 'OPEN' : 'LOCKED'}, Min: ₦${nextConfig.minWithdrawalNaira}, Rate: ${nextConfig.pointRateNaira ?? 'Unset'}`,
  });
}

export function exportTransactionsCsv(txs: WalletTransaction[]): string {
  const headers = [
    'Transaction ID',
    'User ID',
    'Type',
    'Direction',
    'Key Points',
    'Naira Equivalent',
    'Rate Applied',
    'Reference ID',
    'Description',
    'Balance After Available',
    'Timestamp',
  ];
  const rows = txs.map((tx) => [
    tx.id,
    tx.uid,
    tx.type,
    tx.direction,
    String(tx.points),
    tx.nairaEquivalent !== null && tx.nairaEquivalent !== undefined ? String(tx.nairaEquivalent) : '',
    tx.pointRateNaira !== null && tx.pointRateNaira !== undefined ? String(tx.pointRateNaira) : '',
    tx.referenceId,
    `"${(tx.description || '').replace(/"/g, '""')}"`,
    String(tx.balanceAfterAvailable),
    tx.createdAt?.toDate ? tx.createdAt.toDate().toISOString() : '',
  ]);
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from './config';
import { handleFirestoreError, logFirestoreListenerError, OperationType } from './errorHandler';
import { dispatchDualNotification } from '../notifications/notificationDispatcher';
import {
  AdminPermission,
  AnyVerifiedBadgeType,
  AuditLogCategory,
  AuditLogEntry,
  BadgeConfig,
  ContactSubmission,
  EmailLogEntry,
  GiftTransaction,
  IdentityVerificationRequest,
  InternalRole,
  ModerationReport,
  NotificationCategory,
  PlatformAnalyticsSnapshot,
  PlatformAnnouncement,
  PlatformConfig,
  PlatformRole,
  Space,
  SpaceMember,
  SubscriptionTier,
  UserProfile,
  UserSubscription,
  VerificationRequest,
  VerifiedBadgeRecord,
  VerifiedBadgeType,
  VirtualGiftCatalogItem,
} from '../../types/nexora';
import {
  ALL_CANONICAL_BADGES,
  ALL_VALID_BADGE_VALUES,
  BADGE_CATALOG,
  BADGE_LABELS,
  BLUEPRINT_LIMITS,
  DEFAULT_BADGE_CONFIGS,
  DEFAULT_PLATFORM_CONFIG,
  FOUNDER_OWNER_EMAIL,
  FREE_GIFT_CATALOG,
  normalizeBadgeList,
  normalizeBadgeType,
  resolveEffectiveSubscriptionTier,
  ROLE_DEFAULT_PERMISSIONS,
  sanitizeString,
} from '../../utils/validation';

// --- Audit Logging ---
export async function recordAuditLog(params: {
  actor: UserProfile;
  actorRole: string;
  action: string;
  category: AuditLogCategory;
  targetType: string;
  targetId: string;
  targetLabel?: string;
  result?: 'success' | 'rejected';
  details?: string;
}): Promise<void> {
  try {
    await addDoc(collection(db, 'audit_logs'), {
      actorUid: params.actor.uid,
      actorName: sanitizeString(params.actor.displayName, 80),
      actorRole: sanitizeString(params.actorRole, 40),
      action: sanitizeString(params.action, 100),
      category: params.category,
      targetType: sanitizeString(params.targetType, 40),
      targetId: sanitizeString(params.targetId, 128),
      targetLabel: sanitizeString(params.targetLabel || '', 120),
      result: params.result || 'success',
      details: sanitizeString(params.details || '', 400),
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking audit record
  }
}

export function subscribeAuditLogs(callback: (logs: AuditLogEntry[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'audit_logs'),
    where('category', 'in', [
      'admin',
      'community',
      'verification',
      'identity',
      'platform',
      'moderation',
      'notification',
      'billing',
      'customisation',
      'ai',
      'rewards',
      'wallet',
    ]),
    limit(120)
  );
  return onSnapshot(
    q,
    (snap) =>
      callback(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLogEntry, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      ),
    (err) => logFirestoreListenerError(err, OperationType.LIST, 'audit_logs')
  );
}

// --- Founder / Owner Bootstrap ---
export async function bootstrapFounderGovernance(
  firebaseUser: User,
  profile: UserProfile
): Promise<void> {
  if (!firebaseUser.emailVerified) return;
  if ((firebaseUser.email || '').toLowerCase() !== FOUNDER_OWNER_EMAIL.toLowerCase()) return;

  const roleRef = doc(db, 'platform_roles', firebaseUser.uid);
  const badgeRef = doc(db, 'verified_badges', firebaseUser.uid);
  const userRef = doc(db, 'users', firebaseUser.uid);
  const configRef = doc(db, 'platform_config', 'global');
  const subscriptionRef = doc(db, 'user_subscriptions', firebaseUser.uid);

  try {
    const [roleSnap, badgeSnap, configSnap, subscriptionSnap] = await Promise.all([
      getDoc(roleRef),
      getDoc(badgeRef),
      getDoc(configRef),
      getDoc(subscriptionRef),
    ]);

    const now = serverTimestamp();

    if (!roleSnap.exists()) {
      await setDoc(roleRef, {
        uid: firebaseUser.uid,
        email: sanitizeString(firebaseUser.email || FOUNDER_OWNER_EMAIL, 254),
        displayName: sanitizeString(profile.displayName, 80),
        username: profile.username,
        role: 'owner' satisfies InternalRole,
        permissions: ROLE_DEFAULT_PERMISSIONS.owner,
        active: true,
        ownerBadge: true,
        specialBadge: 'Founder & Owner',
        assignedBy: firebaseUser.uid,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      const data = roleSnap.data() as PlatformRole;
      if (data.role !== 'owner' || !data.active || !data.ownerBadge) {
        await updateDoc(roleRef, {
          role: 'owner',
          permissions: ROLE_DEFAULT_PERMISSIONS.owner,
          active: true,
          ownerBadge: true,
          specialBadge: 'Founder & Owner',
          updatedAt: now,
        });
      }
    }

    const existingBadgeData = badgeSnap.exists() ? (badgeSnap.data() as VerifiedBadgeRecord) : null;
    const existingNormalized = existingBadgeData
      ? normalizeBadgeList(existingBadgeData.badges, existingBadgeData.badgeType)
      : [];
    const needsFounderUpgrade =
      !badgeSnap.exists() ||
      !existingNormalized.includes('founder') ||
      !existingNormalized.includes('verified_identity') ||
      !existingBadgeData?.badges;

    if (needsFounderUpgrade) {
      const mergedBadges = Array.from(
        new Set<VerifiedBadgeType>(['founder', 'verified_identity', ...existingNormalized])
      ).slice(0, 20);
      await setDoc(badgeRef, {
        uid: firebaseUser.uid,
        badgeType: 'founder' satisfies VerifiedBadgeType,
        label: BADGE_CATALOG.founder.name,
        badges: mergedBadges,
        labels: mergedBadges.map((b) => BADGE_CATALOG[b].name),
        updatedBy: firebaseUser.uid,
        updatedAt: now,
      });
    }

    // Grant highest premium package (Nexora Pro) permanently to the Founder/Owner
    const existingSub = subscriptionSnap.exists()
      ? (subscriptionSnap.data() as UserSubscription)
      : null;
    const effectiveOwnerTier = resolveEffectiveSubscriptionTier(existingSub);
    const needsOwnerProGrant =
      !existingSub ||
      effectiveOwnerTier !== 'pro' ||
      existingSub.status !== 'active' ||
      existingSub.cancelAtPeriodEnd === true;

    if (needsOwnerProGrant) {
      await setDoc(subscriptionRef, {
        uid: firebaseUser.uid,
        tier: 'pro' satisfies SubscriptionTier,
        billingCycle: 'yearly',
        status: 'active',
        cancelAtPeriodEnd: false,
        provider: 'admin',
        receiptRef: 'FOUNDER-OWNER-PRO',
        verifiedByServer: false,
        startedAt: existingSub?.startedAt || now,
        updatedAt: now,
      });
    }

    const userPatch: Record<string, unknown> = {};
    if (!profile.verified) {
      userPatch.verified = true;
    }
    if (profile.subscriptionTier !== 'pro') {
      userPatch.subscriptionTier = 'pro' satisfies SubscriptionTier;
    }
    if (Object.keys(userPatch).length > 0) {
      userPatch.updatedAt = now;
      await updateDoc(userRef, userPatch);
    }

    if (!configSnap.exists()) {
      await setDoc(configRef, {
        ...DEFAULT_PLATFORM_CONFIG,
        updatedBy: firebaseUser.uid,
        updatedAt: now,
      });
    }
  } catch (err) {
    console.warn('Founder governance bootstrap skipped or pending permissions:', err);
  }
}

// --- Trusted 20-Badge Registry ---
export function subscribeVerifiedBadges(
  callback: (map: Record<string, VerifiedBadgeRecord>) => void
): Unsubscribe {
  const q = query(
    collection(db, 'verified_badges'),
    where('badgeType', 'in', [...ALL_VALID_BADGE_VALUES]),
    limit(500)
  );
  return onSnapshot(
    q,
    (snap) => {
      const next: Record<string, VerifiedBadgeRecord> = {};
      snap.docs.forEach((d) => {
        const raw = d.data() as VerifiedBadgeRecord;
        const normalizedList = normalizeBadgeList(raw.badges, raw.badgeType);
        const primary = normalizedList[0] || normalizeBadgeType(raw.badgeType);
        next[d.id] = {
          ...raw,
          badgeType: primary,
          label: BADGE_CATALOG[primary]?.name || raw.label,
          badges: normalizedList,
          labels: normalizedList.map((b) => BADGE_CATALOG[b]?.name || b),
        };
      });
      callback(next);
    },
    () => callback({})
  );
}

// --- Badge Configs ---
export function subscribeBadgeConfigs(
  callback: (configs: Record<VerifiedBadgeType, BadgeConfig>) => void
): Unsubscribe {
  const q = query(collection(db, 'badge_configs'), where('enabled', 'in', [true, false]), limit(40));
  return onSnapshot(
    q,
    (snap) => {
      const merged: Record<VerifiedBadgeType, BadgeConfig> = { ...DEFAULT_BADGE_CONFIGS };
      snap.docs.forEach((d) => {
        const data = d.data() as BadgeConfig;
        const key = normalizeBadgeType(data.badgeId || d.id);
        merged[key] = { ...DEFAULT_BADGE_CONFIGS[key], ...data, badgeId: key };
      });
      callback(merged);
    },
    () => callback({ ...DEFAULT_BADGE_CONFIGS })
  );
}

export async function saveBadgeConfig(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  config: BadgeConfig;
}): Promise<void> {
  try {
    await setDoc(doc(db, 'badge_configs', params.config.badgeId), {
      badgeId: params.config.badgeId,
      enabled: Boolean(params.config.enabled),
      autoAward: Boolean(params.config.autoAward),
      minFollowers: Math.max(0, Math.floor(params.config.minFollowers || 0)),
      minPosts: Math.max(0, Math.floor(params.config.minPosts || 0)),
      minLikes: Math.max(0, Math.floor(params.config.minLikes || 0)),
      accountAgeDays: Math.max(0, Math.floor(params.config.accountAgeDays || 0)),
      customCriteriaNote: sanitizeString(params.config.customCriteriaNote || '', 300),
      updatedBy: params.actor.uid,
      updatedAt: serverTimestamp(),
    });
    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: `Updated badge criteria (${params.config.badgeId})`,
      category: 'verification',
      targetType: 'badge_config',
      targetId: params.config.badgeId,
      details: `Auto=${params.config.autoAward}, Followers>=${params.config.minFollowers}, Posts>=${params.config.minPosts}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `badge_configs/${params.config.badgeId}`);
  }
}

// --- Current User RBAC Subscription ---
export function subscribeMyPlatformRole(
  uid: string,
  callback: (role: PlatformRole | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'platform_roles', uid),
    (snap) => {
      callback(snap.exists() ? (snap.data() as PlatformRole) : null);
    },
    () => callback(null)
  );
}

// --- Section A: Admin Management ---
export function subscribePlatformRoles(callback: (roles: PlatformRole[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'platform_roles'),
    where('role', 'in', ['owner', 'administrator', 'moderator', 'verification_reviewer', 'support']),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as PlatformRole)
        .sort((a, b) => {
          if (a.role === 'owner') return -1;
          if (b.role === 'owner') return 1;
          return (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0);
        });
      callback(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'platform_roles')
  );
}

export function subscribeAllUsersAdmin(callback: (users: UserProfile[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'users'),
    where('onboardingCompleted', 'in', [true, false]),
    orderBy('createdAt', 'desc'),
    limit(1000)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as UserProfile)
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      callback(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'users')
  );
}

export async function appointStaffMember(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  targetUser: UserProfile;
  email: string;
  role: Exclude<InternalRole, 'owner'>;
  permissions: AdminPermission[];
  specialBadge?: string;
}): Promise<void> {
  if (params.role === 'administrator' && params.actorRole !== 'owner') {
    throw new Error('Only the Nexora Owner can appoint Administrators.');
  }

  const targetRef = doc(db, 'platform_roles', params.targetUser.uid);
  const existing = await getDoc(targetRef);
  if (existing.exists() && (existing.data() as PlatformRole).role === 'owner') {
    throw new Error('The permanent Nexora Owner role cannot be modified.');
  }

  const cleanEmail = sanitizeString(params.email || `${params.targetUser.username}@nexora.member`, 254);
  const now = serverTimestamp();
  try {
    if (existing.exists()) {
      await updateDoc(targetRef, {
        displayName: sanitizeString(params.targetUser.displayName, 80),
        username: params.targetUser.username,
        role: params.role,
        permissions: params.permissions.slice(0, 12),
        active: true,
        ownerBadge: false,
        specialBadge: sanitizeString(params.specialBadge || '', 40),
        assignedBy: params.actor.uid,
        updatedAt: now,
      });
    } else {
      await setDoc(targetRef, {
        uid: params.targetUser.uid,
        email: cleanEmail,
        displayName: sanitizeString(params.targetUser.displayName, 80),
        username: params.targetUser.username,
        role: params.role,
        permissions: params.permissions.slice(0, 12),
        active: true,
        ownerBadge: false,
        specialBadge: sanitizeString(params.specialBadge || '', 40),
        assignedBy: params.actor.uid,
        createdAt: now,
        updatedAt: now,
      });
    }

    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: `Appointed ${params.role}`,
      category: 'admin',
      targetType: 'platform_role',
      targetId: params.targetUser.uid,
      targetLabel: `@${params.targetUser.username}`,
      details: `Permissions: ${params.permissions.join(', ')}`,
    });

    void dispatchDualNotification({
      recipientUid: params.targetUser.uid,
      recipientName: params.targetUser.displayName,
      recipientEmail: params.email,
      actor: params.actor,
      type: 'staff_role_change',
      category: 'admin',
      targetId: 'settings:admin_centre',
      inAppPreview: `You were appointed as Nexora ${params.role.replace(/_/g, ' ')}.`,
      emailSubject: `Nexora Staff Appointment: ${params.role.replace(/_/g, ' ').toUpperCase()}`,
      emailBodyText: `You have been appointed as ${params.role.replace(/_/g, ' ')} on Nexora by ${params.actor.displayName} with ${params.permissions.length} assigned administrative permissions.`,
      ctaLabel: 'Open Settings',
      ctaUrl: '/',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `platform_roles/${params.targetUser.uid}`);
  }
}

export async function updateStaffRoleAndPermissions(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  target: PlatformRole;
  nextRole: Exclude<InternalRole, 'owner'>;
  nextPermissions: AdminPermission[];
}): Promise<void> {
  if (params.target.role === 'owner') {
    throw new Error('The permanent Nexora Owner cannot be demoted or edited.');
  }
  if ((params.target.role === 'administrator' || params.nextRole === 'administrator') && params.actorRole !== 'owner') {
    throw new Error('Only the Nexora Owner can modify Administrator-tier roles.');
  }

  try {
    await updateDoc(doc(db, 'platform_roles', params.target.uid), {
      role: params.nextRole,
      permissions: params.nextPermissions.slice(0, 12),
      ownerBadge: false,
      assignedBy: params.actor.uid,
      updatedAt: serverTimestamp(),
    });
    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: 'Updated staff permissions',
      category: 'admin',
      targetType: 'platform_role',
      targetId: params.target.uid,
      targetLabel: `@${params.target.username}`,
      details: `Role -> ${params.nextRole} (${params.nextPermissions.length} permissions)`,
    });
    void dispatchDualNotification({
      recipientUid: params.target.uid,
      recipientName: params.target.displayName,
      recipientEmail: params.target.email,
      actor: params.actor,
      type: 'staff_role_change',
      category: 'admin',
      targetId: 'settings:admin_centre',
      inAppPreview: `Your staff role was updated to ${params.nextRole.replace(/_/g, ' ')}.`,
      emailSubject: 'Nexora Staff Role & Permissions Updated',
      emailBodyText: `Your Nexora administrative role is now ${params.nextRole.replace(/_/g, ' ')} (${params.nextPermissions.length} permissions active).`,
      ctaLabel: 'Open Administration Centre',
      ctaUrl: '/',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `platform_roles/${params.target.uid}`);
  }
}

export async function toggleStaffActiveStatus(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  target: PlatformRole;
}): Promise<void> {
  if (params.target.role === 'owner') {
    throw new Error('The permanent Nexora Owner cannot be suspended.');
  }
  const nextActive = !params.target.active;
  try {
    await updateDoc(doc(db, 'platform_roles', params.target.uid), {
      active: nextActive,
      updatedAt: serverTimestamp(),
    });
    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: nextActive ? 'Restored staff access' : 'Suspended staff access',
      category: 'admin',
      targetType: 'platform_role',
      targetId: params.target.uid,
      targetLabel: `@${params.target.username}`,
    });
    void dispatchDualNotification({
      recipientUid: params.target.uid,
      recipientName: params.target.displayName,
      recipientEmail: params.target.email,
      actor: params.actor,
      type: 'staff_role_change',
      category: 'admin',
      targetId: 'settings:admin_centre',
      inAppPreview: nextActive ? 'Your Nexora staff access was restored.' : 'Your Nexora staff access was paused.',
      emailSubject: nextActive ? 'Nexora Staff Access Restored' : 'Nexora Staff Access Suspended',
      emailBodyText: nextActive
        ? 'Your Nexora staff privileges have been reactivated.'
        : 'Your Nexora administrative privileges have been temporarily paused by platform administration.',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `platform_roles/${params.target.uid}`);
  }
}

export async function revokeStaffAccess(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  target: PlatformRole;
}): Promise<void> {
  if (params.target.role === 'owner') {
    throw new Error('The permanent Nexora Owner access cannot be revoked.');
  }
  try {
    await deleteDoc(doc(db, 'platform_roles', params.target.uid));
    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: 'Revoked administrative access',
      category: 'admin',
      targetType: 'platform_role',
      targetId: params.target.uid,
      targetLabel: `@${params.target.username}`,
    });
    void dispatchDualNotification({
      recipientUid: params.target.uid,
      recipientName: params.target.displayName,
      recipientEmail: params.target.email,
      actor: params.actor,
      type: 'staff_role_change',
      category: 'admin',
      targetId: 'settings:profile',
      inAppPreview: 'Your Nexora administrative role has been revoked.',
      emailSubject: 'Nexora Staff Role Revoked',
      emailBodyText: `Your administrative staff role (@${params.target.username}) on Nexora has been revoked by ${params.actor.displayName}.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `platform_roles/${params.target.uid}`);
  }
}

// --- Section B: Community Control ---
export async function updateSpaceGovernance(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  space: Space;
  updates: Partial<{
    verified: boolean;
    status: 'active' | 'pending' | 'suspended';
    suspensionReason: string;
    ownerId: string;
    ownerName: string;
    ownerUsername: string;
  }>;
  actionLabel: string;
}): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (params.updates.verified !== undefined) payload.verified = params.updates.verified;
    if (params.updates.status !== undefined) payload.status = params.updates.status;
    if (params.updates.suspensionReason !== undefined) {
      payload.suspensionReason = sanitizeString(params.updates.suspensionReason, 300);
    }
    if (params.updates.ownerId !== undefined) payload.ownerId = params.updates.ownerId;
    if (params.updates.ownerName !== undefined) {
      payload.ownerName = sanitizeString(params.updates.ownerName, 80);
    }
    if (params.updates.ownerUsername !== undefined) {
      payload.ownerUsername = params.updates.ownerUsername;
    }

    await updateDoc(doc(db, 'spaces', params.space.id), payload);

    if (params.updates.ownerId && params.updates.ownerName && params.updates.ownerUsername) {
      await setDoc(
        doc(db, 'spaces', params.space.id, 'members', params.updates.ownerId),
        {
          uid: params.updates.ownerId,
          role: 'owner',
          displayName: sanitizeString(params.updates.ownerName, 80),
          username: params.updates.ownerUsername,
          avatarUrl: '',
          joinedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: params.actionLabel,
      category: 'community',
      targetType: 'space',
      targetId: params.space.id,
      targetLabel: params.space.name,
    });

    const ownerRecipient = params.updates.ownerId || params.space.ownerId;
    if (ownerRecipient) {
      void dispatchDualNotification({
        recipientUid: ownerRecipient,
        recipientName: params.updates.ownerName || params.space.ownerName,
        actor: params.actor,
        type: 'community_status',
        category: 'admin',
        targetId: params.space.id,
        inAppPreview: `Space "${params.space.name}": ${params.actionLabel}`,
        emailSubject: `Nexora Community Update: ${params.space.name}`,
        emailBodyText: `Administrative update for Space "${params.space.name}": ${params.actionLabel}.${params.updates.suspensionReason ? ` Note: ${params.updates.suspensionReason}` : ''}`,
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `spaces/${params.space.id}`);
  }
}

export async function adminDeleteSpace(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  space: Space;
}): Promise<void> {
  try {
    await deleteDoc(doc(db, 'spaces', params.space.id));
    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: 'Deleted Space',
      category: 'community',
      targetType: 'space',
      targetId: params.space.id,
      targetLabel: params.space.name,
    });
    if (params.space.ownerId) {
      void dispatchDualNotification({
        recipientUid: params.space.ownerId,
        recipientName: params.space.ownerName,
        actor: params.actor,
        type: 'community_status',
        category: 'admin',
        targetId: params.space.id,
        inAppPreview: `Your Space "${params.space.name}" was removed by moderation.`,
        emailSubject: `Nexora Space Removed: ${params.space.name}`,
        emailBodyText: `Your Space "${params.space.name}" was removed by Nexora platform administration.`,
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `spaces/${params.space.id}`);
  }
}

export async function getSpaceMembersOnce(spaceId: string): Promise<SpaceMember[]> {
  try {
    const snap = await getDocs(collection(db, 'spaces', spaceId, 'members'));
    return snap.docs.map((d) => d.data() as SpaceMember);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `spaces/${spaceId}/members`);
  }
}

export async function adminSetSpaceMemberRole(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  space: Space;
  memberUid: string;
  memberUsername: string;
  role: 'admin' | 'member';
}): Promise<void> {
  try {
    await updateDoc(doc(db, 'spaces', params.space.id, 'members', params.memberUid), {
      role: params.role,
    });
    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: `Set Space role to ${params.role}`,
      category: 'community',
      targetType: 'space_member',
      targetId: params.memberUid,
      targetLabel: `@${params.memberUsername} in ${params.space.name}`,
    });
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.UPDATE,
      `spaces/${params.space.id}/members/${params.memberUid}`
    );
  }
}

export async function adminKickSpaceMember(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  space: Space;
  memberUid: string;
  memberUsername: string;
}): Promise<void> {
  try {
    await deleteDoc(doc(db, 'spaces', params.space.id, 'members', params.memberUid));
    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: 'Removed member from Space',
      category: 'community',
      targetType: 'space_member',
      targetId: params.memberUid,
      targetLabel: `@${params.memberUsername} from ${params.space.name}`,
    });
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.DELETE,
      `spaces/${params.space.id}/members/${params.memberUid}`
    );
  }
}

// --- Section C: Multi-Badge Verification Centre (All 20 Badges) ---
export async function assignUserBadges(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  targetUser: UserProfile;
  badges: VerifiedBadgeType[];
  recipientEmail?: string;
}): Promise<void> {
  const sanitized = normalizeBadgeList(params.badges).filter((b) => {
    if (b === 'founder' && params.actorRole !== 'owner') return false;
    return true;
  }).slice(0, 20);

  try {
    const now = serverTimestamp();
    const batch = writeBatch(db);
    if (sanitized.length === 0) {
      batch.delete(doc(db, 'verified_badges', params.targetUser.uid));
      batch.update(doc(db, 'users', params.targetUser.uid), {
        verified: false,
        updatedAt: now,
      });
    } else {
      const primary = sanitized[0];
      batch.set(doc(db, 'verified_badges', params.targetUser.uid), {
        uid: params.targetUser.uid,
        badgeType: primary,
        label: BADGE_CATALOG[primary].name,
        badges: sanitized,
        labels: sanitized.map((b) => BADGE_CATALOG[b].name),
        updatedBy: params.actor.uid,
        updatedAt: now,
      });
      batch.update(doc(db, 'users', params.targetUser.uid), {
        verified: true,
        updatedAt: now,
      });
    }
    await batch.commit();

    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: sanitized.length > 0 ? `Updated badges (${sanitized.join(', ')})` : 'Revoked all badges',
      category: 'verification',
      targetType: 'user',
      targetId: params.targetUser.uid,
      targetLabel: `@${params.targetUser.username}`,
    });

    const badgeNames = sanitized.map((b) => BADGE_CATALOG[b].name).join(', ');
    void dispatchDualNotification({
      recipientUid: params.targetUser.uid,
      recipientName: params.targetUser.displayName,
      recipientEmail: params.recipientEmail,
      actor: params.actor,
      type: sanitized.length > 0 ? 'badge_awarded' : 'badge_revoked',
      category: 'badges',
      targetId: params.targetUser.uid,
      inAppPreview:
        sanitized.length > 0
          ? `Your profile badges were updated: ${badgeNames}`
          : 'Your verification/platform badges were removed.',
      emailSubject:
        sanitized.length > 0
          ? `Nexora Badge Update: ${badgeNames}`
          : 'Nexora Badge Removed',
      emailBodyText:
        sanitized.length > 0
          ? `Your Nexora account (@${params.targetUser.username}) now displays the following verified badge(s): ${badgeNames}.`
          : `All Nexora verification/platform badges on @${params.targetUser.username} have been removed by administration.`,
      ctaLabel: 'View Your Profile',
      ctaUrl: '/',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `verified_badges/${params.targetUser.uid}`);
  }
}

export async function addBadgeToUser(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  targetUser: UserProfile;
  badgeType: VerifiedBadgeType;
  existingBadges?: VerifiedBadgeType[];
}): Promise<void> {
  const next = Array.from(new Set<VerifiedBadgeType>([...(params.existingBadges || []), params.badgeType]));
  await assignUserBadges({
    actor: params.actor,
    actorRole: params.actorRole,
    targetUser: params.targetUser,
    badges: next,
  });
}

export async function removeBadgeFromUser(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  targetUser: UserProfile;
  badgeType: VerifiedBadgeType;
  existingBadges: VerifiedBadgeType[];
}): Promise<void> {
  const next = params.existingBadges.filter((b) => b !== params.badgeType);
  await assignUserBadges({
    actor: params.actor,
    actorRole: params.actorRole,
    targetUser: params.targetUser,
    badges: next,
  });
}

export async function assignUserBadge(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  targetUser: UserProfile;
  badgeType: Exclude<VerifiedBadgeType, 'founder'>;
  existingBadges?: VerifiedBadgeType[];
}): Promise<void> {
  await addBadgeToUser({
    actor: params.actor,
    actorRole: params.actorRole,
    targetUser: params.targetUser,
    badgeType: params.badgeType,
    existingBadges: params.existingBadges,
  });
}

export async function revokeUserBadge(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  targetUser: UserProfile;
}): Promise<void> {
  await assignUserBadges({
    actor: params.actor,
    actorRole: params.actorRole,
    targetUser: params.targetUser,
    badges: [],
  });
}

export async function evaluateAchievementBadges(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  users: UserProfile[];
  badgesMap: Record<string, VerifiedBadgeRecord>;
  badgeConfigs: Record<VerifiedBadgeType, BadgeConfig>;
}): Promise<{ evaluatedUsers: number; badgesGranted: number }> {
  const autoBadges = ALL_CANONICAL_BADGES.filter((id) => {
    const def = BADGE_CATALOG[id];
    const cfg = params.badgeConfigs[id] || DEFAULT_BADGE_CONFIGS[id];
    return def.achievementAutoEligible && cfg.enabled && cfg.autoAward;
  });

  if (autoBadges.length === 0) return { evaluatedUsers: params.users.length, badgesGranted: 0 };

  let badgesGranted = 0;
  const nowMs = Date.now();

  for (const target of params.users) {
    if (target.suspended) continue;
    const currentRec = params.badgesMap[target.uid];
    const existingList = currentRec
      ? normalizeBadgeList(currentRec.badges, currentRec.badgeType)
      : [];
    const createdMs = target.createdAt?.toMillis?.() ?? nowMs;
    const ageDays = Math.floor((nowMs - createdMs) / 86_400_000);

    const newlyEarned: VerifiedBadgeType[] = [];
    for (const badgeId of autoBadges) {
      if (existingList.includes(badgeId)) continue;
      const cfg = params.badgeConfigs[badgeId] || DEFAULT_BADGE_CONFIGS[badgeId];
      if (
        (target.followersCount || 0) >= cfg.minFollowers &&
        (target.postsCount || 0) >= cfg.minPosts &&
        (target.likesCount || 0) >= cfg.minLikes &&
        ageDays >= cfg.accountAgeDays
      ) {
        newlyEarned.push(badgeId);
      }
    }

    if (newlyEarned.length > 0) {
      const merged = Array.from(new Set<VerifiedBadgeType>([...existingList, ...newlyEarned]));
      await assignUserBadges({
        actor: params.actor,
        actorRole: params.actorRole,
        targetUser: target,
        badges: merged,
      });
      badgesGranted += newlyEarned.length;
    }
  }

  return { evaluatedUsers: params.users.length, badgesGranted };
}

export async function submitVerificationRequest(params: {
  user: UserProfile;
  requestedBadge: AnyVerifiedBadgeType;
  category: string;
  rationale: string;
  referenceLink?: string;
}): Promise<void> {
  const now = serverTimestamp();
  try {
    const ref = await addDoc(collection(db, 'verification_requests'), {
      uid: params.user.uid,
      displayName: sanitizeString(params.user.displayName, 80),
      username: params.user.username,
      avatarUrl: sanitizeString(params.user.avatarUrl || '', 200000),
      requestedBadge: params.requestedBadge,
      category: sanitizeString(params.category, 60),
      rationale: sanitizeString(params.rationale, BLUEPRINT_LIMITS.RATIONALE_MAX),
      referenceLink: sanitizeString(params.referenceLink || '', 200),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
    const norm = normalizeBadgeType(params.requestedBadge);
    void dispatchDualNotification({
      recipientUid: params.user.uid,
      recipientName: params.user.displayName,
      actor: params.user,
      type: 'verification_decision',
      category: 'badges',
      targetId: ref.id,
      allowSelfInApp: true,
      inAppPreview: `Badge application received: ${BADGE_CATALOG[norm].name} (pending review).`,
      emailSubject: `Nexora Badge Application Received (${BADGE_CATALOG[norm].name})`,
      emailBodyText: `Your application for the ${BADGE_CATALOG[norm].name} badge has been submitted and is pending administrative review.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'verification_requests');
  }
}

export function subscribeMyVerificationRequests(
  uid: string,
  callback: (items: VerificationRequest[]) => void
): Unsubscribe {
  const q = query(collection(db, 'verification_requests'), where('uid', '==', uid), limit(15));
  return onSnapshot(
    q,
    (snap) =>
      callback(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<VerificationRequest, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      ),
    () => callback([])
  );
}

export function subscribeAllVerificationRequests(
  callback: (items: VerificationRequest[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'verification_requests'),
    where('status', 'in', ['pending', 'approved', 'rejected']),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) =>
      callback(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<VerificationRequest, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      ),
    (err) => handleFirestoreError(err, OperationType.LIST, 'verification_requests')
  );
}

export async function reviewVerificationRequest(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  request: VerificationRequest;
  decision: 'approved' | 'rejected';
  reviewerNote?: string;
}): Promise<void> {
  const now = serverTimestamp();
  const normalizedBadge = normalizeBadgeType(params.request.requestedBadge);
  try {
    await updateDoc(doc(db, 'verification_requests', params.request.id), {
      status: params.decision,
      reviewerUid: params.actor.uid,
      reviewerNote: sanitizeString(params.reviewerNote || '', BLUEPRINT_LIMITS.REVIEW_NOTE_MAX),
      reviewedAt: now,
      updatedAt: now,
    });

    if (params.decision === 'approved') {
      const existingSnap = await getDoc(doc(db, 'verified_badges', params.request.uid));
      const existingData = existingSnap.exists()
        ? (existingSnap.data() as VerifiedBadgeRecord)
        : null;
      const existingList = existingData
        ? normalizeBadgeList(existingData.badges, existingData.badgeType)
        : [];
      const mergedBadges = Array.from(
        new Set<VerifiedBadgeType>([...existingList, normalizedBadge])
      ).slice(0, 20);
      const primary = mergedBadges[0] || normalizedBadge;

      const batch = writeBatch(db);
      batch.set(doc(db, 'verified_badges', params.request.uid), {
        uid: params.request.uid,
        badgeType: primary,
        label: BADGE_CATALOG[primary].name,
        badges: mergedBadges,
        labels: mergedBadges.map((b) => BADGE_CATALOG[b].name),
        updatedBy: params.actor.uid,
        updatedAt: now,
      });
      batch.update(doc(db, 'users', params.request.uid), {
        verified: true,
        updatedAt: now,
      });
      await batch.commit();
    }

    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: `${params.decision === 'approved' ? 'Approved' : 'Rejected'} verification application`,
      category: 'verification',
      targetType: 'verification_request',
      targetId: params.request.id,
      targetLabel: `@${params.request.username}`,
      details: params.reviewerNote || `Badge: ${BADGE_CATALOG[normalizedBadge].name}`,
    });

    void dispatchDualNotification({
      recipientUid: params.request.uid,
      recipientName: params.request.displayName,
      actor: params.actor,
      type: 'verification_decision',
      category: 'badges',
      targetId: params.request.uid,
      inAppPreview:
        params.decision === 'approved'
          ? `Approved! You earned the ${BADGE_CATALOG[normalizedBadge].name} badge.`
          : `Your ${BADGE_CATALOG[normalizedBadge].name} badge application was declined.`,
      emailSubject: `Nexora Verification Update: ${BADGE_CATALOG[normalizedBadge].name}`,
      emailBodyText:
        params.decision === 'approved'
          ? `Congratulations! Your application for the ${BADGE_CATALOG[normalizedBadge].name} badge has been approved.${params.reviewerNote ? ` Note: ${params.reviewerNote}` : ''}`
          : `Your application for ${BADGE_CATALOG[normalizedBadge].name} was not approved at this time.${params.reviewerNote ? ` Reviewer note: ${params.reviewerNote}` : ''}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `verification_requests/${params.request.id}`);
  }
}

// --- Section D: Confidential Identity Verification (Auto-grants Blue Verified Identity) ---
export async function submitIdentityVerification(params: {
  user: UserProfile;
  legalFullName: string;
  documentType: 'passport' | 'national_id' | 'drivers_license';
  documentCountry: string;
  documentPreviewUrl: string;
  documentFileName: string;
}): Promise<void> {
  const now = serverTimestamp();
  try {
    const ref = await addDoc(collection(db, 'identity_verifications'), {
      uid: params.user.uid,
      displayName: sanitizeString(params.user.displayName, 80),
      username: params.user.username,
      legalFullName: sanitizeString(params.legalFullName, 100),
      documentType: params.documentType,
      documentCountry: sanitizeString(params.documentCountry, 80),
      documentPreviewUrl: sanitizeString(params.documentPreviewUrl, BLUEPRINT_LIMITS.ID_DOC_PREVIEW_MAX),
      documentFileName: sanitizeString(params.documentFileName, 120),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
    void dispatchDualNotification({
      recipientUid: params.user.uid,
      recipientName: params.user.displayName,
      actor: params.user,
      type: 'identity_decision',
      category: 'badges',
      targetId: ref.id,
      allowSelfInApp: true,
      inAppPreview: 'Identity verification submitted securely and queued for reviewer inspection.',
      emailSubject: 'Nexora Identity Verification Submitted',
      emailBodyText:
        'Your confidential identity verification package has been encrypted and queued for authorized Nexora reviewers.',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'identity_verifications');
  }
}

export function subscribeMyIdentityVerifications(
  uid: string,
  callback: (items: IdentityVerificationRequest[]) => void
): Unsubscribe {
  const q = query(collection(db, 'identity_verifications'), where('uid', '==', uid), limit(10));
  return onSnapshot(
    q,
    (snap) =>
      callback(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<IdentityVerificationRequest, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      ),
    () => callback([])
  );
}

export function subscribeAllIdentityVerifications(
  callback: (items: IdentityVerificationRequest[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'identity_verifications'),
    where('status', 'in', ['pending', 'approved', 'rejected']),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) =>
      callback(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<IdentityVerificationRequest, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      ),
    (err) => handleFirestoreError(err, OperationType.LIST, 'identity_verifications')
  );
}

export async function reviewIdentityVerification(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  request: IdentityVerificationRequest;
  decision: 'approved' | 'rejected';
  reviewerNote?: string;
}): Promise<void> {
  const now = serverTimestamp();
  try {
    await updateDoc(doc(db, 'identity_verifications', params.request.id), {
      status: params.decision,
      reviewerUid: params.actor.uid,
      reviewerNote: sanitizeString(params.reviewerNote || '', BLUEPRINT_LIMITS.REVIEW_NOTE_MAX),
      reviewedAt: now,
      updatedAt: now,
    });

    // Approving Identity Verification automatically grants the official blue Verified Identity badge
    if (params.decision === 'approved') {
      const existingSnap = await getDoc(doc(db, 'verified_badges', params.request.uid));
      const existingData = existingSnap.exists()
        ? (existingSnap.data() as VerifiedBadgeRecord)
        : null;
      const existingList = existingData
        ? normalizeBadgeList(existingData.badges, existingData.badgeType)
        : [];
      const mergedBadges = Array.from(
        new Set<VerifiedBadgeType>(['verified_identity', ...existingList])
      ).slice(0, 20);
      const primary = existingList.includes('founder') ? 'founder' : 'verified_identity';

      const batch = writeBatch(db);
      batch.set(doc(db, 'verified_badges', params.request.uid), {
        uid: params.request.uid,
        badgeType: primary,
        label: BADGE_CATALOG[primary].name,
        badges: mergedBadges,
        labels: mergedBadges.map((b) => BADGE_CATALOG[b].name),
        updatedBy: params.actor.uid,
        updatedAt: now,
      });
      batch.update(doc(db, 'users', params.request.uid), {
        verified: true,
        updatedAt: now,
      });
      await batch.commit();
    }

    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: `${params.decision === 'approved' ? 'Approved' : 'Rejected'} identity document`,
      category: 'identity',
      targetType: 'identity_verification',
      targetId: params.request.id,
      targetLabel: `@${params.request.username}`,
      details: `${params.request.documentType} (${params.request.documentCountry})${params.decision === 'approved' ? ' -> Auto-granted Verified Identity blue badge' : ''}`,
    });

    void dispatchDualNotification({
      recipientUid: params.request.uid,
      recipientName: params.request.displayName,
      actor: params.actor,
      type: 'identity_decision',
      category: 'badges',
      targetId: params.request.uid,
      inAppPreview:
        params.decision === 'approved'
          ? 'Identity verified! Official blue Verified Identity badge is now active on your profile.'
          : 'Your identity verification submission was declined.',
      emailSubject:
        params.decision === 'approved'
          ? 'Nexora Identity Verified — Blue Badge Active'
          : 'Nexora Identity Verification Update',
      emailBodyText:
        params.decision === 'approved'
          ? `Your government identity submission has been approved. The official blue Verified Identity badge is now displayed on @${params.request.username}.`
          : `Your identity verification submission could not be approved.${params.reviewerNote ? ` Reason: ${params.reviewerNote}` : ''}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `identity_verifications/${params.request.id}`);
  }
}

// --- Section E: Platform Management ---
export function subscribePlatformConfig(callback: (config: PlatformConfig) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'platform_config', 'global'),
    (snap) => {
      if (!snap.exists()) {
        callback(DEFAULT_PLATFORM_CONFIG);
      } else {
        const data = snap.data() as PlatformConfig;
        callback({
          ...DEFAULT_PLATFORM_CONFIG,
          ...data,
          features: {
            ...DEFAULT_PLATFORM_CONFIG.features,
            ...(data.features || {}),
          },
        });
      }
    },
    () => callback(DEFAULT_PLATFORM_CONFIG)
  );
}

export async function savePlatformConfig(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  config: PlatformConfig;
}): Promise<void> {
  try {
    await setDoc(doc(db, 'platform_config', 'global'), {
      platformName: sanitizeString(params.config.platformName, 60) || 'NEXORA',
      slogan: sanitizeString(params.config.slogan, 120) || DEFAULT_PLATFORM_CONFIG.slogan,
      description: sanitizeString(params.config.description, 400),
      logoMode: params.config.logoMode,
      supportEmail: sanitizeString(params.config.supportEmail, 120),
      maintenanceMode: Boolean(params.config.maintenanceMode),
      maintenanceMessage: sanitizeString(params.config.maintenanceMessage, 300),
      features: {
        registrationOpen: Boolean(params.config.features.registrationOpen),
        communityApprovalRequired: Boolean(params.config.features.communityApprovalRequired),
        vibesEnabled: Boolean(params.config.features.vibesEnabled),
        spacesEnabled: Boolean(params.config.features.spacesEnabled),
        chatEnabled: Boolean(params.config.features.chatEnabled),
        storiesEnabled: Boolean(params.config.features.storiesEnabled),
      },
      contentPolicy: sanitizeString(params.config.contentPolicy, BLUEPRINT_LIMITS.POLICY_MAX),
      updatedBy: params.actor.uid,
      updatedAt: serverTimestamp(),
    });

    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: 'Updated global platform configuration',
      category: 'platform',
      targetType: 'platform_config',
      targetId: 'global',
      details: `Maintenance=${params.config.maintenanceMode}, RegOpen=${params.config.features.registrationOpen}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'platform_config/global');
  }
}

// --- Section F: Real Platform Analytics ---
export async function fetchRealPlatformAnalytics(): Promise<PlatformAnalyticsSnapshot> {
  const nowMs = Date.now();
  const oneDayAgo = nowMs - 24 * 60 * 60 * 1000;
  const sevenDaysAgo = nowMs - 7 * 24 * 60 * 60 * 1000;

  const [
    usersCountSnap,
    postsCountSnap,
    vibesCountSnap,
    spacesCountSnap,
    verifCountSnap,
    usersSampleSnap,
    postsSampleSnap,
    vibesSampleSnap,
    spacesSampleSnap,
    reportsSampleSnap,
  ] = await Promise.all([
    getCountFromServer(query(collection(db, 'users'), where('onboardingCompleted', 'in', [true, false]))).catch(
      () => null
    ),
    getCountFromServer(
      query(collection(db, 'posts'), where('audience', 'in', ['public', 'followers', 'space']))
    ).catch(() => null),
    getCountFromServer(query(collection(db, 'vibes'), where('viewsCount', '>=', 0))).catch(() => null),
    getCountFromServer(query(collection(db, 'spaces'), where('isPrivate', 'in', [false, true]))).catch(() => null),
    getCountFromServer(query(collection(db, 'verification_requests'), where('status', '==', 'pending'))).catch(
      () => null
    ),
    getDocs(
      query(
        collection(db, 'users'),
        where('onboardingCompleted', 'in', [true, false]),
        orderBy('createdAt', 'desc'),
        limit(300)
      )
    ),
    getDocs(
      query(
        collection(db, 'posts'),
        where('audience', 'in', ['public', 'followers', 'space']),
        orderBy('createdAt', 'desc'),
        limit(200)
      )
    ),
    getDocs(
      query(collection(db, 'vibes'), where('viewsCount', '>=', 0), orderBy('createdAt', 'desc'), limit(200))
    ),
    getDocs(
      query(collection(db, 'spaces'), where('isPrivate', 'in', [false, true]), orderBy('createdAt', 'desc'), limit(200))
    ),
    getDocs(
      query(
        collection(db, 'reports'),
        where('targetType', 'in', ['post', 'user', 'space', 'vibe', 'gift', 'collab', 'message']),
        limit(200)
      )
    ),
  ]);

  let onlineUsers = 0;
  let suspendedUsers = 0;
  let verifiedUsers = 0;
  let registrations24h = 0;
  let registrations7d = 0;

  usersSampleSnap.docs.forEach((d) => {
    const u = d.data() as UserProfile;
    if (u.isOnline) onlineUsers++;
    if (u.suspended) suspendedUsers++;
    if (u.verified) verifiedUsers++;
    const createdMs = u.createdAt?.toMillis?.() ?? 0;
    if (createdMs >= oneDayAgo) registrations24h++;
    if (createdMs >= sevenDaysAgo) registrations7d++;
  });

  let totalEngagement = 0;
  postsSampleSnap.docs.forEach((d) => {
    const p = d.data();
    totalEngagement +=
      (p.likesCount || 0) + (p.commentsCount || 0) + (p.repostsCount || 0) + (p.savesCount || 0);
  });

  let totalVibeViews = 0;
  vibesSampleSnap.docs.forEach((d) => {
    const v = d.data();
    totalVibeViews += v.viewsCount || 0;
    totalEngagement +=
      (v.likesCount || 0) + (v.commentsCount || 0) + (v.repostsCount || 0) + (v.savesCount || 0);
  });

  let activeSpaces = 0;
  let pendingSpaces = 0;
  let suspendedSpaces = 0;
  spacesSampleSnap.docs.forEach((d) => {
    const s = d.data() as Space;
    if (s.status === 'suspended') suspendedSpaces++;
    else if (s.status === 'pending') pendingSpaces++;
    else activeSpaces++;
  });

  const openReports = reportsSampleSnap.docs.filter((d) => {
    const r = d.data() as ModerationReport;
    return !r.status || r.status === 'open';
  }).length;

  return {
    totalUsers: usersCountSnap?.data().count ?? usersSampleSnap.size,
    onlineUsers,
    suspendedUsers,
    verifiedUsers,
    registrations24h,
    registrations7d,
    totalPosts: postsCountSnap?.data().count ?? postsSampleSnap.size,
    totalEngagement,
    totalVibes: vibesCountSnap?.data().count ?? vibesSampleSnap.size,
    totalVibeViews,
    totalSpaces: spacesCountSnap?.data().count ?? spacesSampleSnap.size,
    activeSpaces,
    pendingSpaces,
    suspendedSpaces,
    openReports,
    pendingVerifications: verifCountSnap?.data().count ?? 0,
    computedAt: new Date(),
  };
}

// --- Section G: Moderation, Reports & Support Appeals ---
export function subscribeReports(callback: (reports: ModerationReport[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'reports'),
    where('targetType', 'in', ['post', 'user', 'space', 'vibe', 'gift', 'collab', 'message']),
    limit(150)
  );
  return onSnapshot(
    q,
    (snap) =>
      callback(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<ModerationReport, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      ),
    (err) => handleFirestoreError(err, OperationType.LIST, 'reports')
  );
}

export async function resolveReport(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  report: ModerationReport;
  status: 'resolved' | 'dismissed';
  resolutionNote: string;
}): Promise<void> {
  try {
    await updateDoc(doc(db, 'reports', params.report.id), {
      status: params.status,
      resolutionNote: sanitizeString(params.resolutionNote || 'Reviewed by administration', 300),
      resolvedBy: params.actor.uid,
      resolvedAt: serverTimestamp(),
    });
    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: `${params.status === 'resolved' ? 'Resolved' : 'Dismissed'} report`,
      category: 'moderation',
      targetType: params.report.targetType,
      targetId: params.report.targetId,
      details: params.resolutionNote,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `reports/${params.report.id}`);
  }
}

export async function suspendOrRestoreUser(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  targetUser: UserProfile;
  suspend: boolean;
  reason?: string;
}): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', params.targetUser.uid), {
      suspended: params.suspend,
      suspendedReason: params.suspend ? sanitizeString(params.reason || 'Policy violation', 300) : '',
      suspendedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: params.suspend ? 'Suspended user account' : 'Restored user account',
      category: 'moderation',
      targetType: 'user',
      targetId: params.targetUser.uid,
      targetLabel: `@${params.targetUser.username}`,
      details: params.reason || '',
    });
    void dispatchDualNotification({
      recipientUid: params.targetUser.uid,
      recipientName: params.targetUser.displayName,
      actor: params.actor,
      type: 'security_alert',
      category: 'security',
      targetId: 'settings:privacy',
      inAppPreview: params.suspend
        ? `Account suspended: ${params.reason || 'Policy violation'}`
        : 'Your Nexora account standing has been restored.',
      emailSubject: params.suspend ? 'Nexora Account Suspended' : 'Nexora Account Restored',
      emailBodyText: params.suspend
        ? `Your Nexora account (@${params.targetUser.username}) has been suspended. Reason: ${params.reason || 'Policy violation'}. You may submit an appeal via Support.`
        : `Good news! Your Nexora account (@${params.targetUser.username}) has been restored to full standing.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${params.targetUser.uid}`);
  }
}

export async function adminRemoveContent(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  targetType: 'post' | 'vibe' | 'space';
  targetId: string;
  label?: string;
}): Promise<void> {
  const collectionName =
    params.targetType === 'post' ? 'posts' : params.targetType === 'vibe' ? 'vibes' : 'spaces';
  try {
    await deleteDoc(doc(db, collectionName, params.targetId));
    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: `Removed ${params.targetType}`,
      category: 'moderation',
      targetType: params.targetType,
      targetId: params.targetId,
      targetLabel: params.label || params.targetId,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${collectionName}/${params.targetId}`);
  }
}

export async function adminResetPostCollabAndTags(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  postId: string;
}): Promise<void> {
  try {
    await updateDoc(doc(db, 'posts', params.postId), {
      taggedUids: [],
      taggedUsernames: [],
      collaboratorInviteUids: [],
      collaboratorUids: [],
      declinedCollaboratorUids: [],
      collaboratorProfiles: {},
      updatedAt: serverTimestamp(),
    });
    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: 'Cleared post tags & collaborations',
      category: 'moderation',
      targetType: 'post',
      targetId: params.postId,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `posts/${params.postId}`);
  }
}

// --- Contact Submissions & Ban Appeals Queue ---
export function subscribeAllContactSubmissions(
  callback: (items: ContactSubmission[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'contact_submissions'),
    where('status', 'in', ['open', 'in_review', 'resolved']),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) =>
      callback(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<ContactSubmission, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      ),
    (err) => handleFirestoreError(err, OperationType.LIST, 'contact_submissions')
  );
}

export async function updateContactSubmission(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  submission: ContactSubmission;
  status: 'open' | 'in_review' | 'resolved';
  adminNote: string;
}): Promise<void> {
  try {
    await updateDoc(doc(db, 'contact_submissions', params.submission.id), {
      status: params.status,
      adminNote: sanitizeString(params.adminNote, 300),
      handledBy: params.actor.uid,
      handledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: `Updated ${params.submission.category} ticket -> ${params.status}`,
      category: 'moderation',
      targetType: 'contact_submission',
      targetId: params.submission.id,
      targetLabel: params.submission.subject,
      details: params.adminNote,
    });

    void dispatchDualNotification({
      recipientUid: params.submission.uid,
      recipientName: params.submission.name,
      recipientEmail: params.submission.email,
      actor: params.actor,
      type: 'support_ticket',
      category: 'admin',
      targetId: params.submission.id,
      inAppPreview: `Support response (${params.status}): ${params.adminNote || params.submission.subject}`,
      emailSubject: `Nexora Support Update: ${params.submission.subject}`,
      emailBodyText: `Your Nexora ${params.submission.category.replace(/_/g, ' ')} request "${params.submission.subject}" is now marked "${params.status.replace(/_/g, ' ')}".\n\nAdministrative Note: ${params.adminNote || 'Reviewed by the Nexora team.'}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `contact_submissions/${params.submission.id}`);
  }
}

// --- Section H: Notifications, Announcements & Email Logs ---
export function subscribePlatformAnnouncements(
  callback: (items: PlatformAnnouncement[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'platform_announcements'),
    where('active', 'in', [true, false]),
    limit(40)
  );
  return onSnapshot(
    q,
    (snap) =>
      callback(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<PlatformAnnouncement, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      ),
    () => callback([])
  );
}

export async function publishPlatformAnnouncement(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'security';
}): Promise<void> {
  const now = serverTimestamp();
  try {
    const ref = await addDoc(collection(db, 'platform_announcements'), {
      title: sanitizeString(params.title, BLUEPRINT_LIMITS.ANNOUNCEMENT_TITLE_MAX),
      message: sanitizeString(params.message, BLUEPRINT_LIMITS.ANNOUNCEMENT_MSG_MAX),
      severity: params.severity,
      active: true,
      authorUid: params.actor.uid,
      authorName: sanitizeString(params.actor.displayName, 80),
      createdAt: now,
      updatedAt: now,
    });
    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: 'Published platform announcement',
      category: 'notification',
      targetType: 'announcement',
      targetId: ref.id,
      targetLabel: params.title,
      details: `Severity: ${params.severity}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'platform_announcements');
  }
}

export async function toggleAnnouncementActive(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  announcement: PlatformAnnouncement;
}): Promise<void> {
  try {
    await updateDoc(doc(db, 'platform_announcements', params.announcement.id), {
      active: !params.announcement.active,
      updatedAt: serverTimestamp(),
    });
    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: params.announcement.active ? 'Paused announcement' : 'Activated announcement',
      category: 'notification',
      targetType: 'announcement',
      targetId: params.announcement.id,
      targetLabel: params.announcement.title,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `platform_announcements/${params.announcement.id}`);
  }
}

export async function deleteAnnouncement(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  announcement: PlatformAnnouncement;
}): Promise<void> {
  try {
    await deleteDoc(doc(db, 'platform_announcements', params.announcement.id));
    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: 'Deleted announcement',
      category: 'notification',
      targetType: 'announcement',
      targetId: params.announcement.id,
      targetLabel: params.announcement.title,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `platform_announcements/${params.announcement.id}`);
  }
}

export async function dispatchAdminNotification(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  recipientIds: string[];
  type: 'announcement' | 'security_alert' | 'admin_notice';
  preview: string;
}): Promise<number> {
  const uniqueIds = Array.from(new Set(params.recipientIds)).slice(0, 100);
  if (uniqueIds.length === 0) return 0;

  try {
    const batch = writeBatch(db);
    uniqueIds.forEach((uid) => {
      const ref = doc(collection(db, 'notifications'));
      batch.set(ref, {
        recipientId: uid,
        actorId: params.actor.uid,
        actorName: sanitizeString(params.actor.displayName, 80),
        actorAvatar: sanitizeString(params.actor.avatarUrl || '', 200000),
        type: params.type,
        category: params.type === 'security_alert' ? 'security' : 'admin',
        targetId: '',
        preview: sanitizeString(params.preview, 200),
        read: false,
        createdAt: serverTimestamp(),
      });
    });
    await batch.commit();

    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: `Sent ${params.type} to ${uniqueIds.length} account(s)`,
      category: 'notification',
      targetType: 'notification_batch',
      targetId: uniqueIds.length === 1 ? uniqueIds[0] : 'broadcast',
      details: params.preview,
    });

    return uniqueIds.length;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'notifications');
  }
}

export function subscribeEmailLogs(callback: (logs: EmailLogEntry[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'email_logs'),
    where('status', 'in', ['sent', 'not_configured', 'skipped', 'failed']),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) =>
      callback(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<EmailLogEntry, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      ),
    () => callback([])
  );
}

export async function dispatchAdminDirectEmail(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  to: string;
  subject: string;
  bodyText: string;
  category?: NotificationCategory;
  recipientUid?: string;
  recipientName?: string;
}) {
  const outcome = await dispatchDualNotification({
    recipientUid: params.recipientUid,
    recipientName: params.recipientName || 'Nexora Member',
    recipientEmail: params.to,
    actor: params.actor,
    type: 'admin_notice',
    category: params.category || 'admin',
    targetId: 'settings:notifications',
    inAppPreview: params.subject,
    emailSubject: params.subject,
    emailBodyText: params.bodyText,
  });

  await recordAuditLog({
    actor: params.actor,
    actorRole: params.actorRole,
    action: `Dispatched email (${outcome.emailStatus})`,
    category: 'notification',
    targetType: 'email',
    targetId: params.recipientUid || 'direct',
    details: `${params.subject} (${outcome.emailProvider})`,
  });

  return outcome;
}

// --- Section I: Free Virtual Gift Catalog & Moderation ---
export function subscribeGiftCatalog(
  callback: (items: VirtualGiftCatalogItem[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'gift_catalog'),
    where('tier', 'in', ['free', 'future_premium']),
    limit(40)
  );
  return onSnapshot(
    q,
    (snap) => {
      const overrides = new Map<string, VirtualGiftCatalogItem>();
      snap.docs.forEach((d) => {
        overrides.set(d.id, { id: d.id, ...(d.data() as Omit<VirtualGiftCatalogItem, 'id'>) });
      });
      const mergedMap = new Map<string, VirtualGiftCatalogItem>();
      FREE_GIFT_CATALOG.forEach((base) => {
        mergedMap.set(base.id, overrides.get(base.id) || base);
      });
      overrides.forEach((val, key) => {
        if (!mergedMap.has(key)) mergedMap.set(key, val);
      });
      const sorted = Array.from(mergedMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);
      callback(sorted);
    },
    () => callback([...FREE_GIFT_CATALOG])
  );
}

export async function saveGiftCatalogItem(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  item: VirtualGiftCatalogItem;
}): Promise<void> {
  const giftId = params.item.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || `gift_${Date.now()}`;
  try {
    await setDoc(doc(db, 'gift_catalog', giftId), {
      name: sanitizeString(params.item.name, 60),
      description: sanitizeString(params.item.description, 200),
      emoji: sanitizeString(params.item.emoji, 16) || '🎁',
      category: params.item.category,
      accentColor: sanitizeString(params.item.accentColor, 24) || '#A855F7',
      tier: 'free',
      enabled: Boolean(params.item.enabled),
      sortOrder: Math.max(0, Math.floor(params.item.sortOrder || 0)),
      createdBy: params.actor.uid,
      updatedAt: serverTimestamp(),
    });
    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: `Updated free gift "${params.item.name}"`,
      category: 'platform',
      targetType: 'gift_catalog',
      targetId: giftId,
      details: `Enabled=${params.item.enabled}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `gift_catalog/${giftId}`);
  }
}

export function subscribeAllGiftTransactionsAdmin(
  callback: (items: GiftTransaction[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'virtual_gifts'),
    where('targetType', 'in', ['profile', 'post']),
    limit(120)
  );
  return onSnapshot(
    q,
    (snap) =>
      callback(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<GiftTransaction, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      ),
    () => callback([])
  );
}

export async function adminDeleteGiftTransaction(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  giftTx: GiftTransaction;
}): Promise<void> {
  try {
    await deleteDoc(doc(db, 'virtual_gifts', params.giftTx.id));
    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: `Removed gift transaction (${params.giftTx.giftName})`,
      category: 'moderation',
      targetType: 'virtual_gift',
      targetId: params.giftTx.id,
      targetLabel: `@${params.giftTx.recipientUsername}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `virtual_gifts/${params.giftTx.id}`);
  }
}

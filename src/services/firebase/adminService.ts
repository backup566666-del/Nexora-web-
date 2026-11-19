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
import { handleFirestoreError, OperationType } from './errorHandler';
import {
  AdminPermission,
  AuditLogCategory,
  AuditLogEntry,
  IdentityVerificationRequest,
  InternalRole,
  ModerationReport,
  PlatformAnalyticsSnapshot,
  PlatformAnnouncement,
  PlatformConfig,
  PlatformRole,
  Space,
  SpaceMember,
  UserProfile,
  VerificationRequest,
  VerifiedBadgeRecord,
  VerifiedBadgeType,
} from '../../types/nexora';
import {
  BADGE_LABELS,
  BLUEPRINT_LIMITS,
  DEFAULT_PLATFORM_CONFIG,
  FOUNDER_OWNER_EMAIL,
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
    // Audit write errors are handled transparently without crashing primary UI unless critical
  }
}

export function subscribeAuditLogs(callback: (logs: AuditLogEntry[]) => void): Unsubscribe {
  const q = query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'), limit(120));
  return onSnapshot(
    q,
    (snap) =>
      callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLogEntry, 'id'>) }))),
    (err) => handleFirestoreError(err, OperationType.LIST, 'audit_logs')
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

  try {
    const [roleSnap, badgeSnap, configSnap] = await Promise.all([
      getDoc(roleRef),
      getDoc(badgeRef),
      getDoc(configRef),
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

    if (!badgeSnap.exists() || (badgeSnap.data() as VerifiedBadgeRecord).badgeType !== 'owner') {
      await setDoc(badgeRef, {
        uid: firebaseUser.uid,
        badgeType: 'owner' satisfies VerifiedBadgeType,
        label: BADGE_LABELS.owner,
        updatedBy: firebaseUser.uid,
        updatedAt: now,
      });
    }

    if (!profile.verified) {
      await updateDoc(userRef, {
        verified: true,
        updatedAt: now,
      });
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

// --- Trusted Badge Registry ---
export function subscribeVerifiedBadges(
  callback: (map: Record<string, VerifiedBadgeRecord>) => void
): Unsubscribe {
  const q = query(
    collection(db, 'verified_badges'),
    where('badgeType', 'in', ['owner', 'verified', 'partner', 'creator', 'founder_circle']),
    limit(200)
  );
  return onSnapshot(
    q,
    (snap) => {
      const next: Record<string, VerifiedBadgeRecord> = {};
      snap.docs.forEach((d) => {
        const rec = d.data() as VerifiedBadgeRecord;
        next[d.id] = rec;
      });
      callback(next);
    },
    () => callback({})
  );
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
    limit(250)
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
        email: sanitizeString(params.email || `${params.targetUser.username}@nexora.member`, 254),
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

// --- Section C: Verification Centre ---
export async function assignUserBadge(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  targetUser: UserProfile;
  badgeType: Exclude<VerifiedBadgeType, 'owner'>;
}): Promise<void> {
  try {
    const now = serverTimestamp();
    const batch = writeBatch(db);
    batch.set(doc(db, 'verified_badges', params.targetUser.uid), {
      uid: params.targetUser.uid,
      badgeType: params.badgeType,
      label: BADGE_LABELS[params.badgeType],
      updatedBy: params.actor.uid,
      updatedAt: now,
    });
    batch.update(doc(db, 'users', params.targetUser.uid), {
      verified: true,
      updatedAt: now,
    });
    await batch.commit();

    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: `Granted ${params.badgeType} badge`,
      category: 'verification',
      targetType: 'user',
      targetId: params.targetUser.uid,
      targetLabel: `@${params.targetUser.username}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `verified_badges/${params.targetUser.uid}`);
  }
}

export async function revokeUserBadge(params: {
  actor: UserProfile;
  actorRole: InternalRole;
  targetUser: UserProfile;
}): Promise<void> {
  try {
    const now = serverTimestamp();
    const batch = writeBatch(db);
    batch.delete(doc(db, 'verified_badges', params.targetUser.uid));
    batch.update(doc(db, 'users', params.targetUser.uid), {
      verified: false,
      updatedAt: now,
    });
    await batch.commit();

    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: 'Revoked verification badge',
      category: 'verification',
      targetType: 'user',
      targetId: params.targetUser.uid,
      targetLabel: `@${params.targetUser.username}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `verified_badges/${params.targetUser.uid}`);
  }
}

export async function submitVerificationRequest(params: {
  user: UserProfile;
  requestedBadge: 'verified' | 'creator' | 'partner';
  category: string;
  rationale: string;
  referenceLink?: string;
}): Promise<void> {
  const now = serverTimestamp();
  try {
    await addDoc(collection(db, 'verification_requests'), {
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
  try {
    await updateDoc(doc(db, 'verification_requests', params.request.id), {
      status: params.decision,
      reviewerUid: params.actor.uid,
      reviewerNote: sanitizeString(params.reviewerNote || '', BLUEPRINT_LIMITS.REVIEW_NOTE_MAX),
      reviewedAt: now,
      updatedAt: now,
    });

    if (params.decision === 'approved') {
      const badgeType = params.request.requestedBadge;
      const batch = writeBatch(db);
      batch.set(doc(db, 'verified_badges', params.request.uid), {
        uid: params.request.uid,
        badgeType,
        label: BADGE_LABELS[badgeType],
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
      details: params.reviewerNote || `Badge: ${params.request.requestedBadge}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `verification_requests/${params.request.id}`);
  }
}

// --- Section D: Confidential Identity Verification ---
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
    await addDoc(collection(db, 'identity_verifications'), {
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

    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: `${params.decision === 'approved' ? 'Approved' : 'Rejected'} identity document`,
      category: 'identity',
      targetType: 'identity_verification',
      targetId: params.request.id,
      targetLabel: `@${params.request.username}`,
      details: `${params.request.documentType} (${params.request.documentCountry})`,
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

  const [usersSnap, postsSnap, vibesSnap, spacesSnap, reportsSnap, verifSnap] = await Promise.all([
    getDocs(query(collection(db, 'users'), where('onboardingCompleted', 'in', [true, false]), limit(500))),
    getDocs(query(collection(db, 'posts'), where('audience', 'in', ['public', 'followers', 'space']), limit(500))),
    getDocs(query(collection(db, 'vibes'), where('viewsCount', '>=', 0), limit(500))),
    getDocs(query(collection(db, 'spaces'), where('isPrivate', 'in', [false, true]), limit(300))),
    getDocs(query(collection(db, 'reports'), where('targetType', 'in', ['post', 'user', 'space', 'vibe']), limit(300))),
    getCountFromServer(query(collection(db, 'verification_requests'), where('status', '==', 'pending'))).catch(
      () => null
    ),
  ]);

  let onlineUsers = 0;
  let suspendedUsers = 0;
  let verifiedUsers = 0;
  let registrations24h = 0;
  let registrations7d = 0;

  usersSnap.docs.forEach((d) => {
    const u = d.data() as UserProfile;
    if (u.isOnline) onlineUsers++;
    if (u.suspended) suspendedUsers++;
    if (u.verified) verifiedUsers++;
    const createdMs = u.createdAt?.toMillis?.() ?? 0;
    if (createdMs >= oneDayAgo) registrations24h++;
    if (createdMs >= sevenDaysAgo) registrations7d++;
  });

  let totalEngagement = 0;
  postsSnap.docs.forEach((d) => {
    const p = d.data();
    totalEngagement +=
      (p.likesCount || 0) + (p.commentsCount || 0) + (p.repostsCount || 0) + (p.savesCount || 0);
  });

  let totalVibeViews = 0;
  vibesSnap.docs.forEach((d) => {
    const v = d.data();
    totalVibeViews += v.viewsCount || 0;
    totalEngagement +=
      (v.likesCount || 0) + (v.commentsCount || 0) + (v.repostsCount || 0) + (v.savesCount || 0);
  });

  let activeSpaces = 0;
  let pendingSpaces = 0;
  let suspendedSpaces = 0;
  spacesSnap.docs.forEach((d) => {
    const s = d.data() as Space;
    if (s.status === 'suspended') suspendedSpaces++;
    else if (s.status === 'pending') pendingSpaces++;
    else activeSpaces++;
  });

  const openReports = reportsSnap.docs.filter((d) => {
    const r = d.data() as ModerationReport;
    return !r.status || r.status === 'open';
  }).length;

  return {
    totalUsers: usersSnap.size,
    onlineUsers,
    suspendedUsers,
    verifiedUsers,
    registrations24h,
    registrations7d,
    totalPosts: postsSnap.size,
    totalEngagement,
    totalVibes: vibesSnap.size,
    totalVibeViews,
    totalSpaces: spacesSnap.size,
    activeSpaces,
    pendingSpaces,
    suspendedSpaces,
    openReports,
    pendingVerifications: verifSnap?.data().count ?? 0,
    computedAt: new Date(),
  };
}

// --- Section G: Moderation & Reports ---
export function subscribeReports(callback: (reports: ModerationReport[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'reports'),
    where('targetType', 'in', ['post', 'user', 'space', 'vibe']),
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

// --- Section H: Notifications & Announcements ---
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

/**
 * Phase 0 TDD Security Specification Verification Matrix
 * Documents expected PERMISSION_DENIED outcomes for adversarial payloads
 * against Nexora's Firestore Security Rules including Owner/RBAC governance.
 */
export const DIRTY_DOZEN_CASES = [
  {
    id: 1,
    name: 'Unverified Write Rejection',
    path: '/posts/post_unverified',
    auth: { uid: 'user_1', token: { email_verified: false } },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Author Spoofing Rejection',
    path: '/posts/post_spoof',
    auth: { uid: 'attacker', token: { email_verified: true } },
    payload: { authorId: 'victim' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Self-Verification Privilege Escalation Rejection',
    path: '/users/attacker',
    auth: { uid: 'attacker', token: { email_verified: true } },
    payload: { verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Self-Assigned Platform Owner Role Escalation Rejection',
    path: '/platform_roles/attacker',
    auth: { uid: 'attacker', token: { email: 'attacker@gmail.com', email_verified: true } },
    payload: { role: 'owner', ownerBadge: true, active: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Self-Assigned Blue Owner Badge Spoofing Rejection',
    path: '/verified_badges/attacker',
    auth: { uid: 'attacker', token: { email: 'attacker@gmail.com', email_verified: true } },
    payload: { badgeType: 'owner' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Delegated Administrator Demoting Founder Owner Rejection',
    path: '/platform_roles/founder_uid',
    auth: { uid: 'delegated_admin', token: { email: 'admin@nexora.app', email_verified: true } },
    payload: { role: 'support', active: false },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Unauthorized Identity Verification Document Access Rejection',
    path: '/identity_verifications/req_1',
    auth: { uid: 'moderator_without_id_perm', token: { email_verified: true } },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Immutable Audit Log Modification / Deletion Rejection',
    path: '/audit_logs/log_1',
    auth: { uid: 'founder_uid', token: { email: 'backup566666@gmail.com', email_verified: true } },
    payload: { result: 'tampered' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'PII Private Subcollection Read Isolation',
    path: '/users/victim/private/account',
    auth: { uid: 'attacker', token: { email_verified: true } },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Conversation Eavesdropping Rejection',
    path: '/conversations/conv_private',
    auth: { uid: 'attacker', token: { email_verified: true } },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Unverified Founder Email Spoof Rejection',
    path: '/platform_roles/spoof',
    auth: { uid: 'spoof', token: { email: 'backup566666@gmail.com', email_verified: false } },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unbounded Payload / Shadow Field Exhaustion Rejection',
    path: '/posts/post_big',
    auth: { uid: 'user_1', token: { email_verified: true } },
    payload: { textLength: 5000, isPromoted: true },
    expected: 'PERMISSION_DENIED',
  },
];

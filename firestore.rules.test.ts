/**
 * Phase 0 TDD Security Specification Verification Matrix
 * Documents expected PERMISSION_DENIED outcomes for the Dirty Dozen adversarial payloads
 * against Nexora's Firestore Security Rules.
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
    name: 'Shadow Field Injection Rejection',
    path: '/posts/post_shadow',
    auth: { uid: 'user_1', token: { email_verified: true } },
    payload: { isPromoted: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'PII Private Subcollection Read Isolation',
    path: '/users/victim/private/account',
    auth: { uid: 'attacker', token: { email_verified: true } },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Conversation Eavesdropping Rejection',
    path: '/conversations/conv_private',
    auth: { uid: 'attacker', token: { email_verified: true } },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Foreign Chat Message Injection Rejection',
    path: '/conversations/conv_private/messages/msg_1',
    auth: { uid: 'attacker', token: { email_verified: true } },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Notification Scraping Rejection',
    path: '/notifications/notif_victim',
    auth: { uid: 'attacker', token: { email_verified: true } },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Path Variable ID Poisoning Rejection',
    path: '/posts/invalid id with spaces',
    auth: { uid: 'user_1', token: { email_verified: true } },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Immutable Field Overwrite Rejection',
    path: '/posts/post_1',
    auth: { uid: 'user_1', token: { email_verified: true } },
    payload: { authorId: 'other_user' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Non-Member Space Discussion Write Rejection',
    path: '/spaces/space_1/discussions/msg_1',
    auth: { uid: 'outsider', token: { email_verified: true } },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unbounded Payload Exhaustion Rejection',
    path: '/posts/post_big',
    auth: { uid: 'user_1', token: { email_verified: true } },
    payload: { textLength: 5000 },
    expected: 'PERMISSION_DENIED',
  },
];

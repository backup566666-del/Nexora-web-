# NEXORA Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Identity Integrity**: Every user-authored document (`posts`, `vibes`, `stories`, `comments`, `messages`, `reports`, `spaces`) MUST enforce `incoming().authorId == request.auth.uid` (or `senderId` / `ownerId` / `reporterId` == `request.auth.uid`) and require `request.auth.token.email_verified == true`.
2. **PII Isolation**: User email, blocked user lists, and privacy preferences live strictly in `users/{userId}/private/{docId}` where `read` and `write` are restricted exclusively to `request.auth.uid == userId`. Public `users/{userId}` documents contain zero PII.
3. **Anti-Privilege-Escalation**: Users cannot set `verified: true` on their own profile or Space during creation or profile update; `verified` is locked against self-modification.
4. **Master Gate Subcollections**: Access to `spaces/{spaceId}/discussions` and `spaces/{spaceId}/events` checks membership via `exists(/databases/$(database)/documents/spaces/$(spaceId)/members/$(request.auth.uid))`. Access to `conversations/{convId}/messages` verifies `request.auth.uid in get(.../conversations/$(convId)).data.participantIds`.
5. **Temporal Integrity & Immortality**: `createdAt == request.time` on creation; `createdAt`, `uid`, `authorId`, `ownerId` are immutable on updates.
6. **Strict List Query Enforcement**: `conversations` list queries require `request.auth.uid in resource.data.participantIds`; `notifications` list/get queries require `resource.data.recipientId == request.auth.uid`.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unverified Write**: Write to `/posts/{postId}` with `email_verified: false` -> DENIED.
2. **Author Spoofing**: Create `/posts/{postId}` with `authorId: "victim_uid"` while authenticated as `"attacker_uid"` -> DENIED.
3. **Self-Verification Privilege Escalation**: Update `/users/{uid}` setting `verified: true` -> DENIED.
4. **Shadow Field Injection**: Create `/posts/{postId}` with extra undeclared field `isPromoted: true` -> DENIED.
5. **PII Read Leak**: Read `/users/{victimUid}/private/account` as `"attacker_uid"` -> DENIED.
6. **Conversation Eavesdropping**: List or get `/conversations/{convId}` where `"attacker_uid"` is not in `participantIds` -> DENIED.
7. **Message Injection into Foreign Chat**: Write to `/conversations/{convId}/messages/{msgId}` by non-participant -> DENIED.
8. **Notification Scraping**: List `/notifications` without scoping to `recipientId == request.auth.uid` or reading another user's notification -> DENIED.
9. **ID Poisoning**: Create `/posts/invalid id with spaces and 200 chars...` -> DENIED by `isValidId()`.
10. **Immutable Field Overwrite**: Update `/posts/{postId}` changing `createdAt` or `authorId` -> DENIED.
11. **Non-Member Space Discussion Write**: Create `/spaces/{spaceId}/discussions/{msgId}` without a `/spaces/{spaceId}/members/{uid}` document -> DENIED.
12. **Unbounded Array / Payload Exhaustion**: Create `/posts/{postId}` with 20 hashtags or > 2000 character text -> DENIED.

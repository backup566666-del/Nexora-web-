# NEXORA Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Founder / Owner Cryptographic Anchor**: Only Firebase Auth accounts with `request.auth.token.email_verified == true && request.auth.token.email == 'backup566666@gmail.com'` can establish or hold `role == 'owner'` or `ownerBadge == true` in `/platform_roles/{uid}` and `badgeType == 'owner'` in `/verified_badges/{uid}`.
2. **Non-Demotable Owner**: Ordinary administrators (`administrator`, `moderator`, `verification_reviewer`, `support`) and regular users CANNOT modify, suspend, delete, or demote the founder's `/platform_roles/{uid}`, `/verified_badges/{uid}`, or `/users/{uid}` records.
3. **Zero-Trust Identity & No Self-Verification**: Users cannot set `verified: true` or `suspended: true/false` on `/users/{uid}`, cannot write `/platform_roles/{uid}` or `/verified_badges/{uid}`, and cannot approve their own `/verification_requests` or `/identity_verifications`.
4. **PII & Identity Document Isolation**:
   - Account email, blocked users, and privacy settings live in `users/{userId}/private/{docId}` (`isOwner(userId)` only).
   - Submitted government/identity documents live exclusively in `/identity_verifications/{requestId}`, readable ONLY by the submitting owner (`isOwner(existing().uid)`), the platform `owner`, or explicitly authorized reviewers holding `review_identity_docs` permission.
   - Public verified badge lookups use zero-PII `/verified_badges/{uid}` documents containing only `uid`, `badgeType`, `label`, `updatedBy`, `updatedAt`.
5. **Immutable Audit Trail**: Every administrative write logs to `/audit_logs/{logId}` (`allow update, delete: if false`), and email dispatches log with masked emails to `/email_logs/{logId}` (`allow update, delete: if false`).
6. **Master Gate Subcollections & Strict List Queries**: Space discussions/events require Space membership; conversations require `request.auth.uid in participantIds`; notifications require `recipientId == request.auth.uid`.
7. **Collaboration & Tag Consent**: Invited collaborators only join `collaboratorUids` when accepting; tagged users can remove themselves (`!(request.auth.uid in incoming().taggedUids)`); privacy controls govern tagging/collab eligibility.
8. **Strictly Free Virtual Gifts**: `/gift_catalog` rules enforce `tier == 'free'` on write; `/virtual_gifts` prohibits self-gifting (`senderUid != recipientUid`) and contains zero financial/coin fields.

## 2. The "Dirty Dozen+" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unverified Write**: Write to `/posts/{postId}` with `email_verified: false` -> DENIED.
2. **Author Spoofing**: Create `/posts/{postId}` with `authorId: "victim_uid"` while authenticated as `"attacker_uid"` -> DENIED.
3. **Self-Verification Privilege Escalation**: Update `/users/{uid}` setting `verified: true` -> DENIED.
4. **Self-Role Escalation**: Write `/platform_roles/{attackerUid}` with `{ role: "owner" }` or `{ role: "administrator" }` by non-founder -> DENIED.
5. **Self-Assigned Owner Badge**: Write `/verified_badges/{attackerUid}` with `{ badgeType: "owner" }` -> DENIED.
6. **Admin Demoting Owner**: An `administrator` attempts to update or delete the founder's `/platform_roles/{founderUid}` or suspend `/users/{founderUid}` -> DENIED.
7. **Unauthorized Identity Document Read**: Ordinary user OR an `administrator` without `review_identity_docs` attempts to `get` or `list` `/identity_verifications/{reqId}` -> DENIED.
8. **Audit Log Tampering**: Staff or user attempts to `update` or `delete` `/audit_logs/{logId}` -> DENIED.
9. **PII Read Leak**: Read `/users/{victimUid}/private/account` as `"attacker_uid"` -> DENIED.
10. **Conversation Eavesdropping**: List or get `/conversations/{convId}` where `"attacker_uid"` is not in `participantIds` -> DENIED.
11. **Non-Founder Email Spoof**: Request where `email == 'backup566666@gmail.com'` with `email_verified: false` -> DENIED.
12. **Shadow Field / Unbounded Payload Exhaustion**: Create `/posts/{postId}` with undeclared field or > 2000 chars -> DENIED.

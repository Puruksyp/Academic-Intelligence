# Security Specification - Academic Intelligence

## Data Invariants
1. A **User** profile must match the authenticated identity.
2. An **Analysis** must always belong to the user who uploaded the file.
3. Timestamps (`createdAt`, `updatedAt`) must be strictly controlled by the server.
4. Document IDs must be sanitized to prevent path injection.
5. Analysis results are strictly read-only for the owner once created, except for potential cleanup (delete).

## The "Dirty Dozen" Payloads (Red Team Test Cases)

1. **Identity Spoofing**: Attempt to create a user profile for `user_B` while authenticated as `user_A`.
2. **Path Injection**: Attempt to create an analysis with a document ID containing `../`.
3. **Ghost Fields (User)**: Attempt to add an `isAdmin: true` field to the user profile.
4. **Ghost Fields (Analysis)**: Attempt to add a `verified: true` field to an analysis document.
5. **Timestamp Forge**: Attempt to set `createdAt` to a date in the future instead of `request.time`.
6. **Immutable Violation**: Attempt to change the `userId` or `createdAt` of an existing analysis.
7. **Cross-User Read**: User A attempts to `get` User B's analysis by ID.
8. **PII Leakage**: Attempting to `list` all users to scrape emails.
9. **Type Poisoning**: Attempt to set `totalQuestions` to a 1MB string instead of an integer.
10. **Size Exhaustion**: Attempt to send a `summary` larger than 5000 characters.
11. **Orphans**: Attempt to create an analysis for a user path that doesn't have a profile yet (relational check).
12. **Unauthorized Metadata**: Attempt to set `status: 'verified'` instead of `status: 'completed'`.

## Test Runner Logic
The `firestore.rules.test.ts` will verify that all the above payloads result in `PERMISSION_DENIED`.

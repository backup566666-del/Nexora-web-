# NEXORA — Next-Generation Social Network

**Official Slogan:** CONNECT. CREATE. SHARE. BELONG.

## Architecture Overview
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Vite
- **Backend**: Google Firebase (Authentication, Cloud Firestore, Firestore Security Rules, Storage Rules)
- **Visual Identity**: Custom geometric SVG `NexoraLogo` component, dark obsidian (`#06060A`) & electric violet (`#7C3AED` / `#8B5CF6`) theme, Outfit + Plus Jakarta Sans + JetBrains Mono typography.

## Project Structure
- `src/components/branding/` — Official Nexora SVG logo (`NexoraLogo.tsx`)
- `src/components/navigation/` — Adaptive scroll-aware desktop dashboard shell (`DashboardShell.tsx`)
- `src/components/media/` — Reusable cover & thumbnail cropping/repositioning editor (`CoverEditorModal.tsx`)
- `src/pages/landing/` — Desktop-first landing page with interactive platform preview
- `src/pages/auth/` — Google OAuth, Email/Password registration, Email verification gate, Password reset, and 5-step Onboarding
- `src/pages/home/` — Home social feed, Stories, and Post composer
- `src/pages/vibes/` — Full-screen vertical short-video experience & creation studio
- `src/pages/create/` — Unified creation center & media editor
- `src/pages/chat/` — Real-time private DMs, group chats, voice notes, attachments, and audio/video call rooms
- `src/pages/spaces/` — Visual community Spaces, discussions, events, voice rooms, and moderation
- `src/pages/profile/` — Approved Nexora profile layout & content tabs
- `src/pages/settings/` — Privacy controls, blocked users, and security management
- `src/services/firebase/` — Firebase SDK initialization (`config.ts`), structured error handling (`errorHandler.ts`), and Firestore social queries (`socialService.ts`)
- `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `firebase-blueprint.json`, `firebase.json`

## External Setup Checklist
1. **Email/Password Sign-In**: Enable **Email/Password** in Firebase Console -> Authentication -> Sign-in method (Google Sign-In is provisioned automatically).
2. **Firebase Storage CORS / Rules**: Deploy `storage.rules` and ensure Firebase Storage is initialized in Firebase Console for multi-megabyte video/audio uploads (small images compress automatically as a resilient fallback).
3. **Custom 6-Digit Verification Codes & E2EE Key Directory**: Connect a verified Nexora domain and transactional email provider (e.g., Resend/SendGrid via Cloud Functions) to activate `src/services/email/verificationCodeService.ts`, and deploy a public-key directory to activate full E2EE in `src/utils/cryptoProtocol.ts`.

## Commands
```bash
npm install
npm run lint
npm run build
```

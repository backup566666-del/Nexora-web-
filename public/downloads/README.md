# Nexora Public APK Downloads Directory

Place verified signed Android `.apk` releases here when self-hosting builds directly from the Nexora Express server:

- **Canonical Latest File**: `public/downloads/nexora-latest.apk` (served at `https://<your-domain>/downloads/nexora-latest.apk`)

Alternatively, leave this directory without binaries and configure the server environment variable:

```env
ANDROID_APK_DOWNLOAD_URL=https://github.com/<owner>/<repo>/releases/download/<tag>/nexora-v1.0.0-release.apk
ANDROID_APK_VERSION=1.0.0
```

> **Note**: Do **not** upload unsigned debug builds or empty placeholder `.apk` files here. `/api/app/android-release` checks both `ANDROID_APK_DOWNLOAD_URL` and valid APK ZIP signatures (`PK\x03\x04`) before enabling the download button on the website.

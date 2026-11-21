# Nexora Android App Build & Hosting Guide (Cloud + Android Phone Friendly)

This directory configures the **Nexora** Android wrapper (`social.nexora.app`) using **Bubblewrap (Trusted Web Activity / TWA)** connected directly to the live Nexora web app and shared Firebase production backend (`gen-lang-client-0024648348`).

> **Important Security Rule**: Never commit `.keystore`, `.jks`, passwords, or private signing keys into Git.

---

## Android SDK & Package Configuration
- **Package ID**: `social.nexora.app`
- **Target SDK / API Level**: `35` (Android 15)
- **Compile SDK**: `35`
- **Min SDK**: `24` (Android 7.0+)
- **Display Mode**: `standalone` (full-screen TWA once Digital Asset Links verifies)
- **Theme / Splash Color**: `#06060A`

---

## Cloud Build From an Android Phone (No PC Required)

### Step 1: Create Your Private Android Signing Keystore
You can do this completely from your Android phone using either **GitHub Codespaces** in your browser or **Termux**:

#### Option A — GitHub Codespaces (Mobile Browser)
1. Push this project to your GitHub repository.
2. Open the repository on GitHub in Chrome on your phone → tap **Code** → **Codespaces** → **Create codespace on main**.
3. Run:
   ```bash
   keytool -genkeypair -v \
     -keystore nexora-release.keystore \
     -alias nexora \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
4. Print the public SHA-256 fingerprint (save this for Digital Asset Links):
   ```bash
   keytool -list -v -keystore nexora-release.keystore -alias nexora | grep SHA256
   ```
5. Encode the keystore to a single Base64 line for GitHub Secrets:
   ```bash
   base64 -w 0 nexora-release.keystore
   ```
6. Copy the keystore safely to private offline storage (e.g. a password manager) and delete `nexora-release.keystore` from the Codespace.

#### Option B — Termux on Android
```bash
pkg update && pkg install openjdk-17
keytool -genkeypair -v -keystore ~/nexora-release.keystore -alias nexora -keyalg RSA -keysize 2048 -validity 10000
keytool -list -v -keystore ~/nexora-release.keystore -alias nexora | grep SHA256
base64 -w 0 ~/nexora-release.keystore
```

---

### Step 2: Add GitHub Repository Secrets
In your GitHub repository, open **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret Name | Value |
|---|---|
| `NEXORA_ANDROID_KEYSTORE_BASE64` | Single-line Base64 output of `nexora-release.keystore` |
| `NEXORA_ANDROID_KEYSTORE_PASS` | Store password chosen during `keytool` |
| `NEXORA_ANDROID_KEY_ALIAS` | `nexora` (or your chosen alias) |
| `NEXORA_ANDROID_KEY_PASS` | Key password chosen during `keytool` |

---

### Step 3: Configure Digital Asset Links
Set your server environment variable on Railway (or your hosting provider):
```env
ANDROID_SHA256_FINGERPRINTS=YOUR:ACTUAL:SHA256:FINGERPRINT:HERE
```
*(Or replace the `00:00:...` placeholder inside `public/.well-known/assetlinks.json`.)*

Verify in Chrome that `https://<your-domain>/.well-known/assetlinks.json` serves your real SHA-256 fingerprint cleanly.

---

### Step 4: Trigger the Cloud Android Build
1. Open your GitHub repository → **Actions** tab.
2. Select **Nexora Android TWA Build** → tap **Run workflow**.
3. Enter:
   - **host**: your live HTTPS domain without `https://` (e.g., `your-app.up.railway.app` or `nexora.social`)
   - **versionName**: `1.0.0`
   - **versionCode**: `1`
   - **createGitHubRelease**: checked (`true`)
4. Once finished (~3–4 minutes), check the **Summary** tab of the workflow run for your public HTTPS `.apk` release URL.

---

### Step 5: Activate Public Website Download
Choose either option:
- **Option 1 (Recommended — Direct Env Var, Zero Repo Bloat)**:
  Set on your server / Railway environment variables:
  ```env
  ANDROID_APK_DOWNLOAD_URL=https://github.com/<user>/<repo>/releases/download/android-v1.0.0-b1/nexora-v1.0.0-release.apk
  ANDROID_APK_VERSION=1.0.0
  ```
- **Option 2 (Self-Hosted Static File)**:
  Place the verified signed APK at `public/downloads/nexora-latest.apk` and redeploy.

The Nexora server automatically verifies either the HTTPS release URL or a valid non-empty APK binary before enabling the **Get the Nexora App** download button on the landing page.

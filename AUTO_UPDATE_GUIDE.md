# 🚀 SachalAI Auto-Updater & GitHub Release Guide

This guide explains how to connect your GitHub repository, distribute the `.msi` file to new users, and release updates that automatically update installed apps without reinstalling.

---

## 📌 How The System Works

1. **For New Users (First-time install):**
   - You give them the `.msi` (or `setup.exe`) file.
   - They run it once. The app installs and creates a desktop shortcut.

2. **For Existing Users (Automatic updates):**
   - Whenever you build a new version and upload it to GitHub Releases, SachalAI detects it automatically.
   - Users see a **"v... Available"** topbar pill and an **"Update Now"** button in **Settings**.
   - With one click, it downloads, verifies cryptographic authenticity, replaces files, and restarts.

---

## 🛠️ Step 1 — Connect Your GitHub Repository

In [src-tauri/tauri.conf.json](file:///F:/Desktop_ChatBot/SachalAI/src-tauri/tauri.conf.json), locate line 49:

```json
"plugins": {
  "updater": {
    "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEVFQ0I1ODA0NjZBQzQ3N0IKUldSN1I2eG1CRmpMN3U5cnUvbFFRUU45T2VKU1FoZ3k3SW9XV1c1VmtTbHhyWmZJSWJuQVhQeDgK",
    "endpoints": [
      "https://github.com/CodeCraftSolution006/sachalai/releases/latest/download/latest.json"
    ]
  }
}
```

Connected to: `https://github.com/CodeCraftSolution006/sachalai`

---

## 📦 Step 2 — How To Build & Publish An Update (Local 1-Command Method)

Whenever you want to release an update:

### 1. Increase the version number
Bump version in both:
- [package.json](file:///F:/Desktop_ChatBot/SachalAI/package.json) (e.g., change `"0.1.0"` to `"0.2.0"`)
- [src-tauri/tauri.conf.json](file:///F:/Desktop_ChatBot/SachalAI/src-tauri/tauri.conf.json) (change `"version": "0.1.0"` to `"0.2.0"`)

### 2. Run the release builder script
In your terminal, simply run:
```powershell
npm run build:release
```

This automated script will:
- Set up your private cryptographic signing key
- Compile the production frontend and Rust desktop app
- Locate the `.msi` installer, `.exe` setup, updater `.zip`, and `.sig` signature
- **Automatically generate the `latest.json` manifest** with matching download URLs
- Bundle everything into a neat folder: `F:\Desktop_ChatBot\SachalAI\release-artifacts\`

### 3. Upload to GitHub Releases
1. Open your GitHub repository in your browser.
2. Click **Releases** (on the right sidebar) -> **Draft a new release**.
3. Set **Choose a tag**: type `v0.2.0` (matching your version) and click **Create new tag**.
4. Set **Release title**: `SachalAI v0.2.0`.
5. Under **Attach binaries by dropping them here**, drag and drop **ALL** files from `F:\Desktop_ChatBot\SachalAI\release-artifacts\`:
   - `SachalAI_0.2.0_x64_en-US.msi` *(for any new users)*
   - `SachalAI_0.2.0_x64-setup.exe` *(alternative installer)*
   - `SachalAI_0.2.0_x64-setup.nsis.zip` *(update bundle)*
   - `SachalAI_0.2.0_x64-setup.nsis.zip.sig` *(security signature)*
   - `latest.json` *(auto-update manifest)*
6. Click **Publish release**.

🎉 **That's it!** All users running older versions will receive the update notification and can update inside the app with a single click.

---

## ☁️ Alternative: Cloud Automation (GitHub Actions)

If your project is pushed to GitHub, you can also have GitHub build and publish releases automatically in the cloud whenever you push a git tag:

1. Copy the contents of `src-tauri/sachalai.key`:
   ```powershell
   Get-Content "src-tauri\sachalai.key" -Raw
   ```
2. In GitHub, go to **Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret**.
   - Name: `TAURI_SIGNING_PRIVATE_KEY`
   - Value: *(paste the contents from `sachalai.key`)*
3. Whenever you push a tag:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
   GitHub Actions will automatically build for Windows, sign the binaries, generate `latest.json`, and publish the GitHub release for you!

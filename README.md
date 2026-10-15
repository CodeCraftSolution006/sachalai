# ⚡ SachalAI

**SachalAI** is a lightning-fast, sleek desktop AI assistant powered by **Tauri v2**, **React 19**, and the **Groq Cloud LLM API**.

![SachalAI Screenshot](app-icon.png)

---

## ✨ Features

- 💬 **Ultra-Fast LLM Inference:** Powered by Groq's high-speed API (`openai/gpt-oss-20b`, `llama-3.3-70b-versatile`, etc.).
- 👁️ **Vision Support:** Image upload & multimodal reasoning via `qwen/qwen-2.5-vl` / `qwen3.8-27b`.
- 🌐 **Live Web Search:** Built-in web research capability via DuckDuckGo.
- 🎨 **Deep-Navy Glassmorphic UI:** Custom frameless window design with minimize, maximize, and close controls.
- 🔄 **In-App Auto-Updater:** Seamless in-app updates with Minisign cryptographic verification powered by GitHub Releases.
- 💾 **Local Persistence:** Chat history and settings stored locally and securely in app data.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Rust](https://www.rust-lang.org/) (stable)
- Windows 10/11 with MSVC build tools

### Installation & Development

```bash
# Clone the repository
git clone https://github.com/CodeCraftSolution006/sachalai.git
cd sachalai

# Install dependencies
npm install

# Run in development mode
npm run tauri dev
```

---

## 📦 Building & Publishing Releases

To build a release with automatic update manifests:

```powershell
npm run build:release
```

All installers and update packages (`.msi`, `setup.exe`, `.zip`, `.sig`, and `latest.json`) will be generated into `release-artifacts/`.

For full step-by-step update publishing instructions, see [AUTO_UPDATE_GUIDE.md](AUTO_UPDATE_GUIDE.md).

---

## 📄 License

MIT

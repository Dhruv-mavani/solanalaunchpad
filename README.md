# 🚀 Solana SPL Token Launchpad & Liquidity Pool Builder

A next-generation, premium decentralized application (dApp) built on the **Solana Blockchain**. This platform enables anyone to launch custom SPL tokens, manage asset security authorities, and construct Raydium-compatible constant product liquidity pools with a built-in automated swap simulator.

Designed with rich glassmorphism aesthetics, dynamic micro-animations, and high-speed parallelized network routing to handle RPC rate limits and ISP IPFS blockages natively.

---

## ✨ Core Features

### 🪙 1. Token Launchpad Console
*   **Decentralized Asset Creation:** Deploy custom Solana SPL tokens to the Mainnet or Devnet instantly.
*   **Metadata Integration:** Seamlessly upload token icons and metadata directly to IPFS with Pinata integration.
*   **Token Security Console:** Inspect launched assets and view trust scores based on authority structures.
*   **Authority Control:** Lock supply permanently by revoking **Mint Authority** or freeze/blacklist risks by revoking **Freeze Authority** directly from the UI.
*   **Supply Management:** Mint more reserves securely or transfer assets across wallets.

### 🌊 2. Liquidity Pool Builder
*   **Raydium-Compatible Pools:** Create and initialize constant product market maker liquidity pools.
*   **Flexible Pairings:** Select any custom base token and quote token (including native SOL) directly from your connected wallet.
*   **Depth Provisioning:** Supply initial liquidity ratios with automatic balance checks.
*   **Integrated Swap Simulator:** Play out swap trades (Sell Base / Sell Quote) instantly inside a sandbox to test your pool's pricing curve before committing mainnet assets.

### ⚡ 3. High-Performance Core (The Engine)
*   **Zero-Delay UI Resolution:** Fully parallelized token metadata fetcher utilizing `Promise.all` to query, unpack, and parse all 15+ wallet token balances simultaneously in under **1.5 seconds** (previously 75+ seconds).
*   **ISP & CORS Resilient CDN Routing:** Features a custom strict-timeout fallback routing network across 8 major IPFS gateways to seamlessly bypass ISP connection blocks and CORS limitations.
*   **Alchemy RPC Bypasses:** Custom decoders to run complex wallet scans natively without triggering rate-limits or restricted `getParsedTokenAccountsByOwner` rejections on Alchemy's free tier.

---

## 🛠️ Tech Stack & Architecture

*   **Frontend Core:** React, Vite, TypeScript
*   **Styling System:** Tailwind CSS, Custom Glassmorphic CSS Engine
*   **Web3 SDKs:** `@solana/web3.js`, `@solana/spl-token`, `@solana/wallet-adapter-react`
*   **Decentralized Storage:** Pinata API, IPFS IPFS CDN network
*   **RPC Node:** Alchemy Secure Devnet API

---

## 🚀 Getting Started

### 📋 Prerequisites
*   Node.js (v18 or higher)
*   A Solana Wallet extension (e.g., Phantom, Solflare)

### ⚙️ Installation & Setup

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/Dhruv-mavani/week-6-web3-token-launchpad.git
    cd week-6-web3-token-launchpad/1-token-launchpad-starter
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment Variables:**
    Create a `.env` file inside the `1-token-launchpad-starter` directory and populate it:
    ```env
    VITE_ALCHEMY_DEVNET_RPC=https://solana-devnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY
    VITE_PINATA_JWT=YOUR_PINATA_JWT_TOKEN
    ```

4.  **Run Locally in Development Mode:**
    ```bash
    npm run dev
    ```
    Open your browser and navigate to `http://localhost:5173` to see the live app!

---

## 🛡️ Security & Audits Console

The built-in token dashboard inspects your custom SPL assets and labels them based on their contract states:
*   🟢 **Safe Launch:** Both Mint and Freeze authorities are permanently revoked. The supply is fixed, and the developer cannot rug-pull or freeze user balances.
*   🟡 **Unsecured:** Mint or Freeze authorities are still active. Users are warned that the creator holds high-clearance administration permissions.

---

## 👤 Developer
Built with 💜 by **[Dhruv Mavani](https://dhruvmavani.me)**. Feel free to connect, fork, or star this repository!

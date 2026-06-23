# Changelog

All notable changes to SpellQuest AR. Dates are 2026.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased] — 2026-06-24

### Added
- **Spell Sage on 0G Compute.** Key-safe Node proxy (`server/og-proxy.mjs`,
  `npm run og:proxy`) forwarding OpenAI-style `/chat/completions` to the 0G
  Compute Router; the agent's lines become real model inference once configured.
  Verified against the live testnet Router.
- **Auto-submit on exit + live leaderboard.** Leaving a solo session
  auto-submits your session best on-chain (one wallet confirm); `TOP SPELLERS`
  polls the contract every 10s; player name is remembered.
- **Lifelike agent.** Continuous breathing + randomized blinking + celebrate
  sparkles; spontaneous idle chatter after ~13s; win-streak reactions; a worried
  expression when the tray goes off the target word.

### Changed
- Default Sage model set to **Qwen2.5-Omni** (the 0G testnet Router's chat model;
  `llama-3.3-70b` isn't served there).

## [0.1.0] — 2026-06-23 · Zero Cup build day

### Added
- **On-chain leaderboard (0G Chain).** `contracts/SpellQuestLeaderboard.sol`,
  ethers v6 service (`services/zeroG.ts`), and in-game Leaderboard UI. Deployed
  to the **0G Galileo testnet** and **Sourcify-verified**. Prebuilt artifact +
  `solc`-free `contracts/deploy.mjs`; `contracts/DEPLOY.md` guide.
- **Spell Sage AI agent.** On-screen companion (`components/SpellSage.tsx`,
  `services/sage.ts`) that coaches live — local heuristic coach with a
  0G-Compute-ready inference path; never a chatbot.
- **Anime mascot.** Interactive `components/SageCharacter.tsx` with 5 expressions
  exported from the sutemo visual-novel PSD, plus a hand-drawn SVG fallback.
  Installed the `ui-ux-pro-max` design skill.
- **Wallet UX.** Multi-wallet picker via **EIP-6963**, plus a disconnect action.
- **Product-demo video.** Built with the HeyGen HyperFrames skill suite —
  animated intro hook + gameplay + outro CTA (`SpellQuest-demo.mp4`).
- **Project hygiene.** Apache-2.0 `LICENSE`; corrected `metadata.json`.

### Fixed
- Wallet connect failing when multiple extensions fight over `window.ethereum`
  (resolved via EIP-6963 discovery).
- `.env` (holding an API key) was not ignored — now gitignored.

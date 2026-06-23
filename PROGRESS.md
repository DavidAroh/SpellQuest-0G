# SpellQuest AR — Zero Cup Progress Note

_Updated 2026-06-24 · 0G Zero Cup 2026 (“AI-native on 0G”)_

**SpellQuest AR** is a hands-free, augmented-reality spelling game: hold your hand
to the webcam, **pinch** to grab letter tiles, and spell the target word — no
mouse or keyboard. It is built on **0G** on two fronts: an **on-chain leaderboard**
and an **on-screen AI agent**.

## What’s live on 0G

### 1. On-chain leaderboard — 0G Chain (Galileo testnet, chain `16602`)
- Smart contract **`SpellQuestLeaderboard`**, **deployed and Sourcify-verified**.
  Explorer: `https://chainscan-galileo.0g.ai/address/<CONTRACT_ADDRESS>` _(paste full address)_.
- Players connect a wallet in-game (no private key ever touches the app), and
  best scores are written on-chain; the global board is read straight from chain.
- **Frictionless UX:** scores **auto-submit when you leave a solo session** (one
  wallet confirm), your name is remembered, and the board updates **live** every
  10s. Multi-wallet support via EIP-6963.

### 2. Spell Sage — an AI agent on 0G Compute
- A persistent on-screen anime companion (**not** a chatbot — you never type)
  that watches live game state and coaches you: hints, win-streak hype,
  time-pressure nudges, and a worried face when you go off-track.
- Inference runs through the **0G Compute Router** (model: **Qwen2.5-Omni**) via a
  key-safe proxy; a local heuristic coach is the graceful fallback, so the agent
  is always alive — even offline.
- Tuned to **feel alive**: breathing, randomized blinking, celebrate sparkles,
  and spontaneous idle chatter.

## Progress since the group-stage submission
- Deployed + verified the leaderboard contract on 0G Galileo.
- Wired the Sage to real **0G Compute** inference (Qwen2.5-Omni) behind a proxy.
- Auto-submit-on-exit, live board, remembered name.
- Made the agent feel alive (idle behaviour, streaks, off-track reactions).
- Produced a polished **product-demo video**.

## Roadmap (next rounds)
- **2-player puzzle duel** with on-chain **testnet-token reward escrow**.
- Richer **INFT (ERC-7857)** companion: the Sage persists/levels up across
  sessions via **0G Storage**.
- Gasless real-time submission via a session-key relayer.

## Tech
React 19 · TypeScript · Vite · MediaPipe Hands · **0G Galileo testnet** (ethers v6)
· **0G Compute** (Qwen2.5-Omni) · PeerJS · Web Audio.

## Links
- Repo: `<GITHUB_URL>`
- Demo video: `<VIDEO_URL>`
- Contract: `https://chainscan-galileo.0g.ai/address/<CONTRACT_ADDRESS>`

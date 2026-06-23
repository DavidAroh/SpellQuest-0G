# Deploying the SpellQuest Leaderboard to 0G

The leaderboard lives in [`SpellQuestLeaderboard.sol`](./SpellQuestLeaderboard.sol)
and runs on the **0G Galileo testnet**.

| | |
| --- | --- |
| Network name | 0G Galileo Testnet |
| Chain ID | `16602` (`0x40DA`) |
| RPC | `https://evmrpc-testnet.0g.ai` |
| Currency | `0G` |
| Explorer | https://chainscan-galileo.0g.ai |
| Faucet | https://faucet.0g.ai |

## 0. Get test tokens

1. Add the network above to MetaMask (the in-app **Leaderboard → Connect Wallet**
   button does this for you in one click).
2. Visit the [faucet](https://faucet.0g.ai) and request `0G` to your address
   (0.1 0G/day is plenty — deployment costs a fraction of that).

## Option A — Remix (no install, recommended for the hackathon)

1. Open https://remix.ethereum.org and paste in `SpellQuestLeaderboard.sol`.
2. Compile with Solidity `0.8.20+`.
3. In **Deploy & Run**, set Environment to **Injected Provider — MetaMask**,
   with MetaMask on the 0G Galileo network.
4. Click **Deploy**, confirm in MetaMask.
5. Copy the deployed address into `.env.local`:
   ```
   VITE_OG_LEADERBOARD_ADDRESS=0xYourDeployedAddress
   ```
6. Restart `npm run dev`. The board now reads/writes on-chain.

## Option B — Script (`deploy.mjs`)

```bash
# .env.local must contain OG_DEPLOYER_PRIVATE_KEY=0x...
node contracts/deploy.mjs
```

It compiles with `solc`, deploys via the public RPC, prints the address and the
explorer link, and reminds you to set `VITE_OG_LEADERBOARD_ADDRESS`.
Requires `npm i -D solc` (only needed for this script).

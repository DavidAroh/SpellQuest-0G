/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Deploy SpellQuestLeaderboard to the 0G Galileo testnet.
 * Uses the prebuilt artifact (contracts/artifacts/SpellQuestLeaderboard.json),
 * so it needs only `ethers` (already installed) — no solc, no Hardhat.
 *
 *   1. Get test 0G from https://faucet.0g.ai to your wallet.
 *   2. Put that wallet's key in .env.local:  OG_DEPLOYER_PRIVATE_KEY=0x...
 *   3. node contracts/deploy.mjs
 *
 * To recompile the artifact after editing the .sol: `npm i -D solc` then see
 * contracts/DEPLOY.md (or just deploy via Remix).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Wallet, JsonRpcProvider, ContractFactory, formatEther } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));

const RPC = "https://evmrpc-testnet.0g.ai";
const EXPLORER = "https://chainscan-galileo.0g.ai";

// Load OG_DEPLOYER_PRIVATE_KEY from env or .env.local / .env (no extra deps).
function loadEnvKey() {
  if (process.env.OG_DEPLOYER_PRIVATE_KEY) return process.env.OG_DEPLOYER_PRIVATE_KEY.trim();
  for (const f of [".env.local", ".env"]) {
    try {
      const m = readFileSync(join(__dirname, "..", f), "utf8").match(/^OG_DEPLOYER_PRIVATE_KEY=(.+)$/m);
      if (m) return m[1].trim();
    } catch {}
  }
  return null;
}

async function main() {
  const pk = loadEnvKey();
  if (!pk) throw new Error("Set OG_DEPLOYER_PRIVATE_KEY in .env.local (a funded 0G testnet key).");

  const artifact = JSON.parse(
    readFileSync(join(__dirname, "artifacts", "SpellQuestLeaderboard.json"), "utf8"),
  );

  const provider = new JsonRpcProvider(RPC);
  const wallet = new Wallet(pk, provider);
  console.log("Deployer:", wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log("Balance: ", formatEther(balance), "0G");
  if (balance === 0n) {
    throw new Error("Wallet has 0 0G — fund it at https://faucet.0g.ai first.");
  }

  console.log("Deploying SpellQuestLeaderboard…");
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const addr = await contract.getAddress();

  console.log("\n✅ Deployed SpellQuestLeaderboard");
  console.log("   Address:  ", addr);
  console.log("   Explorer: ", `${EXPLORER}/address/${addr}`);
  console.log("\nNext: add this line to .env.local, then rebuild/redeploy the app:");
  console.log(`   VITE_OG_LEADERBOARD_ADDRESS=${addr}`);
}

main().catch((e) => {
  console.error("\n❌", e.shortMessage || e.message || e);
  process.exit(1);
});

/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Compile + deploy SpellQuestLeaderboard.sol to the 0G Galileo testnet.
 *
 *   1. Put a funded testnet key in .env.local:  OG_DEPLOYER_PRIVATE_KEY=0x...
 *   2. npm i -D solc
 *   3. node contracts/deploy.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { Wallet, JsonRpcProvider, ContractFactory } from "ethers";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const RPC = "https://evmrpc-testnet.0g.ai";
const EXPLORER = "https://chainscan-galileo.0g.ai";

// Load OG_DEPLOYER_PRIVATE_KEY from .env.local / .env without extra deps.
function loadEnvKey() {
  if (process.env.OG_DEPLOYER_PRIVATE_KEY) return process.env.OG_DEPLOYER_PRIVATE_KEY;
  for (const f of [".env.local", ".env"]) {
    try {
      const txt = readFileSync(join(__dirname, "..", f), "utf8");
      const m = txt.match(/^OG_DEPLOYER_PRIVATE_KEY=(.+)$/m);
      if (m) return m[1].trim();
    } catch {}
  }
  return null;
}

async function main() {
  const pk = loadEnvKey();
  if (!pk) throw new Error("Set OG_DEPLOYER_PRIVATE_KEY in .env.local first.");

  const solc = require("solc");
  const source = readFileSync(join(__dirname, "SpellQuestLeaderboard.sol"), "utf8");
  const input = {
    language: "Solidity",
    sources: { "SpellQuestLeaderboard.sol": { content: source } },
    settings: { outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  if (out.errors?.some((e) => e.severity === "error")) {
    throw new Error(out.errors.map((e) => e.formattedMessage).join("\n"));
  }
  const c = out.contracts["SpellQuestLeaderboard.sol"].SpellQuestLeaderboard;

  const provider = new JsonRpcProvider(RPC);
  const wallet = new Wallet(pk, provider);
  console.log("Deployer:", wallet.address);

  const factory = new ContractFactory(c.abi, c.evm.bytecode.object, wallet);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const addr = await contract.getAddress();

  console.log("\n✅ Deployed SpellQuestLeaderboard");
  console.log("   Address:", addr);
  console.log("   Explorer:", `${EXPLORER}/address/${addr}`);
  console.log("\nAdd this to .env.local then restart the dev server:");
  console.log(`   VITE_OG_LEADERBOARD_ADDRESS=${addr}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

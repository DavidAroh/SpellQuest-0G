/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 0G integration layer for SpellQuest.
 *
 * Everything that touches the 0G Galileo testnet lives here:
 *  - network constants (so MetaMask can add/switch to 0G in one click)
 *  - a browser-wallet connector (no private key ever lives in the app)
 *  - read/write helpers for the on-chain SpellQuest leaderboard contract
 *
 * The leaderboard contract address is injected at build time via
 * VITE_OG_LEADERBOARD_ADDRESS (see .env.example). Until it is deployed and
 * configured, reads return an empty board and writes surface a clear error —
 * the rest of the game keeps working offline.
 */
import { BrowserProvider, Contract, JsonRpcProvider, formatEther } from "ethers";

// ── 0G Galileo Testnet ───────────────────────────────────────────────────────
export const OG_TESTNET = {
  chainId: 16602,
  chainIdHex: "0x40DA",
  name: "0G Galileo Testnet",
  rpcUrl: "https://evmrpc-testnet.0g.ai",
  explorer: "https://chainscan-galileo.0g.ai",
  faucet: "https://faucet.0g.ai",
  currency: { name: "0G", symbol: "0G", decimals: 18 },
} as const;

export const LEADERBOARD_ADDRESS: string =
  (import.meta as any).env?.VITE_OG_LEADERBOARD_ADDRESS ?? "";

// Human-readable ABI for the SpellQuestLeaderboard contract (contracts/SpellQuestLeaderboard.sol)
export const LEADERBOARD_ABI = [
  "function submitScore(string name, uint256 score) external",
  "function bestScore(address player) view returns (uint256)",
  "function playerCount() view returns (uint256)",
  "function allEntries() view returns (tuple(address player, string name, uint256 score, uint256 timestamp)[])",
  "event ScoreSubmitted(address indexed player, string name, uint256 score, uint256 timestamp)",
] as const;

export interface LeaderboardEntry {
  player: string;
  name: string;
  score: number;
}

export interface WalletState {
  address: string;
  chainId: number;
  onOgNetwork: boolean;
}

// ── Wallet discovery (multi-wallet safe) ─────────────────────────────────────
// With several wallet extensions installed they fight over `window.ethereum`,
// so the last one to load wins and connecting against it can fail ("No active
// wallet found"). We discover every wallet via EIP-6963 (the modern multi-wallet
// standard) so the player can pick which one to use, and remember their choice.

export interface WalletOption {
  rdns: string;
  name: string;
  icon: string;
  provider: any;
}

const eip6963Providers: WalletOption[] = [];
let activeProvider: any = null; // the wallet the player chose for this session

if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", (e: any) => {
    const detail = e?.detail;
    if (!detail?.provider || !detail?.info?.rdns) return;
    if (eip6963Providers.some((p) => p.rdns === detail.info.rdns)) return;
    eip6963Providers.push({
      rdns: detail.info.rdns,
      name: detail.info.name ?? detail.info.rdns,
      icon: detail.info.icon ?? "",
      provider: detail.provider,
    });
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

/** All wallets the browser advertises. Re-polls EIP-6963 each call. */
export function listWallets(): WalletOption[] {
  if (typeof window === "undefined") return [];
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  if (eip6963Providers.length) return eip6963Providers;
  // Fallback: legacy injected provider(s) with no EIP-6963 support.
  const eth = (window as any).ethereum;
  if (!eth) return [];
  const legacy: any[] = Array.isArray(eth.providers) && eth.providers.length ? eth.providers : [eth];
  return legacy.map((p, i) => ({
    rdns: p.isMetaMask ? "io.metamask" : `injected-${i}`,
    name: p.isMetaMask ? "MetaMask" : "Injected Wallet",
    icon: "",
    provider: p,
  }));
}

/** Pick a wallet for the session (by rdns). Call before connectWallet(). */
export function selectWallet(rdns: string): void {
  const found = listWallets().find((w) => w.rdns === rdns);
  if (found) activeProvider = found.provider;
}

function getEthereum(): any {
  if (activeProvider) return activeProvider;
  const wallets = listWallets();
  // Default to MetaMask if present, else the first wallet, else legacy injected.
  const mm = wallets.find((w) => w.rdns === "io.metamask" || /metamask/i.test(w.name));
  const chosen = (mm ?? wallets[0])?.provider ?? null;
  return chosen ?? (typeof window !== "undefined" ? (window as any).ethereum ?? null : null);
}

export function hasWallet(): boolean {
  return listWallets().length > 0 || !!(typeof window !== "undefined" && (window as any).ethereum);
}

export function shortAddress(addr: string): string {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";
}

/** Add the 0G Galileo testnet to the wallet, or switch to it if already added. */
export async function ensureOgNetwork(): Promise<void> {
  const eth = getEthereum();
  if (!eth) throw new Error("No browser wallet detected. Install MetaMask to play on-chain.");
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: OG_TESTNET.chainIdHex }],
    });
  } catch (err: any) {
    // 4902 = chain not added yet → add it, then it becomes the active chain.
    if (err?.code === 4902 || /Unrecognized chain/i.test(err?.message ?? "")) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: OG_TESTNET.chainIdHex,
            chainName: OG_TESTNET.name,
            nativeCurrency: OG_TESTNET.currency,
            rpcUrls: [OG_TESTNET.rpcUrl],
            blockExplorerUrls: [OG_TESTNET.explorer],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

/** Prompt the wallet to connect and ensure it's pointed at 0G.
 *  Pass an rdns (from listWallets) to use a specific wallet. */
export async function connectWallet(rdns?: string): Promise<WalletState> {
  if (rdns) selectWallet(rdns);
  const eth = getEthereum();
  if (!eth) throw new Error("No browser wallet detected. Install MetaMask to play on-chain.");

  const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
  if (!accounts?.length) throw new Error("No account authorised.");

  await ensureOgNetwork();

  const chainIdHex: string = await eth.request({ method: "eth_chainId" });
  const chainId = parseInt(chainIdHex, 16);
  return {
    address: accounts[0],
    chainId,
    onOgNetwork: chainId === OG_TESTNET.chainId,
  };
}

/** Read the current connection without prompting (for restoring state on load). */
export async function getConnectedState(): Promise<WalletState | null> {
  const eth = getEthereum();
  if (!eth) return null;
  const accounts: string[] = await eth.request({ method: "eth_accounts" });
  if (!accounts?.length) return null;
  const chainIdHex: string = await eth.request({ method: "eth_chainId" });
  const chainId = parseInt(chainIdHex, 16);
  return { address: accounts[0], chainId, onOgNetwork: chainId === OG_TESTNET.chainId };
}

/** Native 0G test-token balance, formatted to 4 decimals. */
export async function getBalance(address: string): Promise<string> {
  const provider = new JsonRpcProvider(OG_TESTNET.rpcUrl);
  const wei = await provider.getBalance(address);
  return Number(formatEther(wei)).toFixed(4);
}

/** Read-only contract bound to the public RPC (no wallet needed to view the board). */
function readContract(): Contract | null {
  if (!LEADERBOARD_ADDRESS) return null;
  const provider = new JsonRpcProvider(OG_TESTNET.rpcUrl);
  return new Contract(LEADERBOARD_ADDRESS, LEADERBOARD_ABI as any, provider);
}

/** Write-enabled contract bound to the user's wallet signer. */
async function writeContract(): Promise<Contract> {
  if (!LEADERBOARD_ADDRESS) {
    throw new Error("Leaderboard contract not configured yet (set VITE_OG_LEADERBOARD_ADDRESS).");
  }
  const eth = getEthereum();
  if (!eth) throw new Error("No browser wallet detected.");
  const provider = new BrowserProvider(eth);
  const signer = await provider.getSigner();
  return new Contract(LEADERBOARD_ADDRESS, LEADERBOARD_ABI as any, signer);
}

/** Fetch the leaderboard from chain, sorted high→low. Returns [] if unconfigured. */
export async function fetchLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  const contract = readContract();
  if (!contract) return [];
  const raw: any[] = await contract.allEntries();
  return raw
    .map((e) => ({
      player: e.player as string,
      name: (e.name as string) || "anon",
      score: Number(e.score),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Submit a score on-chain. The contract only stores it if it beats the
 * player's previous best, so spamming is harmless. Returns the tx hash.
 */
export async function submitScore(name: string, score: number): Promise<string> {
  const contract = await writeContract();
  const tx = await contract.submitScore(name.slice(0, 24), BigInt(Math.max(0, Math.floor(score))));
  await tx.wait();
  return tx.hash;
}

export function txUrl(hash: string): string {
  return `${OG_TESTNET.explorer}/tx/${hash}`;
}

export function addressUrl(addr: string): string {
  return `${OG_TESTNET.explorer}/address/${addr}`;
}

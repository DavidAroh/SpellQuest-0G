/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * On-chain leaderboard panel, backed by the SpellQuestLeaderboard contract on
 * the 0G Galileo testnet. Players connect a wallet, see the global board read
 * straight from chain, and push their best score on-chain in one click.
 */
import React, { useEffect, useState } from "react";
import { Trophy, Crown, Loader2, ExternalLink, Wallet, X, LogOut } from "lucide-react";
import {
  OG_TESTNET,
  LEADERBOARD_ADDRESS,
  LeaderboardEntry,
  WalletState,
  WalletOption,
  hasWallet,
  listWallets,
  connectWallet,
  disconnectWallet,
  getConnectedState,
  fetchLeaderboard,
  subscribeLeaderboard,
  submitScore,
  shortAddress,
  addressUrl,
  txUrl,
  loadPlayerName,
  savePlayerName,
} from "../services/zeroG";

interface Props {
  onClose: () => void;
  /** Best score from the current session, offered for on-chain submission. */
  pendingScore?: number;
}

export const Leaderboard: React.FC<Props> = ({ onClose, pendingScore = 0 }) => {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [name, setName] = useState(loadPlayerName);
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [picking, setPicking] = useState(false);

  const configured = !!LEADERBOARD_ADDRESS;

  const refresh = async () => {
    setLoading(true);
    try {
      setEntries(await fetchLeaderboard(10));
    } catch (e: any) {
      setError(e?.message ?? "Could not read leaderboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getConnectedState().then((w) => w && setWallet(w)).catch(() => {});
    // Live board: poll the contract every 10s while the panel is open (reads are free).
    const unsub = subscribeLeaderboard((e) => { setEntries(e); setLoading(false); }, 10000, 10);
    return unsub;
  }, []);

  const onConnect = async (rdns?: string) => {
    setError(null);
    // More than one wallet and none chosen yet → let the player pick.
    const found = listWallets();
    if (!rdns && found.length > 1) {
      setWallets(found);
      setPicking(true);
      return;
    }
    try {
      setPicking(false);
      setWallet(await connectWallet(rdns));
    } catch (e: any) {
      setError(e?.message ?? "Could not connect wallet.");
    }
  };

  const onDisconnect = async () => {
    await disconnectWallet();
    setWallet(null);
    setPicking(false);
    setLastTx(null);
    setError(null);
  };

  const onSubmit = async () => {
    setError(null);
    setLastTx(null);
    setBusy(true);
    try {
      if (name.trim()) savePlayerName(name.trim());
      const hash = await submitScore(name || shortAddress(wallet!.address), pendingScore);
      setLastTx(hash);
      await refresh();
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? "Transaction failed.");
    } finally {
      setBusy(false);
    }
  };

  const T = {
    void: "#08080d",
    amber: "#f5a623",
    text: "#f0ece3",
    muted: "rgba(240,236,227,0.45)",
    border: "rgba(255,255,255,0.08)",
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="w-full max-w-md rounded-3xl border shadow-2xl overflow-hidden"
        style={{ background: T.void, borderColor: T.border, fontFamily: "'DM Sans', sans-serif" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: `1px solid ${T.border}` }}>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(245,166,35,0.12)", border: `1px solid rgba(245,166,35,0.3)` }}
            >
              <Trophy className="w-5 h-5" style={{ color: T.amber }} />
            </div>
            <div>
              <h2 className="text-lg font-black" style={{ color: T.text, fontFamily: "'Bebas Neue', cursive", letterSpacing: "0.04em" }}>
                On-Chain Leaderboard
              </h2>
              <p className="text-[10px] uppercase tracking-[0.2em]" style={{ color: T.amber }}>
                0G Galileo Testnet
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/5 transition" style={{ color: T.muted }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Wallet row */}
          {!hasWallet() ? (
            <div className="text-sm rounded-xl px-4 py-3" style={{ background: "rgba(245,166,35,0.08)", color: T.text }}>
              No wallet detected. Install{" "}
              <a href="https://metamask.io" target="_blank" rel="noreferrer" style={{ color: T.amber }}>
                MetaMask
              </a>{" "}
              to play on-chain.
            </div>
          ) : wallet ? (
            <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: wallet.onOgNetwork ? "#34d399" : "#f87171" }} />
                <a href={addressUrl(wallet.address)} target="_blank" rel="noreferrer" className="text-sm font-mono" style={{ color: T.text }}>
                  {shortAddress(wallet.address)}
                </a>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-[11px] uppercase tracking-wider" style={{ color: wallet.onOgNetwork ? "#34d399" : "#f87171" }}>
                  {wallet.onOgNetwork ? "0G Network" : "Wrong network"}
                </span>
                <button
                  onClick={onDisconnect}
                  title="Disconnect wallet"
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition hover:scale-105 active:scale-95"
                  style={{ background: "rgba(248,113,113,0.12)", color: "#fca5a5", border: "1px solid rgba(248,113,113,0.25)" }}
                >
                  <LogOut className="w-3 h-3" /> Disconnect
                </button>
              </div>
            </div>
          ) : picking ? (
            <div className="rounded-xl px-3 py-3 space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}` }}>
              <p className="text-[11px] uppercase tracking-wider px-1" style={{ color: T.muted }}>
                Choose a wallet
              </p>
              {wallets.map((w) => (
                <button
                  key={w.rdns}
                  onClick={() => onConnect(w.rdns)}
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:scale-[1.01] active:scale-95"
                  style={{ background: "rgba(255,255,255,0.05)", color: T.text, border: `1px solid ${T.border}` }}
                >
                  {w.icon ? (
                    <img src={w.icon} alt="" className="w-6 h-6 rounded" />
                  ) : (
                    <Wallet className="w-5 h-5" style={{ color: T.amber }} />
                  )}
                  <span className="text-sm font-semibold">{w.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <button
              onClick={() => onConnect()}
              className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-bold transition hover:scale-[1.01] active:scale-95"
              style={{ background: T.amber, color: T.void }}
            >
              <Wallet className="w-4 h-4" /> Connect Wallet
            </button>
          )}

          {/* Submit current score */}
          {wallet && wallet.onOgNetwork && (
            <div className="rounded-xl px-4 py-4 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}` }}>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider" style={{ color: T.muted }}>
                  Your session best
                </span>
                <span className="text-xl font-black" style={{ color: T.amber }}>
                  {pendingScore}
                </span>
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name on the board (optional)"
                maxLength={24}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: "rgba(255,255,255,0.05)", color: T.text, border: `1px solid ${T.border}` }}
              />
              <button
                onClick={onSubmit}
                disabled={busy || pendingScore <= 0 || !configured}
                className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-bold transition disabled:opacity-40 hover:scale-[1.01] active:scale-95"
                style={{ background: T.amber, color: T.void }}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
                {busy ? "Submitting…" : "Submit score on-chain"}
              </button>
              {!configured && (
                <p className="text-[11px]" style={{ color: T.muted }}>
                  Contract not deployed yet — see contracts/DEPLOY.md.
                </p>
              )}
              {lastTx && (
                <a href={txUrl(lastTx)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs" style={{ color: "#34d399" }}>
                  Confirmed on-chain <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs rounded-lg px-3 py-2" style={{ background: "rgba(248,113,113,0.1)", color: "#fca5a5" }}>
              {error}
            </p>
          )}

          {/* Board */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-[0.2em]" style={{ color: T.muted }}>
                Top Spellers
              </span>
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: T.muted }} />}
            </div>
            {entries.length === 0 && !loading ? (
              <p className="text-sm py-6 text-center" style={{ color: T.muted }}>
                {configured ? "No scores yet — be the first!" : "Deploy the contract to start the board."}
              </p>
            ) : (
              <ol className="space-y-1.5">
                {entries.map((e, i) => (
                  <li
                    key={e.player}
                    className="flex items-center justify-between rounded-lg px-3 py-2"
                    style={{
                      background: i === 0 ? "rgba(245,166,35,0.1)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${i === 0 ? "rgba(245,166,35,0.25)" : "transparent"}`,
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-sm font-black w-5 text-center" style={{ color: i === 0 ? T.amber : T.muted }}>
                        {i + 1}
                      </span>
                      <span className="text-sm truncate" style={{ color: T.text }}>
                        {e.name}
                      </span>
                    </div>
                    <span className="text-sm font-black" style={{ color: T.amber }}>
                      {e.score}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <p className="text-[10px] text-center pt-1" style={{ color: T.muted }}>
            Need test tokens?{" "}
            <a href={OG_TESTNET.faucet} target="_blank" rel="noreferrer" style={{ color: T.amber }}>
              0G faucet
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Leaderboard;

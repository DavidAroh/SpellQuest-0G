/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SpellSage — the on-screen AI companion.
 *
 * A persistent little agent that lives in the corner of the playfield and
 * coaches the player out loud. It is NOT a chat box: the player never types.
 * The Sage watches live game state (new word, progress, low time, a win) and
 * speaks on its own, powered by services/sage.ts (0G Compute when configured,
 * local heuristics otherwise).
 */
import React, { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { getSageHint, usingOgCompute, SageEvent } from "../services/sage";

interface Props {
  word: string;
  category: string;
  difficulty: string;
  timeLeft: number;
  traySoFar: string;
  isCorrect: boolean;
  enabled?: boolean;
}

export const SpellSage: React.FC<Props> = ({
  word,
  category,
  difficulty,
  timeLeft,
  traySoFar,
  isCorrect,
  enabled = true,
}) => {
  const [line, setLine] = useState("Show your hand and pinch a tile to begin.");
  const [thinking, setThinking] = useState(false);
  const [pulse, setPulse] = useState(false);

  const prevWord = useRef(word);
  const prevTray = useRef(traySoFar);
  const firedTimeLow = useRef(false);
  const firedCorrect = useRef(false);
  const reqId = useRef(0);

  const speak = async (event: SageEvent) => {
    if (!enabled || !word) return;
    const id = ++reqId.current;
    setThinking(true);
    const text = await getSageHint({ word, category, difficulty, timeLeft, traySoFar, event });
    // Ignore stale responses if a newer request started.
    if (id !== reqId.current) return;
    setThinking(false);
    setLine(text);
    setPulse(true);
    setTimeout(() => setPulse(false), 600);
  };

  // New word → reset per-word triggers and greet.
  useEffect(() => {
    if (word && word !== prevWord.current) {
      prevWord.current = word;
      firedTimeLow.current = false;
      firedCorrect.current = false;
      speak("newWord");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word]);

  // Tray changed → progress nudge.
  useEffect(() => {
    if (traySoFar !== prevTray.current) {
      prevTray.current = traySoFar;
      if (!isCorrect && traySoFar.length > 0) speak("progress");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traySoFar]);

  // Low time → urgent nudge (once per word).
  useEffect(() => {
    if (!isCorrect && timeLeft > 0 && timeLeft <= 7 && !firedTimeLow.current) {
      firedTimeLow.current = true;
      speak("timeLow");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  // Win → celebrate (once per word).
  useEffect(() => {
    if (isCorrect && !firedCorrect.current) {
      firedCorrect.current = true;
      speak("correct");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCorrect]);

  if (!enabled) return null;

  return (
    <div className="absolute bottom-5 left-5 z-40 flex items-end gap-3 max-w-[min(80vw,360px)] pointer-events-none">
      {/* Avatar orb */}
      <div className="relative shrink-0">
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl border border-amber-300/40 transition-transform duration-300 ${
            pulse ? "scale-110" : "scale-100"
          }`}
          style={{
            background: "linear-gradient(135deg, rgba(245,166,35,0.95), rgba(255,196,80,0.9))",
            boxShadow: "0 0 24px rgba(245,166,35,0.45)",
          }}
        >
          <Sparkles className={`w-7 h-7 text-white ${thinking ? "animate-spin-slow" : ""}`} />
        </div>
        {/* live status dot */}
        <span
          className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-[#08080d]"
          style={{ background: usingOgCompute ? "#34d399" : "#f5a623" }}
          title={usingOgCompute ? "Powered by 0G Compute" : "Local coach (0G Compute ready)"}
        />
      </div>

      {/* Speech bubble */}
      <div
        className={`rounded-2xl rounded-bl-sm px-4 py-3 backdrop-blur-md border transition-all duration-300 ${
          pulse ? "translate-y-0 opacity-100" : "opacity-95"
        }`}
        style={{
          background: "rgba(8,8,13,0.82)",
          borderColor: "rgba(245,166,35,0.25)",
          color: "#f0ece3",
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span
            className="text-[10px] font-bold uppercase tracking-[0.2em]"
            style={{ color: "#f5a623" }}
          >
            Spell Sage
          </span>
          <span
            className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-full"
            style={{
              color: usingOgCompute ? "#34d399" : "rgba(240,236,227,0.5)",
              background: usingOgCompute ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.06)",
            }}
          >
            {usingOgCompute ? "0G Compute" : "AI Coach"}
          </span>
        </div>
        <p className="text-sm font-medium leading-snug">
          {thinking ? "…" : line}
        </p>
      </div>
    </div>
  );
};

export default SpellSage;

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
 * local heuristics otherwise). The face is an anime-style SVG mascot
 * (components/SageCharacter) whose expression tracks the game; tap it to ask
 * for a fresh hint.
 */
import React, { useEffect, useRef, useState } from "react";
import { getSageHint, usingOgCompute, SageEvent } from "../services/sage";
import SageCharacter, { SageMood } from "./SageCharacter";

interface Props {
  word: string;
  category: string;
  difficulty: string;
  timeLeft: number;
  traySoFar: string;
  isCorrect: boolean;
  enabled?: boolean;
}

function moodForEvent(event: SageEvent): SageMood {
  switch (event) {
    case "correct": return "celebrate";
    case "timeLow": return "worried";
    case "newWord": return "happy";
    case "progress": return "happy";
    case "idle":
    default: return "idle";
  }
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
  const [mood, setMood] = useState<SageMood>("idle");
  const [pulse, setPulse] = useState(false);

  const prevWord = useRef(word);
  const prevTray = useRef(traySoFar);
  const firedTimeLow = useRef(false);
  const firedCorrect = useRef(false);
  const reqId = useRef(0);
  const streak = useRef(0);            // consecutive words solved
  const lastActivity = useRef(Date.now()); // for idle chatter
  const thinkingRef = useRef(false);

  const speak = async (event: SageEvent) => {
    if (!enabled || !word) return;
    lastActivity.current = Date.now();
    const id = ++reqId.current;
    setThinking(true);
    thinkingRef.current = true;
    setMood("thinking");
    const text = await getSageHint({ word, category, difficulty, timeLeft, traySoFar, event, streak: streak.current });
    // Ignore stale responses if a newer request started.
    if (id !== reqId.current) return;
    setThinking(false);
    thinkingRef.current = false;
    // Off-track on progress → worried, otherwise the event's natural mood.
    const offTrack = event === "progress" && !!traySoFar && !word.toUpperCase().startsWith(traySoFar.toUpperCase());
    setMood(offTrack ? "worried" : moodForEvent(event));
    setLine(text);
    setPulse(true);
    setTimeout(() => setPulse(false), 600);
  };

  // Tap the mascot → fresh contextual hint.
  const poke = () => {
    if (isCorrect) speak("correct");
    else if (traySoFar.length > 0) speak("progress");
    else speak("idle");
  };

  // New word → reset per-word triggers and greet.
  useEffect(() => {
    if (word && word !== prevWord.current) {
      if (!firedCorrect.current) streak.current = 0; // previous word was missed → streak broken
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

  // Win → celebrate (once per word), bumping the streak first.
  useEffect(() => {
    if (isCorrect && !firedCorrect.current) {
      firedCorrect.current = true;
      streak.current += 1;
      speak("correct");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCorrect]);

  // Spontaneous idle chatter — if the player goes quiet, the Sage pipes up so it
  // never feels like a frozen sprite.
  useEffect(() => {
    const id = setInterval(() => {
      if (!enabled || !word || isCorrect || thinkingRef.current) return;
      if (Date.now() - lastActivity.current > 13000) speak("idle");
    }, 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, word, isCorrect]);

  if (!enabled) return null;

  return (
    <div className="absolute bottom-4 left-4 z-[55] flex items-end gap-2 max-w-[min(82vw,380px)] pointer-events-none">
      {/* Anime mascot — interactive: tap for a fresh hint */}
      <div className="shrink-0 pointer-events-auto" style={{ filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.35))" }}>
        <SageCharacter mood={mood} onPoke={poke} size={88} />
      </div>

      {/* Speech bubble */}
      <div
        className={`relative mb-2 rounded-2xl rounded-bl-sm px-4 py-3 backdrop-blur-md border transition-all duration-300 ${
          pulse ? "translate-y-0 opacity-100 scale-[1.02]" : "opacity-95 scale-100"
        }`}
        style={{
          background: "rgba(8,8,13,0.85)",
          borderColor: "rgba(245,166,35,0.28)",
          color: "#f0ece3",
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        }}
      >
        {/* little tail toward the mascot */}
        <span
          className="absolute -left-1.5 bottom-3 w-3 h-3 rotate-45"
          style={{ background: "rgba(8,8,13,0.85)", borderLeft: "1px solid rgba(245,166,35,0.28)", borderBottom: "1px solid rgba(245,166,35,0.28)" }}
        />
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "#f5a623" }}>
            Spell Sage
          </span>
          <span
            className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
            style={{
              color: usingOgCompute ? "#34d399" : "rgba(240,236,227,0.55)",
              background: usingOgCompute ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.06)",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: usingOgCompute ? "#34d399" : "#f5a623" }} />
            {usingOgCompute ? "0G Compute" : "AI Coach"}
          </span>
        </div>
        <p className="text-sm font-medium leading-snug min-h-[1.25rem]">
          {thinking ? (
            <span className="inline-flex gap-1 items-center" aria-label="thinking">
              <span className="sage-typing">●</span>
              <span className="sage-typing" style={{ animationDelay: ".15s" }}>●</span>
              <span className="sage-typing" style={{ animationDelay: ".3s" }}>●</span>
            </span>
          ) : (
            line
          )}
        </p>
        <style>{`
          .sage-typing { font-size:8px; color:#f5a623; opacity:.3; animation: sageTyping 1.2s infinite; }
          @keyframes sageTyping { 0%,100%{ opacity:.3; transform: translateY(0);} 50%{ opacity:1; transform: translateY(-2px);} }
          @media (prefers-reduced-motion: reduce){ .sage-typing{ animation:none; } }
        `}</style>
      </div>
    </div>
  );
};

export default SpellSage;

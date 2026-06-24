import React from "react";
import { Hand, MousePointer2, Move, Trophy, X } from "lucide-react";

interface HowToPlayProps {
  onClose: () => void;
  /** "solo" | "local" | "network" — tailors the closing line */
  mode?: "solo" | "local" | "network";
}

const STEPS = [
  {
    icon: Hand,
    title: "Show your hand",
    body: "Hold your hand up to the camera. A glowing cursor follows your index finger.",
  },
  {
    icon: MousePointer2,
    title: "Pinch to grab",
    body: "Touch your thumb and index finger together over a letter tile to pick it up.",
  },
  {
    icon: Move,
    title: "Drag to the tray",
    body: "Move your pinched hand to the tray and release to drop the letter in place.",
  },
  {
    icon: Trophy,
    title: "Spell the word",
    body: "Fill the tray with the right letters in order before the timer runs out to score!",
  },
];

export const HowToPlay: React.FC<HowToPlayProps> = ({ onClose, mode = "solo" }) => {
  const closing =
    mode === "local"
      ? "Two players, two hands — left hand controls Player 1, right hand controls Player 2."
      : mode === "network"
      ? "You and your opponent each spell on your own device. First to finish each word wins the round."
      : "Beat your high score and climb the difficulty levels!";

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="bg-[#0c0c12]/95 backdrop-blur-md rounded-3xl shadow-2xl border border-amber-500/20 max-w-lg w-full p-7 relative">
        <button
          onClick={onClose}
          aria-label="Close how to play"
          className="absolute top-5 right-5 p-2 bg-white/5 hover:bg-white/10 rounded-full transition active:scale-95 border border-white/10"
        >
          <X className="w-5 h-5 text-[#f0ece3]/80" />
        </button>

        <h2 className="text-4xl text-[#f0ece3] tracking-wide mb-1" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>How to Play</h2>
        <p className="text-sm text-[#f0ece3]/50 mb-6">Spell words with hand gestures — no controller needed.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {STEPS.map((step, i) => (
            <div key={step.title} className="flex gap-3 items-start bg-white/[0.03] rounded-2xl p-4 border border-white/10">
              <div className="bg-[#f5a623] p-2.5 rounded-xl shadow-md shadow-amber-500/30 shrink-0 relative">
                <step.icon className="w-5 h-5 text-[#08080d]" />
                <span className="absolute -top-2 -left-2 bg-[#0c0c12] text-[#f5a623] text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow border border-amber-500/40">
                  {i + 1}
                </span>
              </div>
              <div>
                <p className="font-bold text-[#f0ece3] text-sm leading-tight mb-1">{step.title}</p>
                <p className="text-xs text-[#f0ece3]/55 leading-snug">{step.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 text-center text-sm text-[#f5a623] bg-amber-500/10 border border-amber-500/25 rounded-2xl px-4 py-3 font-medium">
          {closing}
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full bg-[#f5a623] hover:bg-amber-400 text-[#08080d] font-black py-4 rounded-2xl shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.02] active:scale-95 text-lg"
        >
          Got it — let's play!
        </button>
      </div>
    </div>
  );
};

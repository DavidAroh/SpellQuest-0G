/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * "Spell Sage" — the brain behind the on-screen AI companion.
 *
 * The Sage coaches the player through each word: it nudges, hints, and reacts
 * to time pressure and wins. It is an *agent*, not a chatbot — the player never
 * types; the Sage speaks on its own based on live game state.
 *
 * Inference is pluggable. When a 0G Compute inference endpoint is configured
 * (VITE_OG_COMPUTE_ENDPOINT, OpenAI-compatible), the Sage's lines are generated
 * by a model served on 0G's decentralised compute network. With nothing
 * configured it falls back to a fully local heuristic coach, so the agent is
 * always alive — even offline, even before the 0G Compute broker is funded.
 */

export type SageEvent = "newWord" | "progress" | "timeLow" | "correct" | "idle";

export interface SageContext {
  word: string;
  category: string;
  difficulty: string;
  timeLeft: number;
  /** Letters already placed in the tray, in order. */
  traySoFar: string;
  event: SageEvent;
  /** Consecutive words solved this session (for streak banter). */
  streak?: number;
}

const COMPUTE_ENDPOINT: string = (import.meta as any).env?.VITE_OG_COMPUTE_ENDPOINT ?? "";
const COMPUTE_KEY: string = (import.meta as any).env?.VITE_OG_COMPUTE_API_KEY ?? "";
const COMPUTE_MODEL: string = (import.meta as any).env?.VITE_OG_COMPUTE_MODEL ?? "llama-3.3-70b-instruct";

export const usingOgCompute = !!COMPUTE_ENDPOINT;

// ── Local heuristic coach ────────────────────────────────────────────────────
// Deterministic-ish, fast, and never reveals the whole word — it teaches.

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

function scramble(word: string): string {
  return word
    .split("")
    .sort(() => Math.random() - 0.5)
    .join(" ")
    .toUpperCase();
}

function localHint(ctx: SageContext): string {
  const w = ctx.word.toUpperCase();
  const len = w.length;
  const next = w[ctx.traySoFar.length] ?? "";

  switch (ctx.event) {
    case "newWord":
      return pick([
        `A ${ctx.category.toLowerCase()} word — ${len} letters. Starts with "${w[0]}".`,
        `${len} letters this round. Find the "${w[0]}" first.`,
        `Here we go! Think ${ctx.category.toLowerCase()}: ${len} tiles to grab.`,
        `Scrambled it'd look like ${scramble(w)} — spell it straight!`,
      ]);
    case "progress":
      if (ctx.traySoFar && w.startsWith(ctx.traySoFar.toUpperCase())) {
        return next
          ? pick([
              `Nice — "${ctx.traySoFar.toUpperCase()}" so far. Reach for "${next}" next.`,
              `On track! Next letter is "${next}".`,
              `Keep going — grab the "${next}".`,
            ])
          : `That's all of them — drop it in!`;
      }
      return pick([
        `Hmm, "${ctx.traySoFar.toUpperCase()}" doesn't match. It opens with "${w[0]}".`,
        `Reset that — the word starts "${w.slice(0, 2)}…".`,
      ]);
    case "timeLow":
      return pick([
        `Clock's ticking! It ends in "${w[len - 1]}".`,
        `Quick — ${len} letters, starts "${w[0]}", tap +5s if you need it.`,
        `Almost out of time! You've got this.`,
      ]);
    case "correct": {
      const s = ctx.streak ?? 0;
      if (s >= 5) return pick([`${s} in a row — you're unstoppable! ✦`, `${s} straight! I can barely keep up.`, `On fire — ${s} perfect words!`]);
      if (s >= 3) return pick([`Hat-trick and counting — ${s} straight! ✦`, `${s} in a row! Keep the combo alive.`, `Three-plus deep. Smooth.`]);
      if (s === 2) return pick([`Two in a row — nice rhythm!`, `Back-to-back! ✦`]);
      return pick([`Spelled it! On to the next.`, `Perfect — that's how it's done. ✦`, `Crisp spelling. Banking those points.`, `Boom. Next one's mine to call.`]);
    }
    case "idle":
    default:
      return pick([
        `Show me your hand and pinch a tile to start.`,
        `Pinch a letter tile to pick it up.`,
        `I'm watching — grab that "${w[0]}" to begin.`,
        `Still there? Reach for the "${w[0]}". ✦`,
        `Take your time… I'll wait. Starts with "${w[0]}".`,
        `Psst — ${len} letters. Pinch to begin.`,
        `Whenever you're ready. Hint: it's a ${ctx.category.toLowerCase()}.`,
      ]);
  }
}

// ── 0G Compute inference (OpenAI-compatible) ─────────────────────────────────
async function inferViaOgCompute(ctx: SageContext): Promise<string> {
  const sys =
    "You are Spell Sage, a witty, encouraging spelling coach inside an AR game. " +
    "Reply with ONE short line (max 12 words). Hint toward the target word WITHOUT spelling it out fully. " +
    "React to the game event. No quotes, no emojis except an occasional ✦.";
  const user = JSON.stringify({
    target_word: ctx.word,
    category: ctx.category,
    difficulty: ctx.difficulty,
    seconds_left: ctx.timeLeft,
    letters_placed: ctx.traySoFar,
    streak: ctx.streak ?? 0,
    event: ctx.event,
  });

  const res = await fetch(`${COMPUTE_ENDPOINT.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(COMPUTE_KEY ? { Authorization: `Bearer ${COMPUTE_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: COMPUTE_MODEL,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      max_tokens: 40,
      temperature: 0.8,
    }),
  });
  if (!res.ok) throw new Error(`0G Compute ${res.status}`);
  const data = await res.json();
  const line: string = data?.choices?.[0]?.message?.content?.trim();
  if (!line) throw new Error("empty inference");
  return line.replace(/^["']|["']$/g, "");
}

/** Get a coaching line for the current game state. Never throws. */
export async function getSageHint(ctx: SageContext): Promise<string> {
  if (usingOgCompute) {
    try {
      return await inferViaOgCompute(ctx);
    } catch {
      // 0G broker not funded / endpoint down → graceful local fallback.
      return localHint(ctx);
    }
  }
  return localHint(ctx);
}

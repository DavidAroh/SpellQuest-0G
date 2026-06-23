import { LetterTile, TileColor } from "../types";
import { WORD_CATEGORIES } from "./wordLists";

// ── Shared game types ───────────────────────────────────────────────────────
export type Difficulty = "EASY" | "MEDIUM" | "HARD";
export type Category = keyof typeof WORD_CATEGORIES;

// ── Shared visual constants ─────────────────────────────────────────────────
export const TILE_COLORS: TileColor[] = [
  "red", "blue", "green", "yellow", "purple", "orange", "cyan", "pink",
];

export const COLOR_MAP: Record<TileColor, string> = {
  red: "#ff8a80",
  blue: "#82b1ff",
  green: "#b9f6ca",
  yellow: "#ffff8d",
  purple: "#ea80fc",
  orange: "#ffd180",
  cyan: "#84ffff",
  pink: "#ff80ab",
};

export const DIFFICULTY_SETTINGS: Record<
  Difficulty,
  { time: number; multiplier: number; label: string }
> = {
  EASY: { time: 45, multiplier: 1, label: "Easy" },
  MEDIUM: { time: 30, multiplier: 1.5, label: "Medium" },
  HARD: { time: 20, multiplier: 2, label: "Hard" },
};

// ── Responsive canvas layout ────────────────────────────────────────────────
export interface Layout {
  tileSize: number;
  poolSpacing: number;
  trayY: number;
  scale: number;
}

const PER_ROW = 7; // letter tiles per row

/** How many tiles the pool will contain for a given word and player count. */
export function poolTileCount(word: string, players = 1): number {
  const counts: Record<string, number> = {};
  for (const ch of word.toUpperCase()) counts[ch] = (counts[ch] || 0) + 1;
  let extra = 0;
  for (const c of Object.values(counts)) extra += Math.max(0, c * players - 1);
  return 26 + extra; // A–Z plus duplicate copies
}

/**
 * Size the playfield so the tray + the full letter pool always fit within the
 * viewport — no zooming out. Tiles shrink to fit the available height/width for
 * the actual number of rows, capped at the design-base size on large screens.
 */
export function computeLayout(
  width: number,
  height: number,
  base: { tileSize: number; poolSpacing: number; trayY: number },
  opts: { word?: string; players?: number } = {},
): Layout {
  const spacing = base.poolSpacing;
  const rows = Math.max(1, Math.ceil(poolTileCount(opts.word ?? "", opts.players ?? 1) / PER_ROW));

  // Tray sits a bit below the top; pull it up on short screens to free pool space.
  const trayY = Math.round(Math.min(base.trayY, height * 0.22));

  // Space available for the pool, below the tray and above a small bottom margin.
  const trayBottom = trayY + 50;
  const bottomMargin = Math.max(32, height * 0.08);
  const availH = Math.max(80, height - trayBottom - bottomMargin);
  const availW = width * 0.94;

  // Largest tile that fits both the row count (height) and PER_ROW (width).
  const fitH = availH / (rows * spacing);
  const fitW = availW / (PER_ROW * spacing);
  const tileSize = Math.max(26, Math.min(base.tileSize, fitH, fitW));

  return { tileSize, poolSpacing: spacing, trayY, scale: tileSize / base.tileSize };
}

// ── Pointer reach amplification ─────────────────────────────────────────────
// The fingertip is tracked 1:1 across the camera frame, so reaching the screen
// edges (especially the bottom row of tiles) means moving your hand to the very
// edge of the camera view — where it often drops out of frame. Amplifying the
// normalized position around the centre lets a smaller, more comfortable hand
// motion cover the whole board. Vertical gain is higher since bottom reach is
// the hardest. Clamped to [0,1] so the cursor still pins to the edges.
export const POINTER_GAIN_X = 1.25;
export const POINTER_GAIN_Y = 1.6;

export function amplifyAxis(norm: number, gain: number, center = 0.5): number {
  return Math.max(0, Math.min(1, 0.5 + (norm - center) * gain));
}

/** Map a MediaPipe landmark to screen pixels using the same mirrored, amplified
 *  mapping as the pointer, so the skeleton lines up with the grab cursor. */
function landmarkToScreen(lm: { x: number; y: number }, width: number, height: number) {
  return {
    x: amplifyAxis(1 - lm.x, POINTER_GAIN_X) * width,
    y: amplifyAxis(lm.y, POINTER_GAIN_Y) * height,
  };
}

/**
 * Draw the hand skeleton (bones + joints) at the amplified pointer coordinates.
 *
 * Bug this fixes: the skeleton used to be drawn with MediaPipe's helpers under a
 * `scale(-1,1)` mirror transform, which placed it at the RAW fingertip position.
 * Once the pointer became amplified, the skeleton no longer matched the grab
 * cursor (it drifted, worst at the edges). Mapping every landmark through the
 * same amplified mapping keeps the skeleton glued to the cursor.
 */
export function drawHandSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: Array<{ x: number; y: number }>,
  width: number,
  height: number,
  connColor: string,
  jointColor: string,
): void {
  if (!landmarks || landmarks.length === 0) return;
  const connections: [number, number][] | undefined = (window as any).HAND_CONNECTIONS;

  if (connections) {
    ctx.strokeStyle = connColor;
    ctx.lineWidth = 2;
    for (const [a, b] of connections) {
      const p1 = landmarkToScreen(landmarks[a], width, height);
      const p2 = landmarkToScreen(landmarks[b], width, height);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }

  ctx.fillStyle = jointColor;
  for (const lm of landmarks) {
    const p = landmarkToScreen(lm, width, height);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Pure helpers ────────────────────────────────────────────────────────────
export const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

export function pickRandomWord(category: Category, difficulty: Difficulty): string {
  const list = WORD_CATEGORIES[category][difficulty];
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Build the shuffled A–Z letter pool laid out in centered rows.
 *
 * `players` controls how many simultaneous copies of a repeated letter are
 * injected: the base A–Z has one of each letter, so a word needing N copies of
 * a letter (across `players` trays) needs `count * players - 1` extra tiles.
 */
export function buildLetterPool(opts: {
  width: number;
  height: number;
  word: string;
  tileSize: number;
  poolSpacing: number;
  trayY: number;
  players?: number;
  perRow?: number;
}): LetterTile[] {
  const {
    width, height, word, tileSize, poolSpacing, trayY,
    players = 1, perRow = 7,
  } = opts;

  const baseLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  // Count duplicate letters in the target word and inject the extra copies.
  const wordLetterCounts: Record<string, number> = {};
  for (const ch of word.toUpperCase()) {
    wordLetterCounts[ch] = (wordLetterCounts[ch] || 0) + 1;
  }
  const extraLetters: string[] = [];
  for (const [ch, count] of Object.entries(wordLetterCounts)) {
    const extras = count * players - 1; // A–Z already has one of each
    for (let i = 0; i < extras; i++) extraLetters.push(ch);
  }

  const allLetters = shuffleArray([...baseLetters, ...extraLetters]);

  // Arrange into centered rows.
  const rows: number[] = [];
  let remaining = allLetters.length;
  while (remaining > 0) {
    rows.push(Math.min(perRow, remaining));
    remaining -= perRow;
  }

  const poolHeight = rows.length * tileSize * poolSpacing;
  const trayBottom = trayY + 50;
  const availableSpace = height - trayBottom;
  // Center the pool in the space below the tray, but never let it spill past the
  // bottom edge: clamp the start so (start + poolHeight) stays on screen.
  const gap = tileSize * 0.6;
  const centered = trayBottom + Math.max(gap, (availableSpace - poolHeight) / 2);
  const maxStart = Math.max(trayBottom + gap, height - poolHeight - tileSize * 0.4);
  const poolStartY = Math.min(centered, maxStart);

  const tiles: LetterTile[] = [];
  let charIdx = 0;
  rows.forEach((colsInRow, rowIndex) => {
    const rowWidth = (colsInRow - 1) * tileSize * poolSpacing;
    const rowStartX = (width - rowWidth) / 2;
    for (let col = 0; col < colsInRow; col++) {
      if (charIdx >= allLetters.length) break;
      const char = allLetters[charIdx];
      const x = rowStartX + col * tileSize * poolSpacing;
      const y = poolStartY + rowIndex * tileSize * poolSpacing;
      tiles.push({
        id: `tile-${char}-${charIdx}-${Math.random().toString(36).substr(2, 9)}`,
        char, x, y, targetX: x, targetY: y,
        color: TILE_COLORS[charIdx % TILE_COLORS.length],
        isDragging: false, inTray: false,
      });
      charIdx++;
    }
  });

  return tiles;
}

// ── Web-Audio sound engine ──────────────────────────────────────────────────
export type SoundType = "success" | "failure" | "tick" | "click" | "win";

/**
 * Create a sound engine bound to a lazily-initialised AudioContext.
 * `isEnabled` is read on every call so a live mute toggle takes effect.
 */
export function createSoundEngine(isEnabled: () => boolean) {
  let ctx: AudioContext | null = null;

  return function playSound(type: SoundType) {
    if (!isEnabled()) return;
    if (!ctx) {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;
    const tone = (
      freqStart: number,
      freqEnd: number,
      wave: OscillatorType,
      gainStart: number,
      dur: number,
      startAt = 0,
      ramp: "exp" | "lin" = "exp",
    ) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.connect(gain);
      gain.connect(ctx!.destination);
      osc.type = wave;
      const t0 = now + startAt;
      osc.frequency.setValueAtTime(freqStart, t0);
      if (ramp === "exp") osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
      else osc.frequency.linearRampToValueAtTime(freqEnd, t0 + dur);
      gain.gain.setValueAtTime(gainStart, t0);
      if (ramp === "exp") gain.gain.exponentialRampToValueAtTime(0.01, t0 + dur);
      else gain.gain.linearRampToValueAtTime(0.01, t0 + dur);
      osc.start(t0);
      osc.stop(t0 + dur);
    };

    if (type === "success") {
      tone(500, 1000, "sine", 0.3, 0.5);
      tone(750, 1500, "sine", 0.2, 0.5, 0.1);
    } else if (type === "win") {
      // Triumphant ascending arpeggio
      tone(523, 523, "sine", 0.3, 0.18, 0);     // C5
      tone(659, 659, "sine", 0.3, 0.18, 0.15);  // E5
      tone(784, 784, "sine", 0.3, 0.18, 0.3);   // G5
      tone(1047, 1047, "sine", 0.35, 0.4, 0.45); // C6
    } else if (type === "failure") {
      tone(300, 100, "triangle", 0.2, 0.3, 0, "lin");
    } else if (type === "tick") {
      tone(800, 800, "square", 0.05, 0.05);
    } else if (type === "click") {
      tone(600, 600, "sine", 0.05, 0.03);
    }
  };
}

// ── Persistence helpers ─────────────────────────────────────────────────────
const HIGH_SCORE_KEY = "spellingHighScore";
const SOUND_KEY = "spellquestSoundEnabled";
const ONBOARD_KEY = "spellquestSeenIntro";

export function loadHighScore(): number {
  const saved = localStorage.getItem(HIGH_SCORE_KEY);
  const parsed = saved ? parseInt(saved, 10) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function saveHighScore(score: number): void {
  localStorage.setItem(HIGH_SCORE_KEY, String(score));
}

export function loadSoundPref(): boolean {
  return localStorage.getItem(SOUND_KEY) !== "false";
}

export function saveSoundPref(enabled: boolean): void {
  localStorage.setItem(SOUND_KEY, String(enabled));
}

export function hasSeenIntro(): boolean {
  return localStorage.getItem(ONBOARD_KEY) === "true";
}

export function markIntroSeen(): void {
  localStorage.setItem(ONBOARD_KEY, "true");
}

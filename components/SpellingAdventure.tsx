import React, { useEffect, useRef, useState, useCallback } from "react";
import { Point, LetterTile, Particle } from "../types";
import {
  Sparkles,
  MousePointer2,
  CheckCircle2,
  Trophy,
  ArrowRight,
  Clock,
  Settings,
  Volume2,
  VolumeX,
  Star,
  Crown,
  HelpCircle,
} from "lucide-react";
import { WORD_CATEGORIES } from "./wordLists";
import { HowToPlay } from "./HowToPlay";
import SpellSage from "./SpellSage";
import {
  Difficulty,
  Category,
  COLOR_MAP,
  DIFFICULTY_SETTINGS,
  buildLetterPool,
  computeLayout,
  amplifyAxis,
  POINTER_GAIN_X,
  POINTER_GAIN_Y,
  drawHandSkeleton,
  pickRandomWord,
  createSoundEngine,
  SoundType,
  loadHighScore,
  saveHighScore,
  loadSoundPref,
  saveSoundPref,
  hasSeenIntro,
  markIntroSeen,
} from "./gameCore";

const PINCH_GRAB_THRESHOLD = 0.09;    // normalized; fingers within ~9% of frame width
const PINCH_RELEASE_THRESHOLD = 0.15; // wider so you don't accidentally drop mid-drag
const HAND_SMOOTH_MIN = 0.3;          // smoothing when hovering (precise, less jitter)
const HAND_SMOOTH_MAX = 0.85;         // smoothing when moving fast (responsive, snappy)
const DRAG_FOLLOW = 0.5;              // how fast a held tile glides to the hand (lower = steadier)
const GRAB_CONFIRM_FRAMES = 1;        // frames of pinch needed to lock a tile
const HAND_SETTLE_FRAMES = 1;         // frames before grabs are enabled after hand appears
const MAX_ADD_TIME = 3;               // max times player can add +5s per word

// Base (design-reference) layout — scaled to the viewport at runtime via computeLayout
const BASE_LAYOUT = { tileSize: 72, poolSpacing: 1.45, trayY: 220 };

interface SpellingAdventureProps {
  /** Reports the player's score upward so it can be pushed to the 0G leaderboard. */
  onScoreChange?: (score: number) => void;
}

const SpellingAdventure: React.FC<SpellingAdventureProps> = ({ onScoreChange }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const tiles = useRef<LetterTile[]>([]);
  const particles = useRef<Particle[]>([]);
  const activeTileId = useRef<string | null>(null);
  // Gesture smoothing & confirmation
  const smoothHandPos = useRef<Point>({ x: -9999, y: -9999 }); // off-screen until first detection
  const prevHandPos = useRef<Point>({ x: -9999, y: -9999 });   // for velocity trail
  const handVelocity = useRef<Point>({ x: 0, y: 0 });           // smoothed velocity
  const pinchFrames = useRef<number>(0);
  const pinchConfirmed = useRef<boolean>(false);
  const handSettleFrames = useRef<number>(0); // counts frames since hand appeared
  const handWasPresent = useRef<boolean>(false);

  // Keep refs for values needed inside the long-lived onResults closure
  // so we never capture stale closure state when the camera effect doesn't remount.
  const isCorrectRef = useRef(false);
  const currentWordRef = useRef("");
  const difficultyRef = useRef<"EASY" | "MEDIUM" | "HARD">("MEDIUM");
  const timeLeftRef = useRef(30);
  // Stable function refs — updated every render so the once-mounted closure always
  // calls the latest version of these callbacks.
  const playSoundRef = useRef<(type: SoundType) => void>(() => {});
  const updateTrayWordRef = useRef<() => void>(() => {});
  // True while a modal (how-to / settings) is open — pauses the timer & input
  const pausedRef = useRef(false);

  // Game State
  const [loading, setLoading] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [currentWord, setCurrentWord] = useState("");
  const [isCorrect, setIsCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [trayWord, setTrayWord] = useState(""); // live letters in the tray, for the Sage
  const [timeLeft, setTimeLeft] = useState(30);
  const [addTimeCount, setAddTimeCount] = useState(0); // how many +5s used this word

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("MEDIUM");
  const [category, setCategory] = useState<Category>("ANIMALS");
  const [soundEnabled, setSoundEnabled] = useState(loadSoundPref);

  // Onboarding overlay — shown automatically on first ever launch
  const [showHowTo, setShowHowTo] = useState(() => !hasSeenIntro());

  // Sound engine — reads the latest `soundEnabled` via ref so the mute toggle is live
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const playSoundEngineRef = useRef(createSoundEngine(() => soundEnabledRef.current));
  const playSound = useCallback((type: SoundType) => playSoundEngineRef.current(type), []);

  // Load High Score once
  useEffect(() => {
    setHighScore(loadHighScore());
  }, []);

  // Save High Score when beaten
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      saveHighScore(score);
    }
  }, [score, highScore]);

  // Report score upward for on-chain leaderboard submission
  useEffect(() => {
    onScoreChange?.(score);
  }, [score, onScoreChange]);

  // Persist the sound preference
  useEffect(() => {
    saveSoundPref(soundEnabled);
  }, [soundEnabled]);

  const initPool = useCallback(
    (width: number, height: number, word: string = "") => {
      const { tileSize, poolSpacing, trayY } = computeLayout(width, height, BASE_LAYOUT, { word, players: 1 });
      tiles.current = buildLetterPool({
        width, height, word,
        tileSize, poolSpacing, trayY,
        players: 1,
      });
    },
    [],
  );

  const createSparkles = (x: number, y: number, color: string) => {
    for (let i = 0; i < 20; i++) {
      particles.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12,
        life: 1.0,
        color,
      });
    }
  };

  const updateTrayWord = () => {
    const inTray = tiles.current
      .filter((t) => t.inTray)
      .sort((a, b) => (a.trayIndex || 0) - (b.trayIndex || 0));
    const word = inTray.map((t) => t.char).join("");
    setTrayWord(word);

    // Check if word is correct — use refs so closure always sees current values
    if (word === currentWordRef.current && word.length > 0 && !isCorrectRef.current) {
      playSoundRef.current("success");
      setIsCorrect(true);
      isCorrectRef.current = true;
      const diffConfig = DIFFICULTY_SETTINGS[difficultyRef.current];
      const timeBonus = Math.floor(timeLeftRef.current * diffConfig.multiplier);
      setScore(
        (prev) =>
          prev +
          Math.floor(word.length * 10 * diffConfig.multiplier) +
          timeBonus,
      );

      // Stop timers
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      // Create sparkles for all tiles
      tiles.current.forEach((t) => {
        if (t.inTray) createSparkles(t.x, t.y, COLOR_MAP[t.color]);
      });
    } else if (word !== currentWordRef.current) {
      setIsCorrect(false);
      isCorrectRef.current = false;
    }
  };

  const startTimer = useCallback(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    const limit = DIFFICULTY_SETTINGS[difficultyRef.current].time;
    setTimeLeft(limit);
    timeLeftRef.current = limit;
    isCorrectRef.current = false;
    setAddTimeCount(0); // reset add-time uses for new word

    timerIntervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        // Paused while a modal is open — freeze the countdown
        if (pausedRef.current) return prev;
        const next = prev - 1;
        timeLeftRef.current = next;
        if (next <= 5 && next > 0) {
          playSoundRef.current("tick");
        }
        if (next <= 0) {
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          playSoundRef.current("failure");
          setTimeout(() => {
            if (!isCorrectRef.current) nextWord();
          }, 500);
          return 0;
        }
        return next;
      });
    }, 1000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // uses refs — never needs to remount

  const addTime = useCallback(() => {
    setAddTimeCount((prev) => {
      if (prev >= MAX_ADD_TIME) return prev;
      const bonus = 5;
      setTimeLeft((t) => {
        const updated = t + bonus;
        timeLeftRef.current = updated;
        return updated;
      });
      playSoundRef.current("click");
      return prev + 1;
    });
  }, []);

  const nextWord = useCallback(() => {
    const nextWordText = pickRandomWord(category, difficulty);

    setCurrentWord(nextWordText);
    currentWordRef.current = nextWordText;
    setIsCorrect(false);
    isCorrectRef.current = false;

    // DO NOT write canvasRef.current.width here — setting canvas.width resets the
    // coordinate space, and if clientWidth is 0 at mount time the canvas becomes
    // invisible for the entire first word. resize() (in the camera effect) owns
    // canvas dimensions. We just need the current values for initPool.
    const cw =
      (canvasRef.current && canvasRef.current.width > 0 ? canvasRef.current.width : null) ??
      containerRef.current?.clientWidth ??
      window.innerWidth;
    const ch =
      (canvasRef.current && canvasRef.current.height > 0 ? canvasRef.current.height : null) ??
      containerRef.current?.clientHeight ??
      window.innerHeight;
    initPool(cw, ch, nextWordText);

    startTimer();
  }, [category, difficulty, initPool, startTimer]);

  // Initialize first word or reset when settings change
  useEffect(() => {
    // Only reset if we are just starting or settings changed mid-game
    // Ideally we might want a "New Game" button inside settings, but auto-restart is fine
    nextWord();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, difficulty]); // Restart when these change

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  // Keep stable refs up-to-date on every render
  useEffect(() => {
    playSoundRef.current = playSound;
    updateTrayWordRef.current = updateTrayWord;
    difficultyRef.current = difficulty;
    pausedRef.current = showHowTo || showSettings;
  });

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current || !containerRef.current)
      return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      // Guard: never set canvas to 0×0 — a zero-area canvas draws nothing
      if (w > 0 && h > 0) {
        canvas.width = w;
        canvas.height = h;
      }
      // Always reposition tiles for the (possibly new) canvas size
      if (currentWordRef.current && canvas.width > 0) {
        initPool(canvas.width, canvas.height, currentWordRef.current);
      }
    };

    window.addEventListener("resize", resize);
    resize();

    let camera: any = null;
    let hands: any = null;

    const onResults = (results: any) => {
      setLoading(false);

      // Keep the canvas matched to its container and re-layout when the size
      // changes. A <canvas> with no width attribute defaults to 300×150, so on
      // first mount the board would be laid out for 300px and only fix itself
      // after a window resize (the old "zoom out then back to 100%" workaround).
      // Syncing here self-corrects within the first frames — no zoom toggle needed.
      const cw = container.clientWidth || window.innerWidth;
      const ch = container.clientHeight || window.innerHeight;
      if (cw > 0 && ch > 0 && (canvas.width !== cw || canvas.height !== ch)) {
        canvas.width = cw;
        canvas.height = ch;
        if (currentWordRef.current) initPool(cw, ch, currentWordRef.current);
      }

      // Safety net: ensure tiles exist with the correct canvas dimensions
      if (tiles.current.length === 0 && currentWordRef.current) {
        initPool(canvas.width, canvas.height, currentWordRef.current);
      }

      // Responsive layout — tiles/tray scale to the viewport so everything fits
      // without zooming out. Shadows the design-base values for this frame.
      const { tileSize: TILE_SIZE, trayY: TRAY_Y } = computeLayout(canvas.width, canvas.height, BASE_LAYOUT, { word: currentWordRef.current, players: 1 });

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Mirror the video feed
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      ctx.fillStyle = "rgba(8, 8, 13, 0.82)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      let handPos: Point | null = null;
      let rawPinching = false;
      let pinchDistance = 1;

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        const idxTip = landmarks[8];
        const thumbTip = landmarks[4];

        // --- Cursor = index fingertip only ---
        // Using only the index tip (not the midpoint of index+thumb) means the
        // cursor doesn't drift when you squeeze your thumb in to pinch.
        const idxTipX = 1 - idxTip.x;   // flip for mirror
        const thumbTipX = 1 - thumbTip.x;
        // Amplify reach so the bottom rows are easy to grab without dropping the
        // hand out of the camera frame.
        const rawX = amplifyAxis(idxTipX, POINTER_GAIN_X) * canvas.width;
        // Shift the vertical center upward (0.45) so mid-hand maps lower,
        // making bottom-row tiles reachable without extreme hand dropping.
        const rawY = amplifyAxis(idxTip.y, POINTER_GAIN_Y, 0.45) * canvas.height;

        // Snap on first appearance; smooth thereafter
        if (!handWasPresent.current) {
          smoothHandPos.current.x = rawX;
          smoothHandPos.current.y = rawY;
          prevHandPos.current.x = rawX;
          prevHandPos.current.y = rawY;
          handVelocity.current = { x: 0, y: 0 };
          handWasPresent.current = true;
          handSettleFrames.current = 0;
          pinchFrames.current = 0;
          pinchConfirmed.current = false;
        } else {
          prevHandPos.current.x = smoothHandPos.current.x;
          prevHandPos.current.y = smoothHandPos.current.y;
          // Velocity-adaptive smoothing: fast motion → responsive, hovering → stable
          const dxSmooth = rawX - smoothHandPos.current.x;
          const dySmooth = rawY - smoothHandPos.current.y;
          const moveDist = Math.sqrt(dxSmooth * dxSmooth + dySmooth * dySmooth);
          const smoothFactor = HAND_SMOOTH_MIN + (HAND_SMOOTH_MAX - HAND_SMOOTH_MIN) * Math.min(1, moveDist / 80);
          smoothHandPos.current.x += dxSmooth * smoothFactor;
          smoothHandPos.current.y += dySmooth * smoothFactor;
          // Track velocity for trail effect
          handVelocity.current.x = smoothHandPos.current.x - prevHandPos.current.x;
          handVelocity.current.y = smoothHandPos.current.y - prevHandPos.current.y;
        }
        handSettleFrames.current = Math.min(handSettleFrames.current + 1, HAND_SETTLE_FRAMES + 1);
        handPos = { x: smoothHandPos.current.x, y: smoothHandPos.current.y };

        // Pinch distance = index tip vs thumb tip in normalized space
        const dx = idxTipX - thumbTipX;
        const dy = idxTip.y - thumbTip.y;
        pinchDistance = Math.sqrt(dx * dx + dy * dy);

        const threshold = activeTileId.current ? PINCH_RELEASE_THRESHOLD : PINCH_GRAB_THRESHOLD;
        rawPinching = pinchDistance < threshold;

        // Draw the skeleton at the SAME amplified coordinates as the grab cursor
        // so the on-screen hand and the cursor that actually picks tiles stay
        // glued together (the camera feed is 88% washed out, so matching the
        // cursor matters more than matching the faint video hand).
        drawHandSkeleton(ctx, landmarks, canvas.width, canvas.height, "rgba(130,177,255,0.55)", "#448aff");
      } else {
        // Hand lost — reset all gesture state
        handWasPresent.current = false;
        handSettleFrames.current = 0;
        pinchFrames.current = 0;
        pinchConfirmed.current = false;
      }

      // Grab confirmation: require N consecutive frames AND hand must have settled
      const handSettled = handSettleFrames.current >= HAND_SETTLE_FRAMES;
      if (rawPinching) {
        pinchFrames.current = Math.min(pinchFrames.current + 1, GRAB_CONFIRM_FRAMES + 1);
        if (pinchFrames.current >= GRAB_CONFIRM_FRAMES) pinchConfirmed.current = true;
      } else {
        pinchFrames.current = 0;
        if (!activeTileId.current) pinchConfirmed.current = false;
      }
      // Only count as pinching if confirmed AND hand has settled (no false grab on arrival)
      const isPinching = rawPinching && (pinchConfirmed.current || !!activeTileId.current) && handSettled;

      if (handPos && isPinching && !isCorrectRef.current && !pausedRef.current) {
        if (!activeTileId.current) {
          // Enlarged hit-box: TILE_SIZE * 0.75 per side for easier pickup
          const clicked = tiles.current.find(
            (t) =>
              Math.abs(t.x - handPos!.x) < TILE_SIZE * 0.75 &&
              Math.abs(t.y - handPos!.y) < TILE_SIZE * 0.75,
          );
          if (clicked) {
            activeTileId.current = clicked.id;
            clicked.isDragging = true;
            playSoundRef.current("click");
          }
        } else {
          const tile = tiles.current.find((t) => t.id === activeTileId.current);
          if (tile) {
            // Glide the tile toward the hand instead of snapping — a second
            // smoothing pass that filters out the residual (amplified) jitter.
            tile.x += (handPos!.x - tile.x) * DRAG_FOLLOW;
            tile.y += (handPos!.y - tile.y) * DRAG_FOLLOW;
          }
        }
      } else if (activeTileId.current) {
        const tile = tiles.current.find((t) => t.id === activeTileId.current);
        if (tile) {
          tile.isDragging = false;
          if (Math.abs(tile.y - TRAY_Y) < 100) {
            if (!tile.inTray) playSoundRef.current("click");
            tile.inTray = true;
            const trayTiles = tiles.current
              .filter((t) => t.inTray && t.id !== tile.id)
              .sort((a, b) => (a.trayIndex || 0) - (b.trayIndex || 0));
            tile.trayIndex = trayTiles.length;
            tile.targetY = TRAY_Y;
            const totalWidth = (trayTiles.length + 1) * TILE_SIZE * 1.1;
            const startX =
              (canvas.width - totalWidth) / 2 + (TILE_SIZE * 1.1) / 2;
            trayTiles.concat(tile).forEach((t, i) => {
              t.trayIndex = i;
              t.targetX = startX + i * TILE_SIZE * 1.1 - (TILE_SIZE * 1.1) / 2;
              t.targetY = TRAY_Y;
            });
          } else {
            tile.inTray = false;
            tile.trayIndex = undefined;
          }
        }
        activeTileId.current = null;
        updateTrayWordRef.current();
      }

      // Word Tray Background — use ref so canvas doesn't read stale isCorrect state
      const trayCorrect = isCorrectRef.current;
      ctx.fillStyle = trayCorrect ? "#c8e6c9" : "#ffffff";
      ctx.strokeStyle = trayCorrect ? "#66bb6a" : "#e0e0e0";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(60, TRAY_Y - 50, canvas.width - 120, 100, 24);
      ctx.fill();
      ctx.stroke();

      // --- Render tiles ---
      // Pre-compute which tile (if any) is being hovered for glow effect
      const hoveredTileId =
        handPos && !activeTileId.current
          ? (tiles.current.find(
              (t) =>
                !t.inTray &&
                Math.hypot(t.x - handPos!.x, t.y - handPos!.y) <
                  TILE_SIZE * 0.85,
            )?.id ?? null)
          : null;

      tiles.current.forEach((t) => {
        if (!t.isDragging) {
          t.x += (t.targetX - t.x) * 0.15;
          t.y += (t.targetY - t.y) * 0.15;
        }

        const isHovered = t.id === hoveredTileId;
        const isDragging = t.isDragging;

        ctx.save();
        ctx.translate(t.x, t.y);

        if (isDragging) {
          ctx.scale(1.28, 1.28);
          ctx.shadowBlur = 28;
          ctx.shadowColor = "rgba(66,133,244,0.35)";
        } else if (isHovered) {
          ctx.scale(1.08, 1.08);
          ctx.shadowBlur = 22;
          ctx.shadowColor = "rgba(66,133,244,0.45)";
        } else {
          ctx.shadowBlur = 8;
          ctx.shadowColor = "rgba(0,0,0,0.08)";
        }

        // Hover / drag ring
        if (isHovered || isDragging) {
          ctx.beginPath();
          ctx.roundRect(
            -TILE_SIZE / 2 - 4,
            -TILE_SIZE / 2 - 4,
            TILE_SIZE + 8,
            TILE_SIZE + 8,
            18,
          );
          ctx.strokeStyle = isDragging
            ? "rgba(255,64,129,0.7)"
            : "rgba(66,133,244,0.6)";
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        ctx.fillStyle = COLOR_MAP[t.color];
        ctx.beginPath();
        ctx.roundRect(-TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE, 14);
        ctx.fill();

        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.beginPath();
        ctx.roundRect(
          -TILE_SIZE / 2 + 4,
          -TILE_SIZE / 2 + 4,
          TILE_SIZE - 8,
          TILE_SIZE / 2 - 4,
          10,
        );
        ctx.fill();

        ctx.fillStyle = "#333";
        ctx.font = `bold ${TILE_SIZE * 0.55}px 'Roboto'`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(t.char, 0, 2);
        ctx.restore();
      });

      // --- Hand cursor ---
      if (handPos) {
        // Pinch strength: 0 = open, 1 = fully pinched
        const pinchStrength = Math.max(
          0,
          Math.min(1, 1 - (pinchDistance - 0) / (PINCH_GRAB_THRESHOLD * 2)),
        );

        const vel = handVelocity.current;
        const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);

        // Motion trail — draw behind cursor when moving fast
        if (speed > 1.5 && !isPinching) {
          const trailCount = 4;
          for (let tr = trailCount; tr >= 1; tr--) {
            const frac = tr / trailCount;
            const tx = handPos.x - vel.x * tr * 1.2;
            const ty = handPos.y - vel.y * tr * 1.2;
            ctx.beginPath();
            ctx.arc(tx, ty, 6 * frac, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(66,133,244,${0.08 * frac})`;
            ctx.fill();
          }
        }

        // Pinch progress arc (background track)
        const arcR = 28;
        ctx.beginPath();
        ctx.arc(handPos.x, handPos.y, arcR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2, false);
        ctx.strokeStyle = "rgba(200,200,200,0.25)";
        ctx.lineWidth = 4;
        ctx.stroke();

        // Pinch progress arc (fill)
        ctx.beginPath();
        ctx.arc(
          handPos.x,
          handPos.y,
          arcR,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * pinchStrength,
          false,
        );
        ctx.strokeStyle = isPinching
          ? "#ff4081"
          : `rgba(66,133,244,${0.6 + pinchStrength * 0.4})`;
        ctx.lineWidth = isPinching ? 5 : 3.5;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.lineCap = "butt";

        // Outer animated ring when actively dragging
        if (isPinching && activeTileId.current) {
          const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.01);
          ctx.beginPath();
          ctx.arc(handPos.x, handPos.y, arcR + 8 + pulse * 4, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,64,129,${0.2 + pulse * 0.15})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Inner filled dot — grows as you pinch
        const innerR = 5 + pinchStrength * 9;
        const grad = ctx.createRadialGradient(
          handPos.x, handPos.y, 0,
          handPos.x, handPos.y, innerR,
        );
        if (isPinching) {
          grad.addColorStop(0, "rgba(255,64,129,0.9)");
          grad.addColorStop(1, "rgba(255,64,129,0.1)");
        } else {
          grad.addColorStop(0, `rgba(66,133,244,${0.3 + pinchStrength * 0.5})`);
          grad.addColorStop(1, `rgba(66,133,244,0.05)`);
        }
        ctx.beginPath();
        ctx.arc(handPos.x, handPos.y, innerR, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Label pill
        const label = isPinching
          ? activeTileId.current ? "✦ DRAGGING" : "✦ GRAB"
          : pinchStrength > 0.4 ? "CLOSE..." : "PINCH";
        const labelY = handPos.y + arcR + 20;
        ctx.font = "bold 11px 'Roboto', sans-serif";
        ctx.textAlign = "center";
        const labelW = ctx.measureText(label).width + 16;
        const labelH = 20;
        ctx.fillStyle = isPinching
          ? "rgba(255,64,129,0.85)"
          : "rgba(66,133,244,0.75)";
        ctx.beginPath();
        ctx.roundRect(handPos.x - labelW / 2, labelY - labelH / 2, labelW, labelH, 10);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillText(label, handPos.x, labelY + 1);
      }

      for (let i = particles.current.length - 1; i >= 0; i--) {
        const p = particles.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.025;
        if (p.life <= 0) particles.current.splice(i, 1);
        else {
          ctx.globalAlpha = p.life;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    };

    const tryInit = () => {
      if (window.Hands && window.Camera) {
        // Re-use the pre-warmed instance if available (faster startup)
        if (window.__mpHandsWarm) {
          hands = window.__mpHandsWarm;
          window.__mpHandsWarm = null; // claim it
        } else {
          hands = new window.Hands({
            locateFile: (f: any) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
          });
        }
        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 0,          // lite model (fastest)
          minDetectionConfidence: 0.5, // slightly lower = faster to first detect
          minTrackingConfidence: 0.5,
        });
        hands.onResults(onResults);
        // Match camera resolution to the canvas/container so coordinates align.
        // Using actual display dimensions avoids getUserMedia failures from
        // requesting screen resolutions the webcam doesn't support.
        const camW = container.clientWidth || 1280;
        const camH = container.clientHeight || 720;
        camera = new window.Camera(video, {
          onFrame: async () => {
            if (hands && video.readyState >= 2) await hands.send({ image: video });
          },
          width: camW,
          height: camH,
        });
        Promise.resolve(camera.start()).catch((err: any) => {
          const msg = err?.name === "NotAllowedError"
            ? "Camera access was denied. Allow camera permissions and reload."
            : err?.name === "NotFoundError"
            ? "No camera was found on this device."
            : `Could not start camera: ${err?.message || err?.name || "unknown error"}`;
          setCameraError(msg);
          setLoading(false);
        });
      } else {
        setTimeout(tryInit, 100);
      }
    };
    tryInit();
    return () => {
      camera?.stop();
      hands?.close();
      window.removeEventListener("resize", resize);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Camera/hands must only mount ONCE — game state is accessed via refs

  // Calculate timer color based on time left
  const getTimerColor = () => {
    if (timeLeft > 20) return "text-emerald-300 border-emerald-400/40";
    if (timeLeft > 10) return "text-[#f5a623] border-amber-400/40";
    return "text-red-300 border-red-400/50 animate-pulse";
  };

  const dismissHowTo = () => {
    markIntroSeen();
    setShowHowTo(false);
  };

  return (
    <div className="flex w-full h-[100dvh] bg-[#08080d] overflow-hidden font-['DM_Sans',sans-serif] relative">
      {showHowTo && <HowToPlay mode="solo" onClose={dismissHowTo} />}

      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200">
          <div className="bg-[#0c0c12]/95 backdrop-blur-md p-8 rounded-3xl shadow-2xl border border-amber-500/20 max-w-sm w-full mx-6 transition-all scale-100">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl text-[#f0ece3] flex items-center gap-2.5 tracking-wide" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                <Settings className="w-6 h-6 text-[#f5a623]" /> Settings
              </h2>
              <button
                onClick={() => setShowSettings(false)}
                aria-label="Close settings"
                className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition border border-white/10"
              >
                <CheckCircle2 className="w-6 h-6 text-[#f5a623]" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Difficulty */}
              <div>
                <p className="text-[11px] uppercase font-bold text-[#f0ece3]/40 tracking-[0.2em] mb-2">
                  Difficulty
                </p>
                <div className="flex gap-2">
                  {(["EASY", "MEDIUM", "HARD"] as Difficulty[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${difficulty === d ? "bg-[#f5a623] text-[#08080d] shadow-lg shadow-amber-500/20 scale-105" : "bg-white/5 text-[#f0ece3]/55 hover:bg-white/10 border border-white/5"}`}
                    >
                      {DIFFICULTY_SETTINGS[d].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category */}
              <div>
                <p className="text-[11px] uppercase font-bold text-[#f0ece3]/40 tracking-[0.2em] mb-2">
                  Word Category
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(WORD_CATEGORIES) as Category[]).map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      className={`py-2.5 rounded-xl text-[11px] font-black transition-all uppercase tracking-wide ${category === c ? "bg-[#f5a623] text-[#08080d] shadow-lg shadow-amber-500/20" : "bg-white/5 text-[#f0ece3]/55 hover:bg-white/10 border border-white/5"}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sound */}
              <div>
                <p className="text-[11px] uppercase font-bold text-[#f0ece3]/40 tracking-[0.2em] mb-2">
                  Sound
                </p>
                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 font-bold transition-all border ${soundEnabled ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" : "bg-red-500/10 text-red-300 border-red-500/30"}`}
                >
                  {soundEnabled ? (
                    <Volume2 className="w-5 h-5" />
                  ) : (
                    <VolumeX className="w-5 h-5" />
                  )}
                  {soundEnabled ? "Sound On" : "Sound Off"}
                </button>
              </div>
            </div>

            <div className="mt-8 text-center text-[11px] text-[#f0ece3]/35 font-medium">
              Adjusting difficulty will restart the current word.
            </div>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="flex-1 relative h-full overflow-hidden"
      >
        <video ref={videoRef} className="absolute hidden" playsInline />
        <canvas ref={canvasRef} className="absolute inset-0" />

        {/* Header */}
        <div className="absolute top-6 left-6 z-40 flex items-center gap-3">
          <div className="bg-[#0c0c12]/85 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-amber-500/20 flex items-center gap-3.5">
            <div className="bg-[#f5a623] p-3 rounded-xl shadow-md shadow-amber-500/30">
              <Sparkles className="w-6 h-6 text-[#08080d]" />
            </div>
            <div>
              <h1 className="text-2xl text-[#f0ece3] tracking-wide leading-none" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                Spelling Adventure
              </h1>
              <p className="text-[11px] text-[#f5a623] font-bold flex items-center gap-1 uppercase tracking-[0.18em] mt-1">
                <MousePointer2 className="w-3 h-3" /> Pinch to spell!
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowSettings(!showSettings)}
            aria-label="Settings"
            className="bg-[#0c0c12]/85 backdrop-blur-md p-3 rounded-full shadow-lg hover:bg-[#15151d] transition-all group border border-amber-500/20 active:scale-95"
          >
            <Settings
              className={`w-6 h-6 text-[#f0ece3]/80 transition-transform duration-700 ${showSettings ? "rotate-180" : ""}`}
            />
          </button>

          <button
            onClick={() => setShowHowTo(true)}
            aria-label="How to play"
            className="bg-[#0c0c12]/85 backdrop-blur-md p-3 rounded-full shadow-lg hover:bg-[#15151d] transition-all border border-amber-500/20 active:scale-95"
          >
            <HelpCircle className="w-6 h-6 text-[#f0ece3]/80" />
          </button>
        </div>

        {/* Score & Timer & High Score */}
        <div className="absolute top-6 right-6 z-40 flex flex-col items-end gap-3">
          <div className="flex gap-3 items-stretch">
            <div className="bg-[#0c0c12]/85 backdrop-blur-md px-4 py-2 rounded-2xl shadow-lg border border-amber-500/20 flex items-center gap-2">
              <Crown className="w-4 h-4 text-[#f5a623]" />
              <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase font-bold text-[#f5a623]/80 leading-none tracking-wider">
                  Best
                </span>
                <span className="text-sm font-black text-[#f0ece3] leading-none mt-1 tabular-nums">
                  {highScore}
                </span>
              </div>
            </div>

            <div className="bg-[#0c0c12]/85 backdrop-blur-md px-5 py-3 rounded-2xl shadow-xl border border-amber-500/20 flex items-center gap-3">
              <Trophy className="w-6 h-6 text-[#f5a623]" />
              <div>
                <p className="text-[10px] text-[#f0ece3]/45 uppercase tracking-[0.18em] font-bold">
                  Score
                </p>
                <p className="text-2xl font-black text-[#f0ece3] leading-tight tabular-nums">{score}</p>
              </div>
            </div>
          </div>

          {!isCorrect && (
            <div className="flex flex-col items-end gap-2">
              <div
                className={`bg-[#0c0c12]/85 backdrop-blur-md px-5 py-3 rounded-2xl shadow-xl border flex items-center gap-3 transition-colors duration-500 ${getTimerColor()}`}
              >
                <Clock className="w-6 h-6" />
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] font-bold opacity-70">
                    Time
                  </p>
                  <p className="text-2xl font-black font-mono tabular-nums">{timeLeft}s</p>
                </div>
              </div>
              {/* +5s boost button */}
              <button
                onClick={addTime}
                disabled={addTimeCount >= MAX_ADD_TIME}
                title={addTimeCount >= MAX_ADD_TIME ? "Max boosts used" : "Add 5 seconds"}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-black shadow-lg transition-all active:scale-95 border ${
                  addTimeCount >= MAX_ADD_TIME
                    ? "bg-white/5 text-[#f0ece3]/30 border-white/5 cursor-not-allowed"
                    : "bg-emerald-500/15 text-emerald-300 border-emerald-400/40 hover:bg-emerald-500/25 hover:scale-105"
                }`}
              >
                <Clock className="w-4 h-4" />
                +5s
                {addTimeCount > 0 && (
                  <span className="bg-white/25 rounded-full px-1.5 py-0.5 text-[10px] ml-0.5">
                    {MAX_ADD_TIME - addTimeCount} left
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Target Word Display */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40">
          <div className="bg-[#0c0c12]/90 backdrop-blur-md px-12 py-5 rounded-3xl shadow-2xl border border-amber-500/30 relative overflow-hidden">
            {/* Top accent line */}
            <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: "linear-gradient(90deg,transparent,#f5a623,transparent)" }} />
            {/* Category Badge */}
            <div className="absolute top-0 right-0 bg-amber-500/15 px-3 py-1 rounded-bl-xl text-[10px] font-black text-[#f5a623] uppercase tracking-widest">
              {category} • {DIFFICULTY_SETTINGS[difficulty].label}
            </div>

            <p className="text-[11px] text-[#f0ece3]/50 uppercase tracking-[0.3em] font-bold mb-1 text-center mt-2">
              Spell this word
            </p>
            <p className="text-6xl tracking-[0.18em] text-[#f0ece3] uppercase text-center" style={{ fontFamily: "'Bebas Neue', sans-serif", textShadow: "0 0 40px rgba(245,166,35,0.25)" }}>
              {currentWord}
            </p>
          </div>
        </div>

        {/* Success celebration — centered card over a soft backdrop so it never
            collides with the word card or the letter tiles. The live spelling is
            already shown by the tiles sitting in the tray. */}
        {isCorrect && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px] animate-in fade-in duration-300">
            <div className="bg-[#0c0c12]/95 backdrop-blur-md rounded-3xl shadow-2xl border border-emerald-400/40 px-10 py-8 text-center max-w-sm mx-6 animate-in zoom-in-95 duration-300">
              <div className="flex justify-center mb-4">
                <div className="bg-emerald-500/15 border border-emerald-400/40 p-4 rounded-full">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                </div>
              </div>
              <p className="text-5xl tracking-[0.16em] text-[#f0ece3] uppercase mb-3" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                {currentWord}
              </p>
              <div className="inline-flex items-center gap-2 bg-emerald-500/15 text-emerald-300 border border-emerald-400/40 px-5 py-2 rounded-full font-black mb-7">
                <Star className="w-4 h-4 text-[#f5a623] fill-current" />
                Perfect! +
                {Math.floor(
                  currentWord.length * 10 * DIFFICULTY_SETTINGS[difficulty].multiplier,
                ) +
                  Math.floor(timeLeft * DIFFICULTY_SETTINGS[difficulty].multiplier)}{" "}
                pts
              </div>
              <button
                onClick={nextWord}
                className="w-full bg-[#f5a623] hover:bg-amber-400 text-[#08080d] font-black px-8 py-4 rounded-2xl shadow-xl shadow-amber-500/20 flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-95 text-lg"
              >
                <span>Next Word</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {loading && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#08080d] z-50">
            <div className="flex flex-col items-center">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-white/10 border-t-[#f5a623] rounded-full animate-spin" />
                <Sparkles className="absolute -top-2 -right-2 text-[#f5a623] animate-pulse" />
              </div>
              <p className="mt-8 text-2xl text-[#f0ece3]/80 tracking-wide" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                Starting Adventure…
              </p>
            </div>
          </div>
        )}

        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#08080d] z-50 px-6">
            <div className="bg-[#0c0c12]/95 backdrop-blur-md rounded-3xl shadow-2xl border border-red-400/40 px-8 py-7 max-w-md text-center">
              <div className="flex justify-center mb-3">
                <div className="bg-red-500/15 border border-red-400/40 p-3.5 rounded-full">
                  <Clock className="w-8 h-8 text-red-300" />
                </div>
              </div>
              <p className="text-2xl text-[#f0ece3] mb-2 tracking-wide" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>Camera Unavailable</p>
              <p className="text-sm text-[#f0ece3]/55 mb-5">{cameraError}</p>
              <button
                onClick={() => window.location.reload()}
                className="bg-[#f5a623] hover:bg-amber-400 text-[#08080d] font-bold px-6 py-3 rounded-full shadow-lg transition-all active:scale-95"
              >
                Reload
              </button>
            </div>
          </div>
        )}

        {/* On-screen AI companion — coaches the player live (0G Compute when configured) */}
        {!loading && !cameraError && (
          <SpellSage
            word={currentWord}
            category={category}
            difficulty={DIFFICULTY_SETTINGS[difficulty].label}
            timeLeft={timeLeft}
            traySoFar={trayWord}
            isCorrect={isCorrect}
          />
        )}
      </div>
    </div>
  );
};

export default SpellingAdventure;

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Point, LetterTile, Particle } from "../types";
import {
  Sparkles,
  MousePointer2,
  CheckCircle2,
  Trophy,
  ArrowRight,
  Settings,
  Volume2,
  VolumeX,
  Star,
  RefreshCcw,
  HelpCircle,
  Crown,
} from "lucide-react";
import { WORD_CATEGORIES } from "./wordLists";
import { HowToPlay } from "./HowToPlay";
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
  loadSoundPref,
  saveSoundPref,
} from "./gameCore";

const PINCH_GRAB_THRESHOLD = 0.10;
const PINCH_RELEASE_THRESHOLD = 0.15;
const HAND_SMOOTH = 0.55;
const DRAG_FOLLOW = 0.5;   // how fast a held tile glides to the hand (lower = steadier)
const GRAB_CONFIRM_FRAMES = 1;
const HAND_SETTLE_FRAMES = 1;

// Base (design-reference) layout — scaled to the viewport at runtime via computeLayout
const BASE_LAYOUT = { tileSize: 60, poolSpacing: 1.3, trayY: 220 };

// Score needed to win the head-to-head match
const POINTS_TO_WIN = 500;

export const MultiplayerAdventure: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const tiles = useRef<LetterTile[]>([]);
  const particles = useRef<Particle[]>([]);
  const activeTileId = useRef<Record<number, string | null>>({0: null, 1: null});
  // Gesture smoothing & confirmation — off-screen initial pos prevents false grabs
  const smoothHandPos = useRef<Record<number, Point>>({0: { x: -9999, y: -9999 }, 1: { x: -9999, y: -9999 }});
  const pinchFrames = useRef<Record<number, number>>({0: 0, 1: 0});
  const pinchConfirmed = useRef<Record<number, boolean>>({0: false, 1: false});
  const handSettleFrames = useRef<Record<number, number>>({0: 0, 1: 0});
  const handWasPresent = useRef<Record<number, boolean>>({0: false, 1: false});

  // Ref to track correct state inside timer (avoid stale closure)
  const isCorrectRef = useRef(false);
  const isCorrect2Ref = useRef(false);
  // Refs for all values used inside the once-mounted camera loop
  const currentWordRef = useRef("");
  const difficultyRef = useRef<"EASY" | "MEDIUM" | "HARD">("MEDIUM");
  const soundEnabledRef = useRef(true);
  const playSoundRef = useRef<(type: SoundType) => void>(() => {});
  const updateTrayRef = useRef<(p: number) => void>(() => {});

  // Game State
  const [loading, setLoading] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [currentWord, setCurrentWord] = useState("");
  const [trayWord, setTrayWord] = useState("");
  const [trayWord2, setTrayWord2] = useState("");
  const [isCorrect, setIsCorrect] = useState(false);
  const [isCorrect2, setIsCorrect2] = useState(false);
  const [score, setScore] = useState(0);
  const [score2, setScore2] = useState(0);
  const [winner, setWinner] = useState<0 | 1 | null>(null); // match winner (P1=0, P2=1)

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("MEDIUM");
  const [category, setCategory] = useState<Category>("ANIMALS");
  const [soundEnabled, setSoundEnabled] = useState(loadSoundPref);

  // True while a modal or the winner screen is up — freezes hand input
  const pausedRef = useRef(false);

  // Sound engine — reads the latest mute state via ref to avoid stale closures
  const playSoundEngineRef = useRef(createSoundEngine(() => soundEnabledRef.current));
  const playSound = useCallback((type: SoundType) => playSoundEngineRef.current(type), []);

  // Keep refs in sync with state every render
  useEffect(() => {
    playSoundRef.current = playSound;
    soundEnabledRef.current = soundEnabled;
    difficultyRef.current = difficulty;
    pausedRef.current = showSettings || showHowTo || winner !== null;
  });
  useEffect(() => { updateTrayRef.current = updateTray; });

  // Persist the sound preference
  useEffect(() => {
    saveSoundPref(soundEnabled);
  }, [soundEnabled]);

  const initPool = useCallback(
    (width: number, height: number, word: string = "") => {
      const { tileSize, poolSpacing, trayY } = computeLayout(width, height, BASE_LAYOUT, { word, players: 2 });
      tiles.current = buildLetterPool({
        width, height, word,
        tileSize, poolSpacing, trayY,
        players: 2,
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

  const updateTray = (p: number) => {
    const inTray = tiles.current
      .filter((t) => t.trayOwner === p && t.inTray)
      .sort((a, b) => (a.trayIndex || 0) - (b.trayIndex || 0));
    const word = inTray.map((t) => t.char).join("");
    
    if (p === 0) setTrayWord(word); 
    else setTrayWord2(word);

    // Check if word is correct — use refs to avoid stale closures
    const alreadyCorrect = p === 0 ? isCorrectRef.current : isCorrect2Ref.current;
    if (word === currentWordRef.current && word.length > 0 && !alreadyCorrect) {
      playSoundRef.current("success");
      if (p === 0) { setIsCorrect(true); isCorrectRef.current = true; }
      else { setIsCorrect2(true); isCorrect2Ref.current = true; }

      const diffConfig = DIFFICULTY_SETTINGS[difficultyRef.current];
      const points = Math.floor(word.length * 10 * diffConfig.multiplier);

      if (p === 0) setScore((prev) => prev + points);
      else setScore2((prev) => prev + points);

      tiles.current.forEach((t) => {
        if (t.trayOwner === p) createSparkles(t.x, t.y, COLOR_MAP[t.color]);
      });
    } else if (word !== currentWordRef.current) {
      if (p === 0) { setIsCorrect(false); isCorrectRef.current = false; }
      else { setIsCorrect2(false); isCorrect2Ref.current = false; }
    }
  };

  const nextWord = useCallback(() => {
    const nextWordText = pickRandomWord(category, difficultyRef.current);

    setCurrentWord(nextWordText);
    currentWordRef.current = nextWordText;
    setTrayWord("");
    setTrayWord2("");
    setIsCorrect(false);
    setIsCorrect2(false);
    isCorrectRef.current = false;
    isCorrect2Ref.current = false;

    const cw =
      (canvasRef.current && canvasRef.current.width > 0 ? canvasRef.current.width : null) ??
      containerRef.current?.clientWidth ??
      window.innerWidth;
    const ch =
      (canvasRef.current && canvasRef.current.height > 0 ? canvasRef.current.height : null) ??
      containerRef.current?.clientHeight ??
      window.innerHeight;
    initPool(cw, ch, nextWordText);
  }, [category, initPool]);


  const resetMatch = () => {
    setScore(0);
    setScore2(0);
    setWinner(null);
    nextWord();
  };

  // Declare a winner once a player crosses the threshold
  useEffect(() => {
    if (winner !== null) return;
    if (score >= POINTS_TO_WIN || score2 >= POINTS_TO_WIN) {
      const champ: 0 | 1 = score >= score2 ? 0 : 1;
      setWinner(champ);
      playSoundRef.current("win");
    }
  }, [score, score2, winner]);

  // Initialize first word or reset when settings change
  useEffect(() => {
    // Only reset if we are just starting or settings changed mid-game
    // Ideally we might want a "New Game" button inside settings, but auto-restart is fine
    nextWord();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, difficulty]); // Restart when these change

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
      if (w > 0 && h > 0) {
        canvas.width = w;
        canvas.height = h;
      }
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

      // Keep the canvas matched to its container and re-layout on size change.
      // A <canvas> defaults to 300×150, so without this the board lays out for
      // 300px on first mount and only fixes itself after a window resize / zoom
      // toggle. Syncing here self-corrects within the first frames.
      const cw = container.clientWidth || window.innerWidth;
      const ch = container.clientHeight || window.innerHeight;
      if (cw > 0 && ch > 0 && (canvas.width !== cw || canvas.height !== ch)) {
        canvas.width = cw;
        canvas.height = ch;
        if (currentWordRef.current) initPool(cw, ch, currentWordRef.current);
      }
      if (tiles.current.length === 0 && currentWordRef.current) {
        initPool(canvas.width, canvas.height, currentWordRef.current);
      }

      // Responsive layout — tiles/tray scale to the viewport so everything fits
      const { tileSize: TILE_SIZE, trayY: TRAY_Y } = computeLayout(canvas.width, canvas.height, BASE_LAYOUT, { word: currentWordRef.current, players: 2 });

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Mirror the video feed
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      
      let handPosMap: Record<number, Point> = {};
      let isPinchingMap: Record<number, boolean> = {};

      const activeHands = new Set<number>();
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const rawHands = results.multiHandLandmarks;
        const handsWithCenters = rawHands.map((landmarks: any) => {
           // Cursor = index tip only; sort position uses index tip for consistency.
           // Amplify reach so both players can grab the bottom rows comfortably.
           const idxTipX = 1 - landmarks[8].x;   // mirror
           const thumbTipX = 1 - landmarks[4].x;
           const rawX = amplifyAxis(idxTipX, POINTER_GAIN_X) * canvas.width;
           return { landmarks, rawX, idxTipX, thumbTipX, idxTipY: landmarks[8].y, thumbTipY: landmarks[4].y };
        });
        
        handsWithCenters.sort((a: any, b: any) => a.rawX - b.rawX); // Left hand (P1) is 0, Right hand (P2) is 1.

        handsWithCenters.forEach((h: any, idx: number) => {
          // Assign by sort order, NOT by screen half. Using screen-half meant
          // when both players' hands moved to the same side of the screen,
          // they collided onto the same player index and one hand vanished.
          // Cap at 2 players in case MediaPipe ever returns 3+ hands.
          if (idx > 1) return;
          const p = idx;
          activeHands.add(p);
          
          // Cursor follows index tip (amplified for easier bottom-row reach)
          const rawY = amplifyAxis(h.idxTipY, POINTER_GAIN_Y) * canvas.height;

          // Snap on first appearance per player
          if (!handWasPresent.current[p]) {
            smoothHandPos.current[p].x = h.rawX;
            smoothHandPos.current[p].y = rawY;
            handWasPresent.current[p] = true;
            handSettleFrames.current[p] = 0;
            pinchFrames.current[p] = 0;
            pinchConfirmed.current[p] = false;
          } else {
            smoothHandPos.current[p].x += (h.rawX - smoothHandPos.current[p].x) * HAND_SMOOTH;
            smoothHandPos.current[p].y += (rawY - smoothHandPos.current[p].y) * HAND_SMOOTH;
          }
          handSettleFrames.current[p] = Math.min(handSettleFrames.current[p] + 1, HAND_SETTLE_FRAMES + 1);
          handPosMap[p] = { x: smoothHandPos.current[p].x, y: smoothHandPos.current[p].y };

          const dx = h.idxTipX - h.thumbTipX;
          const dy = h.idxTipY - h.thumbTipY;
          let pinchDistance = Math.sqrt(dx * dx + dy * dy);

          const threshold = activeTileId.current[p] ? PINCH_RELEASE_THRESHOLD : PINCH_GRAB_THRESHOLD;
          let rawPinching = pinchDistance < threshold;

          if (rawPinching) {
            pinchFrames.current[p] = Math.min(pinchFrames.current[p] + 1, GRAB_CONFIRM_FRAMES + 1);
            if (pinchFrames.current[p] >= GRAB_CONFIRM_FRAMES) pinchConfirmed.current[p] = true;
          } else {
            pinchFrames.current[p] = 0;
            if (!activeTileId.current[p]) pinchConfirmed.current[p] = false;
          }
          const handSettled = handSettleFrames.current[p] >= HAND_SETTLE_FRAMES;
          isPinchingMap[p] = rawPinching && (pinchConfirmed.current[p] || !!activeTileId.current[p]) && handSettled;

          // Draw MediaPipe skeleton overlay so each player can see the tracker
          // locked onto their hand (matches the solo & network modes).
          // Skeleton drawn at the amplified cursor coordinates (P1 blue, P2 pink)
          // so each player's on-screen hand matches the cursor that grabs tiles.
          const handColor = p === 0 ? "rgba(66,133,244,0.6)" : "rgba(255,64,129,0.6)";
          const jointColor = p === 0 ? "#448aff" : "#ff4081";
          drawHandSkeleton(ctx, h.landmarks, canvas.width, canvas.height, handColor, jointColor);
        });
      }

      [0, 1].forEach((p) => {
        if (!activeHands.has(p)) {
          // Hand lost for this player: reset gesture state
          handWasPresent.current[p] = false;
          handSettleFrames.current[p] = 0;
          pinchFrames.current[p] = 0;
          if (!activeTileId.current[p]) pinchConfirmed.current[p] = false;
        }

        const handPos = handPosMap[p];
        const isPinching = isPinchingMap[p];
        const trayCenter = p === 0 ? canvas.width * 0.25 : canvas.width * 0.75;
        const trayIsCorrect = p === 0 ? isCorrect : isCorrect2;

        if (handPos && isPinching && !pausedRef.current && !(p === 0 ? isCorrectRef.current : isCorrect2Ref.current)) {
          if (!activeTileId.current[p]) {
            const clicked = tiles.current.find(t => 
              Math.abs(t.x - handPos.x) < TILE_SIZE * 0.75 && 
              Math.abs(t.y - handPos.y) < TILE_SIZE * 0.75 &&
              !Object.values(activeTileId.current).includes(t.id)
            );
            if (clicked) {
              activeTileId.current[p] = clicked.id;
              clicked.isDragging = true;
              playSoundRef.current("click");
            }
          } else {
            const tile = tiles.current.find(t => t.id === activeTileId.current[p]);
            if (tile) {
              // Glide toward the hand instead of snapping — filters residual jitter.
              tile.x += (handPos.x - tile.x) * DRAG_FOLLOW;
              tile.y += (handPos.y - tile.y) * DRAG_FOLLOW;
            }
          }
        } else if (activeTileId.current[p]) {
          const tile = tiles.current.find(t => t.id === activeTileId.current[p]);
          if (tile) {
            tile.isDragging = false;
            // Dropped near player's tray
            if (Math.abs(tile.y - TRAY_Y) < 100 && Math.abs(tile.x - trayCenter) < (canvas.width * 0.45) / 2) {
              if (tile.trayOwner !== p) playSoundRef.current("click");
              tile.inTray = true;
              tile.trayOwner = p;
              
              const trayTiles = tiles.current.filter(t => t.trayOwner === p && t.id !== tile.id)
                .sort((a, b) => (a.trayIndex || 0) - (b.trayIndex || 0));
              tile.trayIndex = trayTiles.length;
              tile.targetY = TRAY_Y;
              const totalWidth = (trayTiles.length + 1) * TILE_SIZE * 1.1;
              const startX = trayCenter - totalWidth / 2 + (TILE_SIZE * 1.1) / 2;
              trayTiles.concat(tile).forEach((t, i) => {
                t.trayIndex = i;
                t.targetX = startX + i * TILE_SIZE * 1.1 - (TILE_SIZE * 1.1) / 2;
                t.targetY = TRAY_Y;
              });
            } else {
              tile.inTray = false;
              tile.trayOwner = undefined;
              tile.trayIndex = undefined;
            }
          }
          activeTileId.current[p] = null;
          updateTrayRef.current(p);
        }
      });
      
      [0, 1].forEach((p) => {
         const trayCenter = p === 0 ? canvas.width * 0.25 : canvas.width * 0.75;
         // Use refs to avoid stale closure for tray colour
         const trayIsCorrect = p === 0 ? isCorrectRef.current : isCorrect2Ref.current;
         const trayW = canvas.width * 0.45;
         ctx.fillStyle = trayIsCorrect ? "#c8e6c9" : "#ffffff";
         ctx.strokeStyle = trayIsCorrect ? "#66bb6a" : "#e0e0e0";
         ctx.lineWidth = 3;
         ctx.beginPath();
         ctx.roundRect(trayCenter - trayW/2, TRAY_Y - 50, trayW, 100, 24);
         ctx.fill();
         ctx.stroke();

         ctx.font = "bold 14px sans-serif";
         ctx.fillStyle = trayIsCorrect ? "#388e3c" : "#ccc";
         ctx.textAlign = "center";
         ctx.fillText(p === 0 ? "PLAYER 1" : "PLAYER 2", trayCenter, TRAY_Y - 20);
      });

      // --- Render tiles ---
      // Pre-compute which tile (if any) is being hovered for glow effect
      const hoveredTileIds = [0, 1].map(p => 
        handPosMap[p] && !activeTileId.current[p]
          ? (tiles.current.find(
              (t) =>
                !t.inTray &&
                Math.hypot(t.x - handPosMap[p]!.x, t.y - handPosMap[p]!.y) <
                  TILE_SIZE * 0.85,
            )?.id ?? null)
          : null
      );

      tiles.current.forEach((t) => {
        if (!t.isDragging) {
          t.x += (t.targetX - t.x) * 0.15;
          t.y += (t.targetY - t.y) * 0.15;
        }

        const isHovered = hoveredTileIds.includes(t.id);
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
      [0, 1].forEach(p => {
        const hp = handPosMap[p];
        if (hp) {
          // Basic pinch visualization without exact distance
          const isPinching = isPinchingMap[p];
          const pinchStrength = isPinching ? 1 : 0.2;
          
          // Outer ring — shrinks as you pinch closer
          const outerR = 30 - pinchStrength * 12;
          ctx.beginPath();
          ctx.arc(hp.x, hp.y, outerR, 0, Math.PI * 2);
          ctx.strokeStyle = isPinching
            ? (p===0 ? "#4285f4" : "#ff4081")
            : (p===0 ? `rgba(66,133,244,${0.4 + pinchStrength * 0.5})` : `rgba(255,64,129,${0.4 + pinchStrength * 0.5})`);
          ctx.lineWidth = isPinching ? 4 : 2.5;
          ctx.stroke();

          // Inner filled dot — grows as you pinch
          const innerR = 4 + pinchStrength * 8;
          ctx.beginPath();
          ctx.arc(hp.x, hp.y, innerR, 0, Math.PI * 2);
          ctx.fillStyle = isPinching
            ? (p===0 ? "rgba(66,133,244,0.55)" : "rgba(255,64,129,0.55)")
            : (p===0 ? `rgba(66,133,244,${0.2 + pinchStrength * 0.4})` : `rgba(255,64,129,${0.2 + pinchStrength * 0.4})`);
          ctx.fill();

          // Label
          ctx.font = "bold 11px sans-serif";
          ctx.textAlign = "center";
          ctx.fillStyle = isPinching ? (p===0 ? "#4285f4" : "#ff4081") : (p===0 ? "#82b1ff" : "#ff80ab");
          ctx.fillText(
            isPinching ? "✦ GRAB" : "PINCH",
            hp.x,
            hp.y + outerR + 16,
          );
        }
      });

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
        if (window.__mpHandsWarm) {
          hands = window.__mpHandsWarm;
          window.__mpHandsWarm = null;
        } else {
          hands = new window.Hands({
            locateFile: (f: any) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
          });
        }
        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 0,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        hands.onResults(onResults);
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
  }, []); // camera mounts ONCE — all game state accessed via refs

  return (
    <div className="flex w-full h-[100dvh] bg-gradient-to-br from-blue-50 to-purple-50 overflow-hidden font-roboto relative">
      {showHowTo && <HowToPlay mode="local" onClose={() => setShowHowTo(false)} />}

      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200">
          <div className="bg-white p-8 rounded-[38px] shadow-2xl max-w-sm w-full mx-6 transition-all scale-100">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-gray-800 flex items-center gap-2">
                <Settings className="w-6 h-6 text-blue-500" /> Settings
              </h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition"
              >
                <CheckCircle2 className="w-6 h-6 text-gray-600" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Difficulty */}
              <div>
                <p className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-2">
                  Difficulty
                </p>
                <div className="flex gap-2">
                  {(["EASY", "MEDIUM", "HARD"] as Difficulty[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${difficulty === d ? "bg-blue-600 text-white shadow-lg scale-105" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                    >
                      {DIFFICULTY_SETTINGS[d].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category */}
              <div>
                <p className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-2">
                  Word Category
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(WORD_CATEGORIES) as Category[]).map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      className={`py-2 rounded-xl text-[11px] font-black transition-all uppercase tracking-wide ${category === c ? "bg-purple-600 text-white shadow-lg" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sound */}
              <div>
                <p className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-2">
                  Sound
                </p>
                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 font-bold transition-all ${soundEnabled ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
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

            <div className="mt-8 text-center text-xs text-gray-400 font-medium">
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
        <div className="absolute top-6 left-6 z-40 flex items-center gap-4">
          <div className="bg-white/95 backdrop-blur-md p-4 rounded-[28px] shadow-xl border border-blue-100 flex items-center gap-4">
            <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-3 rounded-2xl shadow-md">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-800 tracking-tight">
                Spelling Adventure
              </h1>
              <p className="text-[11px] text-blue-600 font-bold flex items-center gap-1 uppercase tracking-wider">
                <MousePointer2 className="w-3 h-3" /> Pinch to spell!
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="bg-white/95 p-3 rounded-full shadow-lg hover:shadow-xl transition-all group border border-gray-100 active:scale-95"
          >
            <Settings
              className={`w-6 h-6 text-gray-600 transition-transform duration-700 ${showSettings ? "rotate-180" : ""}`}
            />
          </button>

          <button
            onClick={() => setShowHowTo(true)}
            title="How to play"
            className="bg-white/95 p-3 rounded-full shadow-lg hover:shadow-xl transition-all border border-gray-100 active:scale-95"
          >
            <HelpCircle className="w-6 h-6 text-gray-600" />
          </button>

          <div className="bg-white/90 backdrop-blur-md px-4 py-2 rounded-full shadow-lg border border-amber-200 flex items-center gap-2 text-amber-700">
            <Crown className="w-4 h-4" />
            <span className="text-xs font-black uppercase tracking-wider">First to {POINTS_TO_WIN}</span>
          </div>
        </div>

        {/* Player Scores — both players visible in head-to-head */}
        <div className="absolute top-6 right-6 z-40 flex flex-col items-end gap-3">
          <div className="flex gap-3">
            <div className="bg-white/95 backdrop-blur-md p-4 rounded-[28px] shadow-xl border-2 border-blue-200 flex items-center gap-3">
              <Trophy className="w-6 h-6 text-blue-500" />
              <div>
                <p className="text-xs text-blue-500 uppercase tracking-wider font-bold">
                  Player 1
                </p>
                <p className="text-2xl font-black text-gray-800">{score}</p>
              </div>
            </div>

            <div className="bg-white/95 backdrop-blur-md p-4 rounded-[28px] shadow-xl border-2 border-red-200 flex items-center gap-3">
              <Trophy className="w-6 h-6 text-red-500" />
              <div>
                <p className="text-xs text-red-500 uppercase tracking-wider font-bold">
                  Player 2
                </p>
                <p className="text-2xl font-black text-gray-800">{score2}</p>
              </div>
            </div>
          </div>

          <button
            onClick={resetMatch}
            title="Reset both players' scores and start a fresh match"
            className="bg-white/95 backdrop-blur-md hover:bg-gray-50 text-gray-700 font-bold text-sm px-4 py-2 rounded-full shadow-lg border border-gray-200 flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
          >
            <RefreshCcw className="w-4 h-4" />
            Reset Match
          </button>
        </div>

        {/* Target Word Display */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40">
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 px-12 py-6 rounded-[32px] shadow-2xl border-4 border-white relative overflow-hidden group">
            {/* Category Badge */}
            <div className="absolute top-0 right-0 bg-white/20 px-3 py-1 rounded-bl-xl text-[10px] font-black text-white/90 uppercase tracking-widest backdrop-blur-sm">
              {category} • {DIFFICULTY_SETTINGS[difficulty].label}
            </div>

            <p className="text-xs text-white/80 uppercase tracking-widest font-bold mb-2 text-center mt-2 group-hover:scale-105 transition-transform">
              Spell this word:
            </p>
            <p className="text-5xl font-black tracking-[0.3em] text-white uppercase text-center drop-shadow-lg scale-100 transition-all">
              {currentWord}
            </p>
          </div>
        </div>

        
        {/* User 1 Spelled Word */}
        {trayWord && (
          <div className="absolute top-28 left-1/4 -translate-x-1/2 z-40">
            <div className={`px-10 py-4 rounded-[30px] shadow-2xl flex items-center gap-4 border-2 transition-all duration-500 ${isCorrect ? "bg-green-50 border-green-300 scale-105" : "bg-white border-blue-200"}`}>
              <span className="text-4xl font-black tracking-[0.2em] text-gray-900 uppercase">{trayWord}</span>
              {isCorrect && <CheckCircle2 className="w-7 h-7 text-green-500 animate-bounce" />}
            </div>
          </div>
        )}
        {/* User 2 Spelled Word */}
        {trayWord2 && (
          <div className="absolute top-28" style={{ left: '75%', transform: 'translateX(-50%)', zIndex: 40}}>
            <div className={`px-10 py-4 rounded-[30px] shadow-2xl flex items-center gap-4 border-2 transition-all duration-500 ${isCorrect2 ? "bg-green-50 border-green-300 scale-105" : "bg-white border-red-200"}`}>
              <span className="text-4xl font-black tracking-[0.2em] text-gray-900 uppercase">{trayWord2}</span>
              {isCorrect2 && <CheckCircle2 className="w-7 h-7 text-green-500 animate-bounce" />}
            </div>
          </div>
        )}

        {/* Round result — centered card over a soft backdrop (both players have
            stopped for this word) so it never collides with the tiles. */}
        {(isCorrect || isCorrect2) && winner === null && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px] animate-in fade-in duration-300">
            <div className={`bg-white rounded-[36px] shadow-2xl border-4 px-10 py-8 text-center max-w-sm mx-6 animate-in zoom-in-95 duration-300 ${isCorrect ? "border-blue-300" : "border-red-300"}`}>
              <div className="flex justify-center mb-4">
                <div className={`p-4 rounded-full ${isCorrect ? "bg-blue-100" : "bg-red-100"}`}>
                  <Star className={`w-12 h-12 fill-current ${isCorrect ? "text-blue-500" : "text-red-500"}`} />
                </div>
              </div>
              <h2 className={`text-3xl font-black mb-1 ${isCorrect ? "text-blue-600" : "text-red-600"}`}>
                {isCorrect ? "Player 1" : "Player 2"} wins the round!
              </h2>
              <div className="inline-flex items-center gap-2 bg-green-500 text-white px-5 py-2 rounded-full font-black mb-7 mt-2">
                +{Math.floor(currentWord.length * 10 * DIFFICULTY_SETTINGS[difficulty].multiplier)} pts
              </div>
              <button
                onClick={nextWord}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-black px-8 py-4 rounded-2xl shadow-xl flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-95 text-lg"
              >
                <span>Next Word</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Match winner screen */}
        {winner !== null && (
          <div className="absolute inset-0 z-[65] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className={`relative rounded-[40px] shadow-2xl px-12 py-10 text-center max-w-md mx-6 border-4 ${winner === 0 ? "bg-gradient-to-br from-blue-500 to-blue-700 border-blue-300" : "bg-gradient-to-br from-red-500 to-rose-700 border-red-300"}`}>
              <div className="flex justify-center mb-4">
                <div className="bg-white/20 p-5 rounded-full">
                  <Crown className="w-14 h-14 text-yellow-300 fill-current" />
                </div>
              </div>
              <p className="text-sm font-black uppercase tracking-[0.3em] text-white/80 mb-1">Winner</p>
              <h2 className="text-5xl font-black text-white mb-4 drop-shadow">
                Player {winner + 1}
              </h2>
              <div className="flex justify-center gap-6 mb-7">
                <div className="text-white">
                  <p className="text-[11px] uppercase font-bold text-white/70">Player 1</p>
                  <p className="text-3xl font-black">{score}</p>
                </div>
                <div className="text-white">
                  <p className="text-[11px] uppercase font-bold text-white/70">Player 2</p>
                  <p className="text-3xl font-black">{score2}</p>
                </div>
              </div>
              <button
                onClick={resetMatch}
                className="bg-white text-gray-800 font-black px-8 py-4 rounded-full shadow-xl flex items-center gap-3 mx-auto transition-all hover:scale-105 active:scale-95"
              >
                <RefreshCcw className="w-5 h-5" />
                <span className="text-lg">Play Again</span>
              </button>
            </div>
          </div>
        )}

        {loading && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 z-50">
            <div className="flex flex-col items-center">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-gray-100 border-t-blue-600 rounded-full animate-spin" />
                <Sparkles className="absolute -top-2 -right-2 text-purple-500 animate-pulse" />
              </div>
              <p className="mt-8 text-xl font-bold text-gray-600 tracking-tight">
                Starting Adventure...
              </p>
            </div>
          </div>
        )}

        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 z-50 px-6">
            <div className="bg-white rounded-3xl shadow-2xl border-2 border-red-200 px-8 py-7 max-w-md text-center">
              <div className="text-5xl mb-3">📷</div>
              <p className="text-xl font-black text-gray-800 mb-2">Camera Unavailable</p>
              <p className="text-sm text-gray-600 mb-5">{cameraError}</p>
              <button
                onClick={() => window.location.reload()}
                className="bg-red-500 hover:bg-red-600 text-white font-bold px-6 py-3 rounded-full shadow-lg transition-all active:scale-95"
              >
                Reload
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};



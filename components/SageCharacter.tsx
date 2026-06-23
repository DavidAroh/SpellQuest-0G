/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SageCharacter — the Spell Sage companion's face.
 *
 * Prefers anime sprite art: if a PNG exists for the current mood at
 * `public/sage/<mood>.png`, it is shown (with a gentle idle bob and a crossfade
 * between moods). If a sprite is missing, it falls back to the built-in
 * hand-drawn anime SVG below — so the companion always has a face, sprites or
 * not. All motion is transform/opacity only, 150–300ms, and disabled under
 * prefers-reduced-motion (per the ui-ux-pro-max motion rules).
 *
 * Sprite art: drop in expressions named idle/happy/thinking/worried/celebrate.
 * Recommended free, AI-use-permitted source — sutemo's visual-novel sprite:
 * https://sutemo.itch.io/female-character (commercial OK, no AI-use restriction).
 */
import React, { useEffect, useState } from "react";

export type SageMood = "idle" | "happy" | "thinking" | "worried" | "celebrate";

const SPRITE_DIR = "/sage";
const MOODS: SageMood[] = ["idle", "happy", "thinking", "worried", "celebrate"];

interface Props {
  mood: SageMood;
  size?: number;
  onPoke?: () => void;
}

const SHARED_STYLE = `
  .sage-char { display:inline-block; transition: transform .18s cubic-bezier(.34,1.56,.64,1); }
  .sage-char:hover { transform: scale(1.06); }
  .sage-char:active { transform: scale(.94); }
  .sage-bob { animation: sageBob 3.2s ease-in-out infinite; transform-origin: 50% 90%; }
  @keyframes sageBob { 0%,100%{ transform: translateY(0) rotate(0deg);} 50%{ transform: translateY(-3px) rotate(-1.5deg);} }
  .sage-eyes { animation: sageBlink 4.6s infinite; transform-origin: 50% 58%; }
  @keyframes sageBlink { 0%,92%,100%{ transform: scaleY(1);} 95%{ transform: scaleY(.12);} }
  .sage-star { animation: sageTwinkle 2.4s ease-in-out infinite; transform-origin: 50px 16px; }
  @keyframes sageTwinkle { 0%,100%{ opacity:.85; transform: scale(1);} 50%{ opacity:1; transform: scale(1.18);} }
  .sage-celebrate .sage-bob { animation: sageHop .5s ease-in-out infinite; }
  @keyframes sageHop { 0%,100%{ transform: translateY(0);} 35%{ transform: translateY(-9px);} 70%{ transform: translateY(-2px);} }
  .sage-worried .sage-bob { animation: sageShake .35s ease-in-out infinite; }
  @keyframes sageShake { 0%,100%{ transform: translateX(0) rotate(0);} 25%{ transform: translateX(-1.5px) rotate(-2deg);} 75%{ transform: translateX(1.5px) rotate(2deg);} }
  .sage-spark { animation: sageSpark 1.1s ease-out infinite; transform-origin: center; }
  @keyframes sageSpark { 0%{ opacity:0; transform: scale(.3) translateY(0);} 30%{ opacity:1;} 100%{ opacity:0; transform: scale(1) translateY(-10px);} }
  .sage-sweat { animation: sageSweat 1.4s ease-in-out infinite; }
  @keyframes sageSweat { 0%,100%{ opacity:.5; transform: translateY(0);} 50%{ opacity:1; transform: translateY(2px);} }
  .sage-think-dots circle { animation: sageDots 1.4s ease-in-out infinite; }
  .sage-think-dots circle:nth-child(2){ animation-delay:.2s; }
  .sage-think-dots circle:nth-child(3){ animation-delay:.4s; }
  @keyframes sageDots { 0%,100%{ opacity:.25; } 50%{ opacity:1; } }
  .sage-sprite { width:100%; height:100%; object-fit:contain; transition: opacity .25s ease; }
  /* sprite "alive" idle: gentle breathing + blink squash */
  .sage-breathe { width:100%; height:100%; animation: sageBreathe 3.6s ease-in-out infinite; transform-origin:50% 100%; }
  @keyframes sageBreathe { 0%,100%{ transform: scale(1);} 50%{ transform: scale(1.02);} }
  .sage-sprite.blink { animation: sageBlinkSquash .17s ease; transform-origin:50% 55%; }
  @keyframes sageBlinkSquash { 0%{transform:scaleY(1);} 50%{transform:scaleY(.9);} 100%{transform:scaleY(1);} }
  /* celebrate sparkles around the sprite */
  .sage-sparkles { position:absolute; inset:0; pointer-events:none; }
  .sage-sparkles i { position:absolute; font-style:normal; color:#ffd27a; font-size:18px;
    filter: drop-shadow(0 0 6px rgba(245,166,35,0.8)); animation: sageFloat 1.3s ease-out infinite; }
  .sage-sparkles i:nth-child(1){ left:6%;  top:30%; animation-delay:0s; }
  .sage-sparkles i:nth-child(2){ right:4%; top:22%; animation-delay:.35s; }
  .sage-sparkles i:nth-child(3){ left:18%; top:8%;  animation-delay:.7s; font-size:14px; }
  @keyframes sageFloat { 0%{ opacity:0; transform: translateY(8px) scale(.4);} 25%{ opacity:1;} 100%{ opacity:0; transform: translateY(-16px) scale(1);} }
  @media (prefers-reduced-motion: reduce) {
    .sage-bob, .sage-eyes, .sage-star, .sage-spark, .sage-sweat, .sage-breathe,
    .sage-sprite.blink, .sage-sparkles i,
    .sage-think-dots circle, .sage-celebrate .sage-bob, .sage-worried .sage-bob {
      animation: none !important;
    }
  }
`;

export const SageCharacter: React.FC<Props> = ({ mood, size = 92, onPoke }) => {
  // Which moods have a usable sprite PNG. Empty = SVG fallback everywhere.
  const [sprites, setSprites] = useState<Partial<Record<SageMood, boolean>>>({});
  const [blink, setBlink] = useState(false);

  // Lifelike random blinking — irregular intervals read as "alive", not robotic.
  useEffect(() => {
    let alive = true;
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => {
        if (!alive) return;
        setBlink(true);
        setTimeout(() => alive && setBlink(false), 160);
        if (Math.random() < 0.3) setTimeout(() => alive && (setBlink(true), setTimeout(() => alive && setBlink(false), 150)), 360); // occasional double-blink
        loop();
      }, 2800 + Math.random() * 3600);
    };
    loop();
    return () => { alive = false; clearTimeout(t); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    MOODS.forEach((m) => {
      const img = new Image();
      img.onload = () => {
        if (!cancelled && img.naturalWidth > 0) setSprites((s) => ({ ...s, [m]: true }));
      };
      img.onerror = () => {
        if (!cancelled) setSprites((s) => ({ ...s, [m]: false }));
      };
      img.src = `${SPRITE_DIR}/${m}.png`;
    });
    return () => { cancelled = true; };
  }, []);

  const Wrapper: any = onPoke ? "button" : "div";
  const useSprite = sprites[mood] === true;

  return (
    <Wrapper
      onClick={onPoke}
      aria-label={onPoke ? "Ask the Spell Sage for a new hint" : "Spell Sage"}
      className={`sage-char sage-${mood}`}
      style={{
        width: size,
        height: size * 1.18,
        padding: 0,
        border: "none",
        background: "transparent",
        cursor: onPoke ? "pointer" : "default",
        pointerEvents: onPoke ? "auto" : "none",
        lineHeight: 0,
      }}
    >
      <style>{SHARED_STYLE}</style>

      {useSprite ? (
        <div className="sage-bob" style={{ width: "100%", height: "100%", position: "relative" }}>
          <div className="sage-breathe">
            <img
              key={mood}
              className={`sage-sprite ${blink ? "blink" : ""}`}
              src={`${SPRITE_DIR}/${mood}.png`}
              alt={`Spell Sage looking ${mood}`}
              draggable={false}
            />
          </div>
          {mood === "celebrate" && (
            <div className="sage-sparkles" aria-hidden="true"><i>✦</i><i>✦</i><i>✦</i></div>
          )}
        </div>
      ) : (
        <SageSvg mood={mood} />
      )}
    </Wrapper>
  );
};

// ── Built-in hand-drawn anime fallback ───────────────────────────────────────
const SageSvg: React.FC<{ mood: SageMood }> = ({ mood }) => (
  <svg viewBox="0 0 100 118" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="sageGlow" cx="50%" cy="45%" r="55%">
        <stop offset="0" stopColor="rgba(245,166,35,0.35)" />
        <stop offset="1" stopColor="rgba(245,166,35,0)" />
      </radialGradient>
    </defs>

    <circle cx="50" cy="64" r="46" fill="url(#sageGlow)" />

    <g className="sage-bob">
      <g>
        <path d="M50 4 C58 22 64 34 70 44 L30 44 C36 34 42 22 50 4 Z" fill="#f5a623" stroke="#d98a12" strokeWidth="1.2" />
        <path d="M50 4 C53 12 55 17 57 21 C54 20 51 19 49 18 C49 13 49 8 50 4 Z" fill="#ffe0a3" opacity=".8" />
        <path className="sage-star" d="M50 11 l2 5 5 .5 -3.8 3.4 1.1 5 -4.3-2.7 -4.3 2.7 1.1-5 -3.8-3.4 5-.5 Z" fill="#fff7e6" />
        <ellipse cx="50" cy="45" rx="26" ry="6.5" fill="#f5a623" stroke="#d98a12" strokeWidth="1.2" />
        <ellipse cx="50" cy="44" rx="20" ry="3.6" fill="#ffe0a3" opacity=".55" />
      </g>

      <path d="M28 52 C30 44 38 41 50 41 C62 41 70 44 72 52 C66 49 58 48 50 48 C42 48 34 49 28 52 Z" fill="#7c5cff" />
      <path d="M34 48 l4 9 4-8 z M58 48 l4 8 4-9 z" fill="#7c5cff" />

      <g>
        <ellipse cx="50" cy="68" rx="23" ry="22" fill="#fde3c9" />
        <ellipse cx="50" cy="68" rx="23" ry="22" fill="none" stroke="#eac4a3" strokeWidth="1" />
        <circle cx="27" cy="70" r="3.4" fill="#fde3c9" />
        <circle cx="73" cy="70" r="3.4" fill="#fde3c9" />

        <ellipse cx="36" cy="75" rx="4.6" ry="3" fill="#ff9aa8" opacity=".55" />
        <ellipse cx="64" cy="75" rx="4.6" ry="3" fill="#ff9aa8" opacity=".55" />

        {mood === "worried" && (
          <g stroke="#9a6a3a" strokeWidth="1.6" strokeLinecap="round">
            <path d="M38 58 l8 2.5" />
            <path d="M62 58 l-8 2.5" />
          </g>
        )}

        <g className="sage-eyes">
          {mood === "celebrate" ? (
            <g fill="#f5a623">
              <path d="M40 67 l1.6 3.4 3.6.4 -2.8 2.4 .8 3.6 -3.2-2 -3.2 2 .8-3.6 -2.8-2.4 3.6-.4 Z" />
              <path d="M60 67 l1.6 3.4 3.6.4 -2.8 2.4 .8 3.6 -3.2-2 -3.2 2 .8-3.6 -2.8-2.4 3.6-.4 Z" />
            </g>
          ) : mood === "happy" ? (
            <g fill="none" stroke="#3a2a1a" strokeWidth="2.6" strokeLinecap="round">
              <path d="M36 70 q5 -6 9 0" />
              <path d="M55 70 q5 -6 9 0" />
            </g>
          ) : (
            <g>
              <ellipse cx="41" cy="69" rx="4.6" ry={mood === "thinking" ? 5.4 : 5.8} fill="#3a2a1a" />
              <ellipse cx="59" cy="69" rx="4.6" ry={mood === "thinking" ? 5.4 : 5.8} fill="#3a2a1a" />
              <circle cx="41" cy={mood === "thinking" ? 67 : 69} r="2.4" fill="#7c5cff" />
              <circle cx="59" cy={mood === "thinking" ? 67 : 69} r="2.4" fill="#7c5cff" />
              <circle cx="39.4" cy={(mood === "thinking" ? 67 : 69) - 1.6} r="1.5" fill="#fff" />
              <circle cx="57.4" cy={(mood === "thinking" ? 67 : 69) - 1.6} r="1.5" fill="#fff" />
            </g>
          )}
        </g>

        {mood === "celebrate" ? (
          <path d="M44 80 q6 7 12 0 q-6 3 -12 0 Z" fill="#b3402f" />
        ) : mood === "happy" ? (
          <path d="M45 80 q5 5 10 0" fill="none" stroke="#b3402f" strokeWidth="2" strokeLinecap="round" />
        ) : mood === "worried" ? (
          <path d="M45 82 q5 -4 10 0" fill="none" stroke="#b3402f" strokeWidth="2" strokeLinecap="round" />
        ) : mood === "thinking" ? (
          <ellipse cx="50" cy="81" rx="2.2" ry="2.6" fill="#b3402f" />
        ) : (
          <path d="M46 81 q4 3 8 0" fill="none" stroke="#b3402f" strokeWidth="2" strokeLinecap="round" />
        )}
      </g>

      {mood === "worried" && (
        <path className="sage-sweat" d="M72 60 c2 3 3 5 0 6 c-3 -1 -2 -3 0 -6 Z" fill="#7fd4ff" />
      )}
      {mood === "celebrate" && (
        <g fill="#ffd27a">
          <path className="sage-spark" d="M22 50 l1.2 2.6 2.6 .3 -2 1.8 .6 2.6 -2.4-1.4 -2.4 1.4 .6-2.6 -2-1.8 2.6-.3 Z" />
          <path className="sage-spark" style={{ animationDelay: ".4s" }} d="M80 52 l1.2 2.6 2.6 .3 -2 1.8 .6 2.6 -2.4-1.4 -2.4 1.4 .6-2.6 -2-1.8 2.6-.3 Z" />
        </g>
      )}
    </g>

    {mood === "thinking" && (
      <g className="sage-think-dots" fill="#f5a623">
        <circle cx="78" cy="30" r="2.2" />
        <circle cx="85" cy="26" r="2.2" />
        <circle cx="92" cy="22" r="2.2" />
      </g>
    )}
  </svg>
);

export default SageCharacter;

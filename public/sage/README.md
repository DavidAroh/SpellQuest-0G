# Spell Sage sprite art

Drop anime expression PNGs here to give the on-screen AI companion a sprite face.
If a file is missing, the companion automatically falls back to the built-in
hand-drawn SVG (`components/SageCharacter.tsx`) — so the game always works.

## Expected files

| File | Shown when |
| --- | --- |
| `idle.png` | Waiting / between actions |
| `happy.png` | New word, on track |
| `thinking.png` | Generating a hint |
| `worried.png` | Time running low |
| `celebrate.png` | Word spelled correctly |

Transparent background, bust-up framing, roughly square-ish (~512×600). The
component handles sizing, the idle bob, mood crossfade, and reduced-motion.

## Recommended source (license-safe for an AI companion)

**sutemo — Female Character Sprite for Visual Novel**
https://sutemo.itch.io/female-character

- Commercial use permitted, credit not required (we credit anyway — see root README).
- No "no-AI" restriction (unlike NoranekoGames' Miki/Aiko, which forbid AI use).
- Ships as layered PSD with 10+ expressions — export 5 of them to the PNGs above.

> Avoid NoranekoGames assets (Miki/Aiko) for this companion: their licenses
> explicitly prohibit use "in or with AI", and this is an AI agent.

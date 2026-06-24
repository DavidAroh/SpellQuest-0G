/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Quick check that 0G Compute is working through the proxy.
 *   1. npm run og:proxy   (in one terminal, with OG_COMPUTE_API_KEY set)
 *   2. npm run og:test    (in another)
 * Prints the model's reply, or a clear error to fix.
 */
const PORT = process.env.OG_PROXY_PORT || 8787;
const MODEL = process.argv[2] || "qwen2.5-omni";

const res = await fetch(`http://localhost:${PORT}/chat/completions`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: MODEL,
    messages: [
      { role: "system", content: "You are Spell Sage, a witty spelling coach. One short line." },
      { role: "user", content: "The word is KOALA and I just placed K, O. Nudge me." },
    ],
    max_tokens: 40,
    temperature: 0.8,
  }),
}).catch((e) => {
  console.error("✗ Could not reach the proxy on port", PORT, "— is `npm run og:proxy` running?", e.message);
  process.exit(1);
});

const data = await res.json();
if (!res.ok) {
  console.error(`✗ ${res.status}:`, JSON.stringify(data));
  process.exit(1);
}
const line = data?.choices?.[0]?.message?.content?.trim();
console.log("✓ 0G Compute reply:", line || JSON.stringify(data).slice(0, 300));

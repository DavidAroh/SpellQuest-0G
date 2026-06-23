/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * 0G Compute proxy — gives the Spell Sage agent a real model brain on 0G.
 *
 * The browser can't call the 0G Compute Router directly: it would (a) leak the
 * API key into the public bundle and (b) hit CORS. This tiny zero-dependency
 * Node server holds the key server-side, adds CORS, and forwards OpenAI-style
 * /chat/completions calls to the 0G Compute Router.
 *
 * Setup:
 *   1. Get a key + deposit 0G at https://pc.testnet.0g.ai
 *   2. In .env.local:  OG_COMPUTE_API_KEY=sk-...        (kept server-side)
 *   3. node server/og-proxy.mjs        (or: npm run og:proxy)
 *   4. In .env.local:  VITE_OG_COMPUTE_ENDPOINT=http://localhost:8787
 *      VITE_OG_COMPUTE_MODEL=llama-3.3-70b-instruct   (pick from the catalog)
 *   5. Restart `npm run dev`. The Sage badge turns green ("0G Compute").
 */
import http from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function fromEnvFile(key) {
  if (process.env[key]) return process.env[key].trim();
  for (const f of [".env.local", ".env"]) {
    try {
      const m = readFileSync(join(__dirname, "..", f), "utf8").match(new RegExp(`^${key}=(.+)$`, "m"));
      if (m) return m[1].trim();
    } catch {}
  }
  return "";
}

const PORT = Number(fromEnvFile("OG_PROXY_PORT") || 8787);
const API_KEY = fromEnvFile("OG_COMPUTE_API_KEY");
const ROUTER_BASE = (fromEnvFile("OG_COMPUTE_BASE_URL") || "https://router-api-testnet.integratenetwork.work/v1").replace(/\/$/, "");

if (!API_KEY) {
  console.error("✗ OG_COMPUTE_API_KEY missing. Get one at https://pc.testnet.0g.ai and add it to .env.local.");
  process.exit(1);
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }
  if (req.method !== "POST") {
    res.writeHead(405, CORS);
    return res.end("Method Not Allowed");
  }

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    try {
      const upstream = await fetch(`${ROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body,
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, { ...CORS, "Content-Type": "application/json" });
      res.end(text);
    } catch (e) {
      res.writeHead(502, { ...CORS, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: `0G Compute proxy error: ${e?.message || e}` } }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`✓ 0G Compute proxy → ${ROUTER_BASE}`);
  console.log(`  Listening on http://localhost:${PORT}  (POST /chat/completions)`);
  console.log(`  Point the app at it:  VITE_OG_COMPUTE_ENDPOINT=http://localhost:${PORT}`);
});

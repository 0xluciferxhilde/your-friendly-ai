// --- MATH SLASH BOT FILTER + DAILY LIMIT 5 ---
// Apply to whichever server.js powers https://game.test-hub.xyz
// (the litdex-game pm2 process on the Hetzner server). This patches:
//
//   1. DAILY_LIMIT 15 → 5   (search "DAILY_LIMIT" or "gamesLeft" in your
//      /simple/start handler and lower the cap).
//
//   2. /simple/end accepts a `proof` payload from the new frontend with
//      behavioural signals. Replace 0-score on bot-likely sessions and
//      throttle wallets that repeatedly send bot-flagged proofs.
//
// Drop this AFTER your existing /simple/end handler has been split out
// (or just put the validateProof helper near the top and call it inside
// your handler before paying out).

// ── Helpers ──────────────────────────────────────────────────────────
const _walletStrikes = new Map();   // wallet -> { strikes, blockedUntil }
const _ipStrikes     = new Map();   // ip     -> { strikes, blockedUntil }
const STRIKE_BLOCK_MS = 24 * 60 * 60 * 1000; // 24h soft-ban after 3 strikes

function nowMs() { return Date.now(); }

function getStrike(map, key) {
  return map.get(key) || { strikes: 0, blockedUntil: 0 };
}

function bumpStrike(map, key) {
  const cur = getStrike(map, key);
  cur.strikes += 1;
  if (cur.strikes >= 3) cur.blockedUntil = nowMs() + STRIKE_BLOCK_MS;
  map.set(key, cur);
  return cur;
}

function isBlocked(map, key) {
  const cur = getStrike(map, key);
  return cur.blockedUntil > nowMs();
}

/**
 * validateProof — quick humanity score from the client digest.
 * Returns { ok, reason, suspicion } where suspicion 0..100.
 * suspicion >= 60 → 0 zkLTC payout (still records the game, no reward)
 * suspicion >= 80 → strike + reject submission entirely
 */
function validateProof(proof, score, sessionStartMs) {
  if (!proof || typeof proof !== "object") {
    return { ok: false, reason: "missing_proof", suspicion: 100 };
  }
  let s = 0;
  const f = proof.flags || {};
  if (f.noMouseMove)     s += 35;
  if (f.zeroJitter)      s += 20;
  if (f.impossiblyFast)  s += 40;
  if (f.idleSession)     s += 25;

  // Sanity: questionsAnswered should be >= score in this game (1pt/q).
  if (Number(proof.questionsAnswered) < Number(score) - 5) s += 25;

  // Score per second sanity — a real human caps around ~1.5 q/sec.
  const sessionSec = Math.max(1, Math.floor((proof.sessionMs || 0) / 1000));
  const qps = (Number(proof.questionsAnswered) || 0) / sessionSec;
  if (qps > 3.0) s += 30;
  if (qps > 5.0) s += 30;

  // Pointer jitter is cheap to fake — only a soft signal.
  if ((proof.pointerJitter || 0) < 200 && sessionSec > 10) s += 10;

  s = Math.min(100, s);
  if (s >= 80) return { ok: false, reason: "bot_signals", suspicion: s };
  return { ok: true, suspicion: s };
}

// ── Patch your existing /simple/end handler like this ─────────────────
// Replace the body of the handler with the snippet below (keep your
// existing daily-limit / streak / db-write code; this just gates the
// payout on validation).
//
// app.post("/simple/end", async (req, res) => {
//   const { wallet, score, proof } = req.body || {};
//   if (!wallet) return res.status(400).json({ success: false, error: "wallet required" });
//   const ip = req.headers["x-forwarded-for"] || req.connection?.remoteAddress || "unknown";
//
//   if (isBlocked(_walletStrikes, wallet) || isBlocked(_ipStrikes, ip)) {
//     return res.status(429).json({ success: false, error: "Soft-banned for bot activity. Try again tomorrow." });
//   }
//
//   const v = validateProof(proof, score);
//   let effectiveScore = Number(score) || 0;
//   if (!v.ok) {
//     bumpStrike(_walletStrikes, wallet);
//     bumpStrike(_ipStrikes, ip);
//     return res.json({ success: false, error: "Score rejected", reason: v.reason });
//   }
//   if (v.suspicion >= 60) {
//     bumpStrike(_walletStrikes, wallet);
//     effectiveScore = 0; // record game but pay nothing
//   }
//
//   /* …existing daily-limit cap (lower DAILY_LIMIT to 5) … */
//   /* …existing zkLTC payout using effectiveScore in place of score… */
// });

module.exports = { validateProof, bumpStrike, isBlocked, _walletStrikes, _ipStrikes };

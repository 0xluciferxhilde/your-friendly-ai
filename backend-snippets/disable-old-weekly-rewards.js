#!/usr/bin/env node
/* eslint-disable no-console */
//
// disable-old-weekly-rewards.js
//
// The game-server/server.js has THREE legacy weekly reward paths that send
// zkLTC/points straight from 0x3bc:
//
//   A) cron.schedule('30 18 * * 0', distributeWeeklyRewards)  (line ~1127)
//      → Math Slash ms_weekly_leaderboard top-20 zkLTC+points
//   B) cron.schedule('30 18 * * 6', ...)                       (line ~659)
//      → per-game "GF" credits (DB only, no transfer) + a
//        "Deploy/checkin/quest top-10 → zkLTC" loop that DOES send zkLTC
//   C) cron.schedule('20 18 * * 0', ...)                       (line ~1121)
//      → snapshot only (no transfer) — left as-is.
//
// We now distribute ALL game rewards (including Math Slash) from a
// dedicated wallet via weekly-rewards-payout.js. So this patch NEUTRALISES
// the on-chain payout paths in server.js while keeping everything else
// (leaderboard tracking, GF credits, snapshots) intact:
//
//   1. Comment out the body of the Sunday distributeWeeklyRewards cron
//      callback so it logs + no-ops instead of sending.
//   2. Comment out the "Deploy/checkin/quest top-10 → zkLTC" sender loop
//      inside the Saturday cron (keeps the GF-credit part).
//
// SAFETY: writes server.js.bak-oldrewards before changing anything, and
// only edits if the exact anchors are found. Re-running is a no-op.
//
// Usage on /root/litvm-dex/game-server:
//   wget -qO /tmp/disable-old-weekly-rewards.js https://raw.githubusercontent.com/0xDarkSeidBull/litdex/<sha>/backend-snippets/disable-old-weekly-rewards.js
//   node /tmp/disable-old-weekly-rewards.js
//   node -c server.js && echo OK
//   pm2 restart litdex-game

const fs = require('fs');
const path = require('path');

const SERVER = path.join(process.cwd(), 'server.js');
if (!fs.existsSync(SERVER)) { console.error('server.js not found in', process.cwd()); process.exit(1); }

let s = fs.readFileSync(SERVER, 'utf8');
const before = s;
const MARK = '/* OLD_WEEKLY_DISABLED */';

if (s.includes(MARK)) {
  console.log('[ok] already disabled — nothing to do');
  process.exit(0);
}

// ── A) Neutralise the Sunday distributeWeeklyRewards cron ──────────────
// Replace the call inside cron.schedule('30 18 * * 0', ...) with a no-op log.
const sundayRe = /cron\.schedule\(\s*['"]30 18 \* \* 0['"]\s*,\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*\)\s*;/;
if (sundayRe.test(s)) {
  s = s.replace(sundayRe,
`cron.schedule('30 18 * * 0', async () => {
  ${MARK}
  // Legacy Math Slash weekly payout DISABLED — rewards now distributed by
  // weekly-rewards-payout.js from the dedicated rewards wallet.
  console.log('[Weekly] legacy Math Slash cron disabled (handled by weekly-rewards-payout.js)');
});`);
  console.log('[done] (A) Sunday distributeWeeklyRewards cron neutralised');
} else {
  console.log('[warn] (A) Sunday cron anchor not found — skipped');
}

// ── B) Neutralise the "Deploy/checkin/quest top-10 → zkLTC" sender ─────
// This block lives inside the Saturday cron. We comment out just the
// sender loop, keyed on the DEPLOY_REWARDS_ZKLTC array + its for-loop.
const deployRe = /const DEPLOY_REWARDS_ZKLTC = \[[\s\S]*?\];\s*\n\s*const topDeploy = db\.prepare\([\s\S]*?\)\.all\(\);\s*\n\s*for \(let i = 0; i < topDeploy\.length; i\+\+\) \{[\s\S]*?\n\s*\}/;
if (deployRe.test(s)) {
  s = s.replace(deployRe, (m) =>
`${MARK}
  // Legacy deploy/checkin/quest top-10 zkLTC payout DISABLED.
  /* ${m.replace(/\*\//g, '*\\/')} */`);
  console.log('[done] (B) Deploy/checkin/quest top-10 zkLTC sender disabled');
} else {
  console.log('[warn] (B) Deploy-top-10 anchor not found — skipped (may already differ)');
}

if (s === before) {
  console.log('\nNo changes applied.');
  process.exit(0);
}

fs.writeFileSync(SERVER + '.bak-oldrewards', before);
fs.writeFileSync(SERVER, s);
console.log(`\nPatched. Backup at server.js.bak-oldrewards`);
console.log('Verify:  node -c server.js && echo OK');
console.log('Then:    pm2 restart litdex-game');

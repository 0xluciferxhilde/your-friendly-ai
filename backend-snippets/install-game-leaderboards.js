#!/usr/bin/env node
//
// install-game-leaderboards.js
//
// Adds GET /leaderboard endpoints to the 6 casino games and Pump-or-Dump.
// Idempotent — safe to re-run. Rewrites:
//   /root/litvm-dex/game-server/litdice.js
//   /root/litvm-dex/game-server/litlimbo.js
//   /root/litvm-dex/game-server/litmines.js
//   /root/litvm-dex/game-server/litplinko.js
//   /root/litvm-dex/game-server/litwheel.js
//   /root/litvm-dex/game-server/litcoinflip.js
//   /root/litvm-dex/game-server/pumpdump.js
//
// Each leaderboard query is shaped per game's existing schema. Frontend
// (App.tsx GameLeaderboard) reads { leaderboard: [{ wallet, <field> }] }.
//
// Usage on prod box:
//   cd /root/litvm-dex/game-server
//   wget -qO /tmp/install-game-leaderboards.js https://raw.githubusercontent.com/0xDarkSeidBull/litdex/feat/casino-three/backend-snippets/install-game-leaderboards.js
//   node /tmp/install-game-leaderboards.js
//   pm2 restart litdex-game

const fs = require('fs');
const path = require('path');

const SERVER_DIR = process.cwd().endsWith('game-server')
  ? process.cwd()
  : '/root/litvm-dex/game-server';

const PATCHES = [
  {
    file: 'litdice.js',
    marker: "router.get('/leaderboard'",
    code: `
router.get('/leaderboard', (req, res) => {
  try {
    const rows = db.prepare(\`
      SELECT wallet, MAX(multiplier_x100) AS best_mult_x100
      FROM litdice_rounds
      WHERE settled = 1 AND won = 1
      GROUP BY wallet
      ORDER BY best_mult_x100 DESC
      LIMIT 25
    \`).all();
    res.json({
      leaderboard: rows.map((r) => ({
        wallet: r.wallet,
        best_multiplier: (r.best_mult_x100 || 0) / 100,
      })),
    });
  } catch (e) {
    console.error('[/litdice/leaderboard]', e.message);
    res.status(500).json({ error: 'leaderboard_failed' });
  }
});
`,
  },
  {
    file: 'litlimbo.js',
    marker: "router.get('/leaderboard'",
    code: `
router.get('/leaderboard', (req, res) => {
  try {
    const rows = db.prepare(\`
      SELECT wallet, MAX(rolled_x100) AS best_roll_x100
      FROM litlimbo_rounds
      WHERE settled = 1 AND won = 1
      GROUP BY wallet
      ORDER BY best_roll_x100 DESC
      LIMIT 25
    \`).all();
    res.json({
      leaderboard: rows.map((r) => ({
        wallet: r.wallet,
        best_roll: (r.best_roll_x100 || 0) / 100,
      })),
    });
  } catch (e) {
    console.error('[/litlimbo/leaderboard]', e.message);
    res.status(500).json({ error: 'leaderboard_failed' });
  }
});
`,
  },
  {
    file: 'litmines.js',
    marker: "router.get('/leaderboard'",
    code: `
router.get('/leaderboard', (req, res) => {
  try {
    const rows = db.prepare(\`
      SELECT wallet, MAX(multiplier_x100) AS best_mult_x100
      FROM litmines_rounds
      WHERE settled = 1 AND outcome = 'cashout'
      GROUP BY wallet
      ORDER BY best_mult_x100 DESC
      LIMIT 25
    \`).all();
    res.json({
      leaderboard: rows.map((r) => ({
        wallet: r.wallet,
        best_multiplier: (r.best_mult_x100 || 0) / 100,
      })),
    });
  } catch (e) {
    console.error('[/litmines/leaderboard]', e.message);
    res.status(500).json({ error: 'leaderboard_failed' });
  }
});
`,
  },
  {
    file: 'litplinko.js',
    marker: "router.get('/leaderboard'",
    code: `
router.get('/leaderboard', (req, res) => {
  try {
    const rows = db.prepare(\`
      SELECT wallet, MAX(multiplier_x100) AS best_mult_x100
      FROM litplinko_rounds
      WHERE settled = 1
      GROUP BY wallet
      ORDER BY best_mult_x100 DESC
      LIMIT 25
    \`).all();
    res.json({
      leaderboard: rows.map((r) => ({
        wallet: r.wallet,
        best_multiplier: (r.best_mult_x100 || 0) / 100,
      })),
    });
  } catch (e) {
    console.error('[/litplinko/leaderboard]', e.message);
    res.status(500).json({ error: 'leaderboard_failed' });
  }
});
`,
  },
  {
    file: 'litwheel.js',
    marker: "router.get('/leaderboard'",
    code: `
router.get('/leaderboard', (req, res) => {
  try {
    const rows = db.prepare(\`
      SELECT wallet, MAX(multiplier_x100) AS best_mult_x100
      FROM litwheel_rounds
      WHERE settled = 1
      GROUP BY wallet
      ORDER BY best_mult_x100 DESC
      LIMIT 25
    \`).all();
    res.json({
      leaderboard: rows.map((r) => ({
        wallet: r.wallet,
        best_multiplier: (r.best_mult_x100 || 0) / 100,
      })),
    });
  } catch (e) {
    console.error('[/litwheel/leaderboard]', e.message);
    res.status(500).json({ error: 'leaderboard_failed' });
  }
});
`,
  },
  {
    file: 'litcoinflip.js',
    marker: "router.get('/leaderboard'",
    code: `
router.get('/leaderboard', (req, res) => {
  try {
    const rows = db.prepare(\`
      SELECT wallet, MAX(streak) AS best_streak
      FROM litcoinflip_rounds
      WHERE settled = 1 AND won = 1
      GROUP BY wallet
      ORDER BY best_streak DESC
      LIMIT 25
    \`).all();
    res.json({ leaderboard: rows });
  } catch (e) {
    console.error('[/litcoinflip/leaderboard]', e.message);
    res.status(500).json({ error: 'leaderboard_failed' });
  }
});
`,
  },
  {
    file: 'pumpdump.js',
    marker: "router.get('/leaderboard'",
    code: `
router.get('/leaderboard', (req, res) => {
  try {
    const rows = db.prepare(\`
      SELECT wallet, MAX(pot) AS best_pot, MAX(streak) AS best_streak
      FROM pumpdump_sessions
      WHERE settled = 1
      GROUP BY wallet
      ORDER BY best_pot DESC
      LIMIT 25
    \`).all();
    res.json({ leaderboard: rows });
  } catch (e) {
    console.error('[/pumpdump/leaderboard]', e.message);
    res.status(500).json({ error: 'leaderboard_failed' });
  }
});
`,
  },
];

let touched = 0, skipped = 0, missing = 0;
for (const p of PATCHES) {
  const fp = path.join(SERVER_DIR, p.file);
  if (!fs.existsSync(fp)) {
    console.log(`[skip] ${p.file} — file missing in ${SERVER_DIR}`);
    missing++;
    continue;
  }
  const src = fs.readFileSync(fp, 'utf8');
  // If a leaderboard route already exists, strip it out so we can
  // re-install the latest version. This keeps the installer
  // idempotent AND lets us push schema fixes (e.g. column renames).
  let working = src;
  const existingRe = /\nrouter\.get\('\/leaderboard'[\s\S]*?\}\);\s*\n/;
  if (existingRe.test(working)) {
    console.log(`[update] ${p.file} — replacing existing leaderboard endpoint`);
    working = working.replace(existingRe, '\n');
  }
  // Insert before the final module.exports = router; line.
  const out = working.replace(
    /module\.exports\s*=\s*router\s*;?\s*$/,
    `${p.code}\nmodule.exports = router;\n`,
  );
  if (out === working) {
    console.log(`[fail] ${p.file} — could not find module.exports anchor`);
    missing++;
    continue;
  }
  if (out === src) {
    console.log(`[ok]   ${p.file} — already up to date`);
    skipped++;
    continue;
  }
  fs.writeFileSync(fp, out, 'utf8');
  console.log(`[done] ${p.file} — leaderboard endpoint installed`);
  touched++;
}

console.log(`\n${touched} patched, ${skipped} already present, ${missing} skipped.`);
console.log('Restart the server to pick up changes:  pm2 restart litdex-game');

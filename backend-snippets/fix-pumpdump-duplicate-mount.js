// Emergency cleanup: another agent's curl loop spammed
// /root/litvm-dex/game-server/server.js with 50+ duplicate
// `const pumpdump = require('./pumpdump');`
// `app.use('/pumpdump', pumpdump);` lines, crashing the process with
// "Identifier 'pumpdump' has already been declared".
//
// This script reads server.js, removes ALL duplicate pumpdump require
// + mount lines, then re-inserts exactly one of each in the right
// place: the require near the other route requires, the mount near
// the existing /simple mount.
//
// Server usage:
//   wget -O /tmp/fix-pumpdump.js \
//     "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/fix/pumpdump-duplicate-mount/backend-snippets/fix-pumpdump-duplicate-mount.js"
//   node /tmp/fix-pumpdump.js
//   pm2 restart litdex-game
//
// Backup written to /root/litvm-dex/game-server/server.js.bak-pdfix.

const fs = require('fs');
const SRC = '/root/litvm-dex/game-server/server.js';

let s = fs.readFileSync(SRC, 'utf8');
const before = s;

// 1) Remove every standalone `const pumpdump = require('./pumpdump');` line.
s = s.replace(/^[ \t]*const\s+pumpdump\s*=\s*require\(\s*['"]\.\/pumpdump['"]\s*\)\s*;\s*\r?\n/gm, '');

// 2) Remove every standalone `app.use('/pumpdump', pumpdump);` line.
s = s.replace(/^[ \t]*app\.use\(\s*['"]\/pumpdump['"]\s*,\s*pumpdump\s*\)\s*;\s*\r?\n/gm, '');

// Sanity: count what we just removed
const removedRequires = (before.match(/const\s+pumpdump\s*=\s*require\(\s*['"]\.\/pumpdump['"]\s*\)\s*;/g) || []).length;
const removedMounts = (before.match(/app\.use\(\s*['"]\/pumpdump['"]\s*,\s*pumpdump\s*\)\s*;/g) || []).length;
console.log('[fix-pumpdump] removed ' + removedRequires + ' require lines, ' + removedMounts + ' mount lines');

// 3) Re-insert exactly one require + one mount in the proper place.
//    Anchor: the existing mathslash mount.
const simpleAnchor = /(const\s+simpleGame\s*=\s*require\(\s*['"]\.\/mathslash_simple['"]\s*\)\s*;\s*\n[ \t]*app\.use\(\s*['"]\/simple['"]\s*,\s*simpleGame\s*\)\s*;\s*\n)/;

if (!simpleAnchor.test(s)) {
  console.error('[fix-pumpdump] could not find mathslash mount anchor in server.js');
  console.error('  add the two lines manually:');
  console.error('    const pumpdump = require(\'./pumpdump\');');
  console.error('    app.use(\'/pumpdump\', pumpdump);');
  process.exit(1);
}

const block = `const pumpdump = require('./pumpdump');\napp.use('/pumpdump', pumpdump);\n`;

// Only inject if the file doesn't already have a single clean copy.
if (!/^[ \t]*const\s+pumpdump\s*=\s*require\(\s*['"]\.\/pumpdump['"]\s*\)\s*;/m.test(s)) {
  s = s.replace(simpleAnchor, '$1' + block);
  console.log('[fix-pumpdump] re-inserted single pumpdump require + mount');
}

if (s === before) {
  console.error('[fix-pumpdump] no change made');
  process.exit(1);
}

fs.writeFileSync(SRC + '.bak-pdfix', before);
fs.writeFileSync(SRC, s);
console.log('[fix-pumpdump] cleaned; backup at ' + SRC + '.bak-pdfix');
console.log('[fix-pumpdump] file size: ' + before.length + ' -> ' + s.length + ' bytes');

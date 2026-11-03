// Novonode startup file: startup.cjs
// Place alongside package.json and index.js.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
process.chdir(__dirname);

function sufficient(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version || '');
  if (!match) return false;
  const actual = match.slice(1).map(Number);
  const minimum = [16, 4, 2];
  for (let i = 0; i < 3; i++) {
    if (actual[i] !== minimum[i]) return actual[i] > minimum[i];
  }
  return true;
}

function run(command, args) {
  console.log(`[startup] Running ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd: __dirname, stdio: 'inherit', env: process.env });
  if (result.error) {
    console.error(`[startup] ${result.error.message}`);
    process.exit(1);
  }
  if (result.signal || result.status !== 0) {
    console.error(`[startup] Command failed (${result.signal || result.status}). Startup stopped.`);
    process.exit(result.status || 1);
  }
}

try {
  if (!fs.existsSync(path.join(__dirname, 'index.js'))) {
    throw new Error('Place startup.cjs beside the existing index.js and package.json.');
  }
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  let installed;
  try { installed = require('next/package.json').version; } catch {}
  const declared = pkg.dependencies?.next || pkg.devDependencies?.next;
  if (!sufficient(declared) || !sufficient(installed)) {
    console.log('[startup] Installing and saving Next.js 16.4.2.');
    run('yarn', ['add', 'next@16.4.2', '-W', '--exact']);
  } else {
    console.log(`[startup] Next.js ${installed} meets the configured minimum.`);
  }
  run('yarn', ['build']);
  console.log('[startup] Launching index.js.');
  // Keep the existing host entrypoint and its process management in this process.
  require(path.join(__dirname, 'index.js'));
} catch (error) {
  console.error(`[startup] ${error.stack || error.message}`);
  process.exitCode = 1;
}

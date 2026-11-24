'use strict';
const { spawn } = require('node:child_process');
const mode = process.argv[2] || 'start';
const nextBin = require.resolve('next/dist/bin/next');
const args = mode === 'start'
  ? [nextBin, 'start', '-H', '0.0.0.0', '-p', process.env.PORT || '3000']
  : [nextBin, mode, ...process.argv.slice(3)];
const child = spawn(process.execPath, args, {
  stdio: ['ignore', 'inherit', 'inherit'],
  env: { ...process.env, CI: 'true', NEXT_TELEMETRY_DISABLED: '1' },
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

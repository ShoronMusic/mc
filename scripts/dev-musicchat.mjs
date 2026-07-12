#!/usr/bin/env node
/**
 * Music Chat（mc）ローカル dev — ポート 3003 · NEXT_PUBLIC_PRODUCT=musicchat
 * ma は npm run dev（3002）のまま。
 */
import { spawn } from 'node:child_process';

// eslint-disable-next-line no-console
console.log('\n[dev:chat] Music Chat（mc）');
// eslint-disable-next-line no-console
console.log('  URL:  http://localhost:3003');
// eslint-disable-next-line no-console
console.log('  ma:   http://localhost:3002 （別ターミナルで npm run dev）\n');

const child = spawn('npx', ['next', 'dev', '-p', '3003'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    NEXT_PUBLIC_PRODUCT: 'musicchat',
  },
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});

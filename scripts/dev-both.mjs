#!/usr/bin/env node
/**
 * ma（3002）+ mc（3003）を 1 ターミナルで同時起動。
 * 停止: Ctrl+C（両方終了）
 */
import { spawn } from 'node:child_process';

// eslint-disable-next-line no-console
console.log('\n[dev:both] ma + mc 同時起動');
// eslint-disable-next-line no-console
console.log('  ma (Music AI Chat): http://localhost:3002');
// eslint-disable-next-line no-console
console.log('  mc (Music Chat):     http://localhost:3003');
// eslint-disable-next-line no-console
console.log('  停止: Ctrl+C\n');

const children = [];

function spawnDev(label, args, extraEnv = {}) {
  const child = spawn('npx', args, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...extraEnv },
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      for (const c of children) {
        if (c !== child && !c.killed) c.kill();
      }
      process.exit(0);
    }
    if (code && code !== 0) {
      // eslint-disable-next-line no-console
      console.error(`[dev:both] ${label} exited with code ${code}`);
      for (const c of children) {
        if (c !== child && !c.killed) c.kill();
      }
      process.exit(code ?? 1);
    }
  });
  children.push(child);
  return child;
}

spawnDev('ma', ['next', 'dev', '-p', '3002'], { NEXT_PUBLIC_PRODUCT: 'musicaichat' });
spawnDev('mc', ['next', 'dev', '-p', '3003'], { NEXT_PUBLIC_PRODUCT: 'musicchat' });

process.on('SIGINT', () => {
  for (const c of children) {
    if (!c.killed) c.kill('SIGINT');
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  for (const c of children) {
    if (!c.killed) c.kill('SIGTERM');
  }
  process.exit(0);
});

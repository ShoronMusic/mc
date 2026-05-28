#!/usr/bin/env node
/**
 * LAN 向け dev サーバー起動。
 * - バインドは 0.0.0.0（スマホから到達可能）
 * - PC では http://localhost:3002 を開く（0.0.0.0 URL は CSS が壊れることがある）
 */
import { spawn } from 'node:child_process';
import os from 'node:os';

function pickLanIpv4() {
  const nets = os.networkInterfaces();
  for (const ifaces of Object.values(nets)) {
    if (!ifaces) continue;
    for (const net of ifaces) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

const lan = pickLanIpv4();
// eslint-disable-next-line no-console
console.log('\n[dev:lan] 接続 URL');
// eslint-disable-next-line no-console
console.log('  PC ブラウザ:  http://localhost:3002');
if (lan) {
  // eslint-disable-next-line no-console
  console.log(`  スマホ等:     http://${lan}:3002`);
} else {
  // eslint-disable-next-line no-console
  console.log('  スマホ等:     ipconfig で IPv4 を確認し http://<IP>:3002');
}
// eslint-disable-next-line no-console
console.log('  ※ http://0.0.0.0:3002 は開かないでください（スタイルが当たらないことがあります）\n');

const child = spawn('npx', ['next', 'dev', '-p', '3002', '-H', '0.0.0.0'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 0));

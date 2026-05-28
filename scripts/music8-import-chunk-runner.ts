/**
 * music8-split-import-keys が出力した chunk-*.txt を順に import-music8-songs-bulk に渡す。
 * 状態ファイルで完了チャンクを記録し、途中停止しても再実行で続きから再開できる（夜間12時間超向け）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

type StateFile = {
  version: 1;
  chunksDir: string;
  completedBasenames: string[];
  runs: { chunk: string; finishedAt: string; exitCode: number }[];
};

function readForwardArgsFile(absPath: string): string[] {
  let raw = fs.readFileSync(absPath, 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    out.push(t);
  }
  return out;
}

function parseArgs(argv: string[]): {
  help: boolean;
  chunksDir: string;
  stateFile: string;
  bulkScript: string;
  dryRun: boolean;
  pauseBetweenChunkMs: number;
  forwardFile: string | null;
  forward: string[];
} {
  let help = false;
  let chunksDir = path.join('tmp', 'music8-import-chunks');
  let stateFile = path.join('tmp', 'music8-import-chunk-runner-state.json');
  let bulkScript = path.join('scripts', 'import-music8-songs-bulk.ts');
  let dryRun = false;
  let pauseBetweenChunkMs = 0;
  let forwardFile: string | null = null;
  const dash = argv.indexOf('--');
  const own = dash >= 0 ? argv.slice(0, dash) : argv;
  const forwardAfterDash = dash >= 0 ? argv.slice(dash + 1) : [];

  for (const token of own) {
    if (token === '--help' || token === '-h') {
      help = true;
      continue;
    }
    if (token === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (token.startsWith('--chunks-dir=')) {
      chunksDir = token.slice('--chunks-dir='.length).trim() || chunksDir;
      continue;
    }
    if (token.startsWith('--state-file=')) {
      stateFile = token.slice('--state-file='.length).trim() || stateFile;
      continue;
    }
    if (token.startsWith('--bulk-script=')) {
      bulkScript = token.slice('--bulk-script='.length).trim() || bulkScript;
      continue;
    }
    if (token.startsWith('--pause-between-chunk-ms=')) {
      const n = Number.parseInt(token.slice('--pause-between-chunk-ms='.length).trim(), 10);
      if (Number.isFinite(n) && n >= 0) pauseBetweenChunkMs = n;
      continue;
    }
    if (token.startsWith('--forward-file=')) {
      forwardFile = token.slice('--forward-file='.length).trim() || null;
      continue;
    }
  }

  if (!forwardFile) {
    const fromEnv = process.env.MUSIC8_CHUNK_RUNNER_FORWARD_FILE?.trim();
    if (fromEnv) {
      forwardFile = fromEnv;
    }
  }

  let fromFile: string[] = [];
  if (forwardFile) {
    const abs = path.resolve(process.cwd(), forwardFile);
    if (!fs.existsSync(abs)) {
      throw new Error(`--forward-file が見つかりません: ${abs}`);
    }
    fromFile = readForwardArgsFile(abs);
  }

  const forward = [...fromFile, ...forwardAfterDash];

  return { help, chunksDir, stateFile, bulkScript, dryRun, pauseBetweenChunkMs, forwardFile, forward };
}

function printUsage(): void {
  console.log(`Usage:
  npx tsx scripts/music8-import-chunk-runner.ts --chunks-dir=tmp/music8-import-chunks --state-file=tmp/runner-state.json -- \\
    --artist-songs-base=... --songs-base=... --songs-local-dir=E:\\\\m8\\\\public\\\\data\\\\songs --sleep-ms=80 --failure-log=tmp/fail.jsonl

Options（このスクリプト用）:
  --chunks-dir=tmp/music8-import-chunks   chunk-00001.txt を置いたディレクトリ
  --state-file=tmp/music8-import-chunk-runner-state.json   完了チャンク記録（再開用）
  --bulk-script=scripts/import-music8-songs-bulk.ts
  --forward-file=tmp/music8-bulk-forward-args.txt   1行1引数（# 行と空行は無視）。PowerShell で npx が「--」以降を食うとき用
  環境変数 MUSIC8_CHUNK_RUNNER_FORWARD_FILE に forward ファイルの絶対パス（PowerShell から --forward-file= が欠けるときの回避）
  --pause-between-chunk-ms=0   チャンク間の追加待ち（ミリ秒）
  --dry-run                    子プロセスは起動せず、実行予定だけ表示
  --help

「--」以降も import-music8-songs-bulk に渡る（--forward-file の行の後に続く）。--import-keys-file は付けないでください。`);
}

function listChunkFiles(dirAbs: string): string[] {
  if (!fs.existsSync(dirAbs)) return [];
  const names = fs.readdirSync(dirAbs);
  return names
    .filter((n) => /^chunk-\d+\.txt$/i.test(n))
    .sort((a, b) => {
      const na = Number.parseInt(a.replace(/^chunk-/i, '').replace(/\.txt$/i, ''), 10);
      const nb = Number.parseInt(b.replace(/^chunk-/i, '').replace(/\.txt$/i, ''), 10);
      return na - nb;
    });
}

function loadState(stateAbs: string, chunksDirAbs: string): StateFile {
  if (!fs.existsSync(stateAbs)) {
    return { version: 1, chunksDir: chunksDirAbs, completedBasenames: [], runs: [] };
  }
  try {
    const raw = fs.readFileSync(stateAbs, 'utf8');
    const j = JSON.parse(raw) as StateFile;
    if (j.version !== 1 || !Array.isArray(j.completedBasenames)) {
      throw new Error('bad shape');
    }
    if (j.chunksDir !== chunksDirAbs) {
      console.warn(
        `[chunk-runner] 警告: state の chunksDir が現在と異なります。state=${j.chunksDir} 現在=${chunksDirAbs}（completed はそのまま使います）`,
      );
    }
    return {
      version: 1,
      chunksDir: chunksDirAbs,
      completedBasenames: j.completedBasenames,
      runs: Array.isArray(j.runs) ? j.runs : [],
    };
  } catch {
    console.warn(`[chunk-runner] 状態ファイルを読めなかったため新規扱い: ${stateAbs}`);
    return { version: 1, chunksDir: chunksDirAbs, completedBasenames: [], runs: [] };
  }
}

function ensureParentDirectory(fileAbs: string): void {
  const dir = path.dirname(fileAbs);
  if (!dir || dir === '.' || dir === fileAbs) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'EEXIST') {
      const st = fs.statSync(dir);
      if (!st.isDirectory()) {
        throw new Error(`状態ファイルの親パスがディレクトリではありません: ${dir}`);
      }
      return;
    }
    // Windows: 親ドライブやプロジェクトルートが無いとき ENOENT — ルートから再試行
    if (err.code === 'ENOENT') {
      const root = path.resolve(process.cwd());
      if (!fs.existsSync(root)) {
        throw new Error(`作業ディレクトリが存在しません: ${root}`);
      }
      fs.mkdirSync(dir, { recursive: true });
      return;
    }
    throw e;
  }
}

function saveState(stateAbs: string, s: StateFile): void {
  ensureParentDirectory(stateAbs);
  fs.writeFileSync(stateAbs, `${JSON.stringify(s, null, 2)}\n`, 'utf8');
}

function resolveTsxAndArgs(bulkScriptRel: string): { command: string; prefixArgs: string[]; shell: boolean } {
  const bulkAbs = path.resolve(process.cwd(), bulkScriptRel);
  const cliMjs = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (fs.existsSync(cliMjs)) {
    // Windows: spawn(..., 'tsx.cmd', { shell: false }) は EINVAL になり得る。node + cli.mjs は安定。
    return { command: process.execPath, prefixArgs: [cliMjs, bulkAbs], shell: false };
  }
  const win = process.platform === 'win32';
  return { command: win ? 'npx.cmd' : 'npx', prefixArgs: ['tsx', bulkAbs], shell: win };
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function runBulkImport(params: {
  chunkAbs: string;
  bulkScriptRel: string;
  forward: string[];
}): Promise<number> {
  const { chunkAbs, bulkScriptRel, forward } = params;
  const { command, prefixArgs, shell } = resolveTsxAndArgs(bulkScriptRel);
  // import-music8-songs-bulk の parseArgs は --key=value 形のみ（--import-keys-file path の2引数は無視される）
  const args = [...prefixArgs, `--import-keys-file=${chunkAbs}`, ...forward];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env,
      shell,
    });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printUsage();
    return;
  }

  const chunksDirAbs = path.resolve(process.cwd(), opts.chunksDir);
  const stateAbs = path.resolve(process.cwd(), opts.stateFile);
  const chunks = listChunkFiles(chunksDirAbs);
  if (chunks.length === 0) {
    console.error(`chunk-*.txt が見つかりません: ${chunksDirAbs}`);
    printUsage();
    process.exit(1);
  }

  let state = loadState(stateAbs, chunksDirAbs);
  const completed = new Set(state.completedBasenames);
  const pending = chunks.filter((c) => !completed.has(c));

  console.log(
    JSON.stringify(
      {
        chunksDir: chunksDirAbs,
        stateFile: stateAbs,
        chunkTotal: chunks.length,
        completed: completed.size,
        pending: pending.length,
        forwardFile: opts.forwardFile,
        forwardArgCount: opts.forward.length,
      },
      null,
      2,
    ),
  );

  if (opts.forward.length === 0) {
    console.error('--forward-file=... または「--」の後に import-music8-songs-bulk へ渡す引数（--artist-songs-base 等）が必要です。');
    process.exit(1);
  }

  if (opts.dryRun) {
    console.log('[dry-run] 実行予定のチャンク:', pending);
    return;
  }

  for (let i = 0; i < pending.length; i += 1) {
    const basename = pending[i]!;
    const chunkAbs = path.join(chunksDirAbs, basename);
    console.error(`\n========== chunk-runner ${i + 1}/${pending.length}: ${basename} ==========\n`);

    const code = await runBulkImport({
      chunkAbs,
      bulkScriptRel: opts.bulkScript,
      forward: opts.forward,
    });

    const finishedAt = new Date().toISOString();
    state.runs.push({ chunk: basename, finishedAt, exitCode: code });
    if (code !== 0) {
      saveState(stateAbs, state);
      console.error(`[chunk-runner] 子プロセスが終了コード ${code} で失敗しました。状態は保存済み。同じコマンドで再開できます（失敗チャンクは未完了のまま）。`);
      process.exit(code);
    }
    state.completedBasenames.push(basename);
    saveState(stateAbs, state);

    if (opts.pauseBetweenChunkMs > 0 && i < pending.length - 1) {
      await sleepMs(opts.pauseBetweenChunkMs);
    }
  }

  console.log(JSON.stringify({ ok: true, message: 'すべてのチャンクが完了しました。' }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * import-keys-file 用の巨大キー一覧をチャンク分割する（夜間バッチの再開・分割用）。
 * または failure JSONL からキー行を抽出してチャンク化する（補完・再試行用）。
 */
import fs from 'node:fs';
import path from 'node:path';

function splitCompositeKey(key: string): { artistSlug: string; songSlug: string } | null {
  const k = key.trim().toLowerCase();
  const u = k.indexOf('_');
  if (u <= 0 || u >= k.length - 1) return null;
  return { artistSlug: k.slice(0, u), songSlug: k.slice(u + 1) };
}

type Cli = {
  help: boolean;
  keysFile: string | null;
  fromFailureLog: string | null;
  reasonFilter: string[] | null;
  chunkSize: number;
  outDir: string;
};

function parseArgs(argv: string[]): Cli {
  let help = false;
  let keysFile: string | null = null;
  let fromFailureLog: string | null = null;
  let reasonFilter: string[] | null = null;
  let chunkSize = 250;
  let outDir = path.join('tmp', 'music8-import-chunks');

  for (const token of argv) {
    if (token === '--help' || token === '-h') {
      help = true;
      continue;
    }
    if (token.startsWith('--keys-file=')) {
      keysFile = token.slice('--keys-file='.length).trim() || null;
      continue;
    }
    if (token.startsWith('--from-failure-log=')) {
      fromFailureLog = token.slice('--from-failure-log='.length).trim() || null;
      continue;
    }
    if (token.startsWith('--reason=')) {
      const raw = token.slice('--reason='.length).trim();
      reasonFilter = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
      continue;
    }
    if (token.startsWith('--chunk-size=')) {
      const n = Number.parseInt(token.slice('--chunk-size='.length).trim(), 10);
      if (Number.isFinite(n) && n > 0) chunkSize = n;
      continue;
    }
    if (token.startsWith('--out-dir=')) {
      outDir = token.slice('--out-dir='.length).trim() || outDir;
      continue;
    }
  }

  return { help, keysFile, fromFailureLog, reasonFilter, chunkSize, outDir };
}

function printUsage(): void {
  console.log(`Usage:
  npx tsx scripts/music8-split-import-keys.ts --keys-file=tmp/music8-on-disk-not-in-db.txt
  npx tsx scripts/music8-split-import-keys.ts --from-failure-log=tmp/music8-import-failures.jsonl

Options:
  --chunk-size=250        1ファイルあたりの行数（キー数）
  --out-dir=tmp/music8-import-chunks   出力先（chunk-00001.txt …）
  --from-failure-log=PATH JSONL から artistSlug_songSlug を復元（1行1失敗）
  --reason=a,b          failure の reason で絞る（省略時は artistSlug・songSlug がある行はすべて）
  --help

出力ファイル名は chunk-00001.txt のゼロ埋め5桁（ソートで順序が保たれる）。`);
}

function collectKeysFromKeysFile(abs: string): string[] {
  const raw = fs.readFileSync(abs, 'utf8');
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const keyLower = t.toLowerCase();
    if (seen.has(keyLower)) continue;
    if (!splitCompositeKey(keyLower)) {
      console.warn(`[split] skip invalid line: ${JSON.stringify(t)}`);
      continue;
    }
    seen.add(keyLower);
    out.push(keyLower);
  }
  return out;
}

type FailRow = { reason?: unknown; artistSlug?: unknown; songSlug?: unknown };

function collectKeysFromFailureLog(abs: string, reasonFilter: string[] | null): string[] {
  const raw = fs.readFileSync(abs, 'utf8');
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    let row: FailRow;
    try {
      row = JSON.parse(t) as FailRow;
    } catch {
      continue;
    }
    const reason = typeof row.reason === 'string' ? row.reason : '';
    if (reasonFilter !== null && reasonFilter.length > 0 && !reasonFilter.includes(reason)) continue;
    const a = typeof row.artistSlug === 'string' ? row.artistSlug.trim().toLowerCase() : '';
    const s = typeof row.songSlug === 'string' ? row.songSlug.trim().toLowerCase() : '';
    if (!a || !s) continue;
    const key = `${a}_${s}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printUsage();
    return;
  }

  const hasKeys = Boolean(opts.keysFile);
  const hasFail = Boolean(opts.fromFailureLog);
  if (hasKeys === hasFail) {
    console.error('--keys-file=... または --from-failure-log=... のどちらか一方を指定してください。');
    printUsage();
    process.exit(1);
  }

  let keys: string[];
  if (opts.keysFile) {
    const abs = path.resolve(process.cwd(), opts.keysFile);
    if (!fs.existsSync(abs)) {
      console.error(`ファイルがありません: ${abs}`);
      console.error(
        'ドキュメントの tmp/your-keys.txt は例です。実在するパスを指定してください（例: diff の out-missing でできた tmp/music8-on-disk-not-in-db-*.txt）。',
      );
      console.error(
        '差分生成: npx tsx scripts/diff-music8-songs-dir-vs-db-slugs.ts --songs-dir="E:\\m8\\public\\data\\songs"',
      );
      process.exit(1);
    }
    keys = collectKeysFromKeysFile(abs);
  } else {
    const abs = path.resolve(process.cwd(), opts.fromFailureLog!);
    if (!fs.existsSync(abs)) {
      console.error(`ファイルがありません: ${abs}`);
      console.error('例: tmp/music8-import-failures.jsonl（import 失敗ログの JSONL）');
      process.exit(1);
    }
    keys = collectKeysFromFailureLog(abs, opts.reasonFilter);
  }

  if (keys.length === 0) {
    console.error('有効なキーが0件です。');
    process.exit(1);
  }

  const outAbs = path.resolve(process.cwd(), opts.outDir);
  fs.mkdirSync(outAbs, { recursive: true });

  let chunkIndex = 0;
  for (let i = 0; i < keys.length; i += opts.chunkSize) {
    chunkIndex += 1;
    const slice = keys.slice(i, i + opts.chunkSize);
    const name = `chunk-${String(chunkIndex).padStart(5, '0')}.txt`;
    const dest = path.join(outAbs, name);
    fs.writeFileSync(dest, `${slice.join('\n')}\n`, 'utf8');
  }

  console.log(
    JSON.stringify(
      {
        keysTotal: keys.length,
        chunkSize: opts.chunkSize,
        chunkFiles: chunkIndex,
        outDir: outAbs,
      },
      null,
      2,
    ),
  );
}

main();

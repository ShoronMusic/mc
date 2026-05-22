/**
 * Music8 一括取り込みの failure JSONL から、`--video-overrides` 用の JSON を生成する。
 * 各キーに Video ID（11 文字）または YouTube URL を書き込んでから import を再実行する。
 */
import fs from 'node:fs';
import path from 'node:path';

type FailureLine = {
  reason?: string;
  artistSlug?: string;
  songSlug?: string;
};

type ParsedCli = {
  help: boolean;
  inputPath: string | null;
  outPath: string | null;
  reasonFilter: string;
};

function parseArgs(argv: string[]): ParsedCli {
  let help = false;
  let inputPath: string | null = null;
  let outPath: string | null = null;
  let reasonFilter = 'video_id_missing';

  for (const token of argv) {
    if (token === '--help' || token === '-h') {
      help = true;
      continue;
    }
    if (token.startsWith('--out=')) {
      outPath = token.slice('--out='.length).trim() || null;
      continue;
    }
    if (token.startsWith('--from=')) {
      inputPath = token.slice('--from='.length).trim() || null;
      continue;
    }
    if (token.startsWith('--reason=')) {
      reasonFilter = token.slice('--reason='.length).trim() || reasonFilter;
      continue;
    }
    if (!token.startsWith('-') && !inputPath) {
      inputPath = token;
    }
  }

  return { help, inputPath, outPath, reasonFilter };
}

function printUsage(reasonDefault: string): void {
  console.log(`Usage:
  tsx scripts/gen-music8-video-overrides-from-failures.ts <failures.jsonl> [--out=tmp/music8-video-overrides.json]
  tsx scripts/gen-music8-video-overrides-from-failures.ts --from=tmp/music8-import-failures.jsonl [--out=...]

Options:
  --reason=${reasonDefault}   JSONL の行をこの reason で絞る（デフォルト: video_id_missing）
  --out=PATH                省略時は標準出力へ JSON のみ出力

出力は { "artistSlug_songSlug": "" } 形式。空文字の値に Video ID または URL を書き込む。`);
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printUsage('video_id_missing');
    return;
  }

  if (!opts.inputPath) {
    console.error('入力 JSONL を指定してください。例: tmp/music8-import-failures-retry-with-fallback.jsonl');
    printUsage(opts.reasonFilter);
    process.exit(1);
  }

  const abs = path.resolve(process.cwd(), opts.inputPath);
  if (!fs.existsSync(abs)) {
    console.error(`ファイルがありません: ${abs}`);
    process.exit(1);
  }

  const text = fs.readFileSync(abs, 'utf8');
  const acc: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    let row: FailureLine;
    try {
      row = JSON.parse(t) as FailureLine;
    } catch {
      continue;
    }
    if (row.reason !== opts.reasonFilter) continue;
    const a = typeof row.artistSlug === 'string' ? row.artistSlug.trim().toLowerCase() : '';
    const s = typeof row.songSlug === 'string' ? row.songSlug.trim().toLowerCase() : '';
    if (!a || !s) continue;
    acc[`${a}_${s}`] = '';
  }

  const sortedKeys = Object.keys(acc).sort((x, y) => x.localeCompare(y));
  const out: Record<string, string> = {};
  for (const k of sortedKeys) out[k] = acc[k];

  const json = JSON.stringify(out, null, 2) + '\n';

  if (opts.outPath) {
    const outAbs = path.resolve(process.cwd(), opts.outPath);
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    fs.writeFileSync(outAbs, json, 'utf8');
    console.error(`Wrote ${sortedKeys.length} key(s) -> ${outAbs}`);
  } else {
    process.stdout.write(json);
  }
}

main();

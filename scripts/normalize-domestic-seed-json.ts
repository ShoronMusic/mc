/**
 * 邦楽 seed JSON の artist / title を一括整形（schema v1 のみ。v2 は compact 前に実行）。
 *
 * v2 最小 JSON へ変換: npx tsx scripts/domestic-playlist-seed.ts compact --in=... --in-place
 *
 * Usage:
 *   npx tsx scripts/normalize-domestic-seed-json.ts --in=tmp/domestic-seed-....json
 *   npx tsx scripts/normalize-domestic-seed-json.ts --in=tmp/seed.json --out=tmp/seed-clean.json
 *   npx tsx scripts/normalize-domestic-seed-json.ts --in=tmp/seed.json --in-place
 *   npx tsx scripts/normalize-domestic-seed-json.ts --in=tmp/seed.json --dry-run
 *   npx tsx scripts/normalize-domestic-seed-json.ts --in=tmp/seed.json --exclude-noise --in-place
 *
 * Options:
 *   --in=PATH          入力 JSON（必須）
 *   --out=PATH         出力先（未指定時は -normalized 付き）
 *   --in-place         入力ファイルを上書き
 *   --dry-run          変更一覧のみ（書き込みなし）
 *   --exclude-noise    Remix / スペシャルMV / 誤パース等を include:false に
 */
import fs from 'node:fs';
import path from 'node:path';
import { textHasJapaneseScript } from '@/lib/comment-pack-jp-economy';
import { cleanTitle } from '@/lib/format-song-display';
import {
  canonicalJapaneseArtistFromChannel,
  parseArtistSongFromCornerBracketTitle,
  parseArtistSongFromJpBilingualHyphenTitle,
  parseArtistSongFromJpSlashTitle,
  resolveDomesticArtistSongFromYoutube,
  stripJpOfficialVideoDecorations,
} from '@/lib/jp-domestic-youtube-title';

const JAPANESE_SCRIPT = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3400-\u4DBF]/;
const JP_DASH_SPLIT = /\s*[-\u2013\u2014\u2015\uFF0D]\s*/;

type SeedItem = {
  index: number;
  videoId: string;
  rawTitle: string;
  channelTitle: string | null;
  artist: string;
  title: string;
  displayTitle: string;
  include: boolean;
  notes: string | null;
  [key: string]: unknown;
};

type SeedDoc = {
  schemaVersion: number;
  items: SeedItem[];
  summary?: Record<string, unknown>;
  [key: string]: unknown;
};

type NormalizeHit = {
  artist: string;
  title: string;
  rule: string;
};

function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq >= 0) args.set(token.slice(2, eq), token.slice(eq + 1));
    else args.set(token.slice(2), '1');
  }
  return args;
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`);
}

function buildDisplayTitle(artist: string, title: string): string {
  return `${artist.trim()} - ${title.trim()}`;
}

function stripLatinArtistSuffix(phrase: string): string {
  return phrase
    .replace(/\s+Kenshi\s+Yonezu\b/gi, '')
    .replace(/\s+Hikaru\s+Utada\b/gi, '')
    .replace(/\s+KenshiYonezu\b/gi, '')
    .replace(/\s+HikaruUtada\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `米津玄師, 宇多田ヒカル Kenshi Yonezu, Hikaru Utada` → `米津玄師, 宇多田ヒカル` */
function normalizeCollabArtists(raw: string, channelTitle: string | null): string | null {
  const t = raw.trim();
  if (!t) return null;

  const commaParts = t.split(/[,、]/).map((p) => p.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    const names: string[] = [];
    for (const part of commaParts) {
      const canonical =
        canonicalJapaneseArtistFromChannel(channelTitle, stripLatinArtistSuffix(part)) ??
        stripLatinArtistSuffix(part);
      if (canonical && JAPANESE_SCRIPT.test(canonical)) names.push(canonical);
    }
    if (names.length >= 2) return names.join(', ');
  }
  return null;
}

function normalizeArtistField(artist: string, rawTitle: string, channelTitle: string | null): string {
  const collab = normalizeCollabArtists(artist, channelTitle);
  if (collab) return collab;

  const fromRawCollab = normalizeCollabArtists(rawTitle.split(/[/／]/)[0] ?? rawTitle, channelTitle);
  if (fromRawCollab) return fromRawCollab;

  const channelCanonical = canonicalJapaneseArtistFromChannel(channelTitle, null);
  const artistCanonical =
    canonicalJapaneseArtistFromChannel(channelTitle, stripLatinArtistSuffix(artist)) ??
    stripLatinArtistSuffix(artist);

  if (
    channelCanonical &&
    artistCanonical &&
    channelCanonical !== artistCanonical &&
    /米津玄師/u.test(rawTitle)
  ) {
    return '米津玄師';
  }

  if (artist.trim() === 'チャンネル' && /米津玄師/u.test(rawTitle)) {
    return '米津玄師';
  }

  if (artistCanonical) return artistCanonical;
  return artist.trim();
}

function parseSongFromMusicVideoBracket(raw: string): string | null {
  const m = raw.match(/[「『]([^」』]+)[」』]\s*Music\s+Video/i);
  const song = m?.[1]?.trim();
  return song ? cleanTitle(song) || song : null;
}

function parseSongFromMvCornerBracket(raw: string): string | null {
  const m = raw.match(/MV\s*[「『]([^」』]+)[」』]/i);
  const song = m?.[1]?.trim();
  return song ? cleanTitle(song) || song : null;
}

function parseSongFromInlineArtistBracket(raw: string): string | null {
  const m = raw.match(/米津玄師\s*[「『]([^」』]+)[」』]/);
  const song = m?.[1]?.trim();
  return song ? cleanTitle(song) || song : null;
}

function parseSongFromAnyCornerBracket(raw: string): string | null {
  const matches = [...raw.matchAll(/[「『]([^」』]+)[」』]/g)].map((m) => m[1]!.trim());
  for (const cand of matches) {
    const song = cleanTitle(cand) || cand;
    if (!song || song.length < 1) continue;
    if (/^(チェンソーマン|機動戦士|僕のヒーロー)/u.test(song)) continue;
    if (song.length <= 80) return song;
  }
  return null;
}

function stripArtistPrefixFromTitle(title: string, artist: string): string {
  let t = title.trim();
  if (!t) return t;

  const artistNorm = artist.trim();
  for (let i = 0; i < 3; i += 1) {
    const m = t.match(/^(.+?)\s*[-\u2013\u2014\u2015\uFF0D]\s*(.+)$/);
    if (!m) break;
    const left = stripLatinArtistSuffix(m[1]!.trim());
    const right = m[2]!.trim();
    if (left === artistNorm || artistNorm.startsWith(left) || left.startsWith(artistNorm.split(',')[0]!.trim())) {
      t = right;
      continue;
    }
    if (/^米津玄師/u.test(left) || /^Kenshi\s+Yonezu$/i.test(left)) {
      t = right;
      continue;
    }
    break;
  }

  return t
    .replace(/^米津玄師\s+Kenshi\s+Yonezu\s*[-–—]\s*/i, '')
    .replace(/^米津玄師\s*[-–—]\s*/u, '')
    .replace(/,\s*Kenshi\s+Yonezu\b.*$/i, '')
    .replace(/\s+Kenshi\s+Yonezu\s*[-–—]\s*.+$/i, '')
    .replace(/\s*×\s*『[^』]+』.*$/u, '')
    .replace(/\s*×\s*[^「『]+$/u, '')
    .trim();
}

function extractEnglishOnlySong(segment: string): string | null {
  const t = segment.trim();
  if (!t || textHasJapaneseScript(t)) return null;
  const cleaned = cleanTitle(t.replace(/\(.*\)$/, '').trim()) || t;
  if (cleaned.length < 1 || cleaned.length > 80) return null;
  if (/^(opening|music video|official)/i.test(cleaned)) return null;
  return cleaned;
}

function tryParseTitle(raw: string, channelTitle: string | null): NormalizeHit | null {
  const stripped = stripJpOfficialVideoDecorations(raw);
  if (!stripped) return null;

  const parsers: Array<[string, (s: string) => { artist: string; song: string } | null]> = [
    ['corner', parseArtistSongFromCornerBracketTitle],
    ['bilingual', parseArtistSongFromJpBilingualHyphenTitle],
    ['slash', parseArtistSongFromJpSlashTitle],
  ];
  for (const [name, fn] of parsers) {
    const hit = fn(stripped);
    if (hit?.song) {
      const artist =
        canonicalJapaneseArtistFromChannel(channelTitle, hit.artist) ?? hit.artist.trim();
      return { artist, title: hit.song.trim(), rule: name };
    }
  }

  const mvCorner = parseSongFromMvCornerBracket(stripped);
  if (mvCorner) {
    const artist = canonicalJapaneseArtistFromChannel(channelTitle, '米津玄師') ?? '米津玄師';
    return { artist, title: mvCorner, rule: 'mv_corner' };
  }

  const mvBracket = parseSongFromMusicVideoBracket(stripped);
  if (mvBracket) {
    const artist = canonicalJapaneseArtistFromChannel(channelTitle, '米津玄師') ?? '米津玄師';
    return { artist, title: mvBracket, rule: 'mv_bracket' };
  }

  const inline = parseSongFromInlineArtistBracket(stripped);
  if (inline) {
    const artist = canonicalJapaneseArtistFromChannel(channelTitle, '米津玄師') ?? '米津玄師';
    return { artist, title: inline, rule: 'inline_bracket' };
  }

  const anyBracket = parseSongFromAnyCornerBracket(stripped);
  if (anyBracket) {
    const artist = canonicalJapaneseArtistFromChannel(channelTitle, '米津玄師') ?? '米津玄師';
    return { artist, title: anyBracket, rule: 'any_bracket' };
  }

  const primarySegment = stripped.split(/\s*\/\s*/)[0]!.trim();
  const dashSource = primarySegment || stripped;
  const parts = dashSource.split(JP_DASH_SPLIT).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const artistPart = parts[0]!;
    const artist =
      canonicalJapaneseArtistFromChannel(channelTitle, stripLatinArtistSuffix(artistPart)) ??
      stripLatinArtistSuffix(artistPart);

    const jpSong = parts
      .slice(1)
      .map((p) => {
        const bilingual = parseArtistSongFromJpBilingualHyphenTitle(`x - ${p}`);
        if (bilingual?.song) return bilingual.song;
        const inner = p.match(/[「『]([^」』]+)[」』]/);
        if (inner?.[1]) return cleanTitle(inner[1]) || inner[1];
        const noLatin = stripLatinArtistSuffix(p);
        if (textHasJapaneseScript(noLatin)) return cleanTitle(noLatin) || noLatin;
        return null;
      })
      .find((s): s is string => Boolean(s));
    if (jpSong) {
      return { artist, title: jpSong, rule: 'dash_jp_segment' };
    }

    const enSong = extractEnglishOnlySong(parts[1]!);
    if (enSong) {
      return { artist, title: enSong, rule: 'dash_en_segment' };
    }
  }

  const yt = resolveDomesticArtistSongFromYoutube({
    rawTitle: stripped,
    channelTitle,
    channelAuthor: channelTitle,
  });
  if (yt?.songTitle && !isLikelyGarbageSongTitle(yt.songTitle, yt.mainArtist)) {
    return { artist: yt.mainArtist, title: yt.songTitle, rule: `youtube:${yt.source}` };
  }

  return null;
}

function isLikelyGarbageSongTitle(title: string, artist: string): boolean {
  const t = title.trim();
  if (!t || t === 'Kenshi Yonezu') return true;
  if (t.includes('Kenshi Yonezu') && t.length > 20) return true;
  if (t.startsWith(`${artist} `) && t.includes(' - ')) return true;
  if (/オープニングムービー/u.test(t) || /スペシャルミュージックビデオ/u.test(t)) return true;
  return false;
}

function normalizeSongTitle(item: SeedItem, artist: string): { title: string; rule: string } {
  const candidates = [item.rawTitle, item.title];
  for (const raw of candidates) {
    const hit = tryParseTitle(raw, item.channelTitle);
    if (hit?.title && !isLikelyGarbageSongTitle(hit.title, artist)) {
      return { title: hit.title, rule: hit.rule };
    }
  }

  let t = stripArtistPrefixFromTitle(item.title, artist);
  t = cleanTitle(t) || t;
  if (t && !isLikelyGarbageSongTitle(t, artist) && t !== item.title) {
    return { title: t, rule: 'strip_prefix' };
  }

  const fallback = tryParseTitle(item.rawTitle, item.channelTitle);
  if (fallback?.title && !isLikelyGarbageSongTitle(fallback.title, artist)) {
    return { title: fallback.title, rule: `${fallback.rule}_fallback` };
  }

  return { title: item.title.trim(), rule: 'unchanged' };
}

function looksLikeNoise(item: SeedItem, artist: string, title: string): string | null {
  const blob = `${item.rawTitle}\n${item.title}\n${title}\n${item.channelTitle ?? ''}`;
  if (/\bremix\b/i.test(blob) || /リミックス/u.test(blob)) return 'remix';
  if (/羽生結弦/u.test(blob)) return 'figure_skating_ver';
  if (/スペシャルミュージックビデオ/u.test(blob)) return 'special_mv';
  if (/オープニングムービー/u.test(blob) && /劇場版/u.test(blob)) return 'anime_opening_movie';
  if (/\bOpening\s+Movie\b/i.test(blob) && title.length > 40) return 'opening_movie';
  if ((item.channelTitle ?? '').includes('TOHO animation')) return 'toho_channel';
  if (title === 'Kenshi Yonezu' || title === artist) return 'garbage_title';
  if (/×『機動戦士/u.test(item.rawTitle) && /Plazma/i.test(title)) return 'anime_tie_long';
  return null;
}

function normalizeItem(
  item: SeedItem,
  excludeNoise: boolean,
): { changed: boolean; rules: string[]; noise: string | null } {
  const rules: string[] = [];
  const parsedFromRaw = tryParseTitle(item.rawTitle, item.channelTitle);

  let artist = normalizeArtistField(item.artist, item.rawTitle, item.channelTitle);
  if (parsedFromRaw?.artist && JAPANESE_SCRIPT.test(parsedFromRaw.artist)) {
    const collab = normalizeCollabArtists(parsedFromRaw.artist, item.channelTitle);
    const next = collab ?? parsedFromRaw.artist;
    if (next !== 'チャンネル') artist = next;
  }
  if (artist === 'チャンネル' && /米津玄師/u.test(item.rawTitle)) {
    artist = '米津玄師';
  }
  if (artist !== item.artist) rules.push('artist');

  const song = normalizeSongTitle(item, artist);
  let title = song.title;
  if (song.rule !== 'unchanged') rules.push(song.rule);

  const displayTitle = buildDisplayTitle(artist, title);
  const noise = looksLikeNoise(item, artist, title);

  const changed =
    artist !== item.artist || title !== item.title || displayTitle !== item.displayTitle;

  item.artist = artist;
  item.title = title;
  item.displayTitle = displayTitle;

  if (excludeNoise && noise) {
    if (item.include !== false) rules.push(`exclude:${noise}`);
    item.include = false;
    const note = `auto-exclude: ${noise}`;
    item.notes = item.notes ? `${item.notes}; ${note}` : note;
  } else if (changed) {
    const note = `normalized: ${rules.join(', ')}`;
    item.notes = item.notes?.includes('normalized:')
      ? item.notes
      : item.notes
        ? `${item.notes}; ${note}`
        : note;
  }

  return { changed, rules, noise };
}

function rebuildSummary(items: SeedItem[]): Record<string, number> {
  return {
    total: items.length,
    withReleaseDate: items.filter((i) => typeof i.originalReleaseDate === 'string' && i.originalReleaseDate).length,
    officialOk: items.filter((i) => i.officialGate && (i.officialGate as { persist?: boolean }).persist).length,
    included: items.filter((i) => i.include).length,
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const inPath = args.get('in')?.trim();
  const dryRun = hasFlag(argv, 'dry-run');
  const inPlace = hasFlag(argv, 'in-place');
  const excludeNoise = hasFlag(argv, 'exclude-noise');

  if (!inPath) {
    console.error('--in=path.json が必要です。');
    process.exit(1);
  }

  const absIn = path.resolve(process.cwd(), inPath);
  if (!fs.existsSync(absIn)) {
    console.error(`ファイルがありません: ${absIn}`);
    process.exit(1);
  }

  let outPath = args.get('out')?.trim();
  if (inPlace) outPath = absIn;
  if (!outPath) {
    const ext = path.extname(absIn);
    const base = absIn.slice(0, -ext.length);
    outPath = `${base}-normalized${ext}`;
  } else if (!path.isAbsolute(outPath)) {
    outPath = path.resolve(process.cwd(), outPath);
  }

  const doc = JSON.parse(fs.readFileSync(absIn, 'utf8')) as SeedDoc & { schemaVersion?: number };
  if (!doc || !Array.isArray(doc.items)) {
    console.error('JSON 形式が不正です（items 配列が必要）');
    process.exit(1);
  }
  if (doc.schemaVersion === 2) {
    console.error('schema v2 は normalize 非対応です。v1 で整形後に compact するか、fetch 直後の v1 に対して実行してください。');
    process.exit(1);
  }

  let changedCount = 0;
  let excludedCount = 0;
  const displayKeys = new Map<string, string[]>();

  for (const item of doc.items) {
    const result = normalizeItem(item, excludeNoise);
    if (result.changed) changedCount += 1;
    if (result.noise && excludeNoise) excludedCount += 1;

    const key = item.displayTitle.toLowerCase();
    const ids = displayKeys.get(key) ?? [];
    ids.push(item.videoId);
    displayKeys.set(key, ids);

    if (result.changed || result.noise) {
      console.log(
        `#${item.index} ${result.changed ? 'UPD' : '---'} ${item.artist} - ${item.title}` +
          (result.noise ? ` [noise:${result.noise}]` : '') +
          (result.rules.length ? ` (${result.rules.join(', ')})` : ''),
      );
    }
  }

  const dupes = [...displayKeys.entries()].filter(([, ids]) => ids.length > 1);
  if (dupes.length > 0) {
    console.log('\n--- duplicate display_title ---');
    for (const [key, ids] of dupes) {
      console.log(`  ${key} -> ${ids.join(', ')}`);
    }
  }

  doc.summary = rebuildSummary(doc.items);

  console.log('\n--- summary ---');
  console.log(`  changed: ${changedCount}/${doc.items.length}`);
  if (excludeNoise) console.log(`  auto-excluded: ${excludedCount}`);
  console.log(`  included: ${doc.summary.included}/${doc.summary.total}`);
  console.log(`  withReleaseDate: ${doc.summary.withReleaseDate}`);

  if (dryRun) {
    console.log(`\ndry-run: would write ${outPath}`);
    return;
  }

  fs.writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  console.log(`\nwritten: ${outPath}`);
}

main();

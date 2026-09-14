/**
 * Music8 曲データから取りたい項目の抽出。
 * - description（曲説明）: content から取得
 * - genres: 複数（例: New wave, Soft rock）
 * - releaseDate: 年月まで（例: 1983.05）
 * - styles: ID 配列（例: [2849]）＋ style_id.txt で名前解決（例: Rock）
 *
 * ref: ref/police_every-breath-you-take.json, ref/style_id.txt
 */

/** ref/style_id.txt の逆引き（ID → スタイル名） */
export const MUSIC8_STYLE_ID_TO_NAME: Record<string, string> = {
  '2849': 'Rock',
  '2844': 'Pop',
  '4686': 'Dance',
  '2845': 'Alternative',
  '2846': 'Electronica',
  '2847': 'R&B',
  '2848': 'Hip-Hop',
  '6409': 'Metal',
  '2873': 'Others',
};

export interface Music8SongExtract {
  /** 曲の説明（HTML 含む）。曲 JSON の content */
  description: string;
  /** ジャンル名の配列（例: ["New wave", "Soft rock"]） */
  genres: string[];
  /** リリース年月（例: "1983.05"） */
  releaseDate: string;
  /** スタイル ID の配列（例: [2849]） */
  styleIds: number[];
  /** スタイル ID をスタイル名にした配列（例: ["Rock"]）。style_id.txt に無い ID はそのまま文字列で */
  styleNames: string[];
  /** musicaichat `display.primary_artist_name_ja` */
  primaryArtistNameJa: string;
  /** `facts_for_ai` 行の「ボーカル：…」から抽出 */
  vocalLabel: string;
  /** `facts_for_ai` 行の「スタイル：…」から抽出（無ければ空） */
  structuredStyleFromFacts: string;
  /** Spotify ジャケット URL（あれば） */
  spotifyImages: string;
  /** Music8 WP `thumbnail` など */
  thumbnailUrl: string;
  /** YouTube video id（曲 JSON にあれば） */
  youtubeVideoId: string;
}

const KNOWN_STYLE_NAMES = new Set(Object.values(MUSIC8_STYLE_ID_TO_NAME));

/**
 * facts テキスト先頭付近の「ボーカル：」「スタイル：」行を抽出（改行区切り想定）。
 */
export function parseMusicaichatStructuredMetadataFromFactsText(factsText: string): {
  vocalLabel: string;
  structuredStyleFromFacts: string;
} {
  let vocalLabel = '';
  let structuredStyleFromFacts = '';
  const lines = (factsText ?? '').split(/\r?\n/);
  for (const line of lines) {
    const v = line.match(/^\s*ボーカル\s*[:：]\s*(.+?)\s*$/i);
    if (v?.[1]) vocalLabel = v[1].trim();
    const s = line.match(/^\s*スタイル\s*[:：]\s*(.+?)\s*$/i);
    if (s?.[1]) structuredStyleFromFacts = s[1].trim();
  }
  return { vocalLabel, structuredStyleFromFacts };
}

/**
 * `songs.style` 用の代表スタイル。
 * - **最優先**: 曲 JSON の `styles`（数値 ID）→ `MUSIC8_STYLE_ID_TO_NAME`（WordPress 曲マスタの分類。musicaichat の facts 行より信頼する）
 * - 次: facts の「スタイル：」行（ID が無いときの補助）
 * - 最後: `styleNames` のヒューリスティック（classification 流し込みは誤爆し得るため ID より後）
 */
export function resolveSongStyleForOverwriteFromMusic8(ex: Music8SongExtract): string | null {
  for (const id of ex.styleIds) {
    const name = MUSIC8_STYLE_ID_TO_NAME[String(id)];
    if (name && name !== 'Others') return name;
  }

  const fromFacts = (ex.structuredStyleFromFacts ?? '').trim();
  if (fromFacts) return fromFacts;

  for (const name of ex.styleNames) {
    const t = (name ?? '').trim();
    if (t && KNOWN_STYLE_NAMES.has(t)) return t;
  }
  for (const name of ex.styleNames) {
    const t = (name ?? '').trim();
    if (t.length >= 4 && !/^\d+$/.test(t)) return t;
  }
  const first = (ex.styleNames[0] ?? '').trim();
  return first || null;
}

function asObj(x: unknown): Record<string, unknown> | null {
  if (x != null && typeof x === 'object' && !Array.isArray(x)) return x as Record<string, unknown>;
  return null;
}

function asStr(x: unknown): string {
  if (typeof x === 'string') return x;
  return '';
}

/** 配列、または単体オブジェクトを 1 件リストにする（WP `vocals: { name: "M" }` 用） */
function asItemList(x: unknown): unknown[] {
  if (Array.isArray(x)) return x;
  if (x && typeof x === 'object') return [x];
  return [];
}

function emptySongExtract(): Music8SongExtract {
  return {
    description: '',
    genres: [],
    releaseDate: '',
    styleIds: [],
    styleNames: [],
    primaryArtistNameJa: '',
    vocalLabel: '',
    structuredStyleFromFacts: '',
    spotifyImages: '',
    thumbnailUrl: '',
    youtubeVideoId: '',
  };
}

/** classification に混入したボーカル記号（M / F）かどうか */
export function isMusic8VocalClassificationToken(raw: string | null | undefined): boolean {
  const t = (raw ?? '').trim();
  if (!t) return false;
  return /^(m|f|male|female|fm|mf)$/i.test(t.replace(/[\s._-]+/g, ''));
}

export function filterMusic8GenreLabels(labels: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of labels) {
    const t = (raw ?? '').trim();
    if (!t || isMusic8VocalClassificationToken(t)) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function pickSongCoverFields(obj: Record<string, unknown>): {
  spotifyImages: string;
  thumbnailUrl: string;
  youtubeVideoId: string;
} {
  const acf = asObj(obj.acf);
  const spotifyImages = (
    asStr(obj.spotify_images ?? '') ||
    (acf ? asStr(acf.spotify_images ?? '') : '')
  ).trim();
  const thumbnailUrl = asStr(obj.thumbnail ?? obj.thumbnailUrl ?? obj.thumbnail_url ?? '').trim();
  const fromTop = asStr(obj.videoId ?? obj.video_id ?? '').trim();
  const yt = asObj(obj.youtube);
  const fromYt = yt ? asStr(yt.video_id ?? yt.videoId ?? '').trim() : '';
  return {
    spotifyImages,
    thumbnailUrl,
    youtubeVideoId: fromTop || fromYt,
  };
}

function canonicalStyleScore(ex: Music8SongExtract): number {
  if (ex.styleIds.some((id) => Boolean(MUSIC8_STYLE_ID_TO_NAME[String(id)]))) return 3;
  if ((ex.structuredStyleFromFacts ?? '').trim()) return 2;
  if (ex.styleNames.some((n) => KNOWN_STYLE_NAMES.has((n ?? '').trim()))) return 1;
  return 0;
}

/** ソングデータタブ等: 複数ソースを 1 件にまとめる（スタイル ID を classification より優先） */
export function mergeMusic8SongExtracts(parts: Music8SongExtract[]): Music8SongExtract | null {
  if (parts.length === 0) return null;
  const out: Music8SongExtract = { ...emptySongExtract(), ...parts[0] };
  out.genres = filterMusic8GenreLabels(out.genres);
  for (const p of parts.slice(1)) {
    if (!out.releaseDate && p.releaseDate) out.releaseDate = p.releaseDate;
    const pGenres = filterMusic8GenreLabels(p.genres);
    if (pGenres.length > out.genres.length) out.genres = pGenres;
    if (canonicalStyleScore(p) > canonicalStyleScore(out)) {
      out.styleIds = p.styleIds;
      out.styleNames = p.styleNames;
      if (p.structuredStyleFromFacts) out.structuredStyleFromFacts = p.structuredStyleFromFacts;
    }
    if (!out.vocalLabel && p.vocalLabel) out.vocalLabel = p.vocalLabel;
    if (!out.structuredStyleFromFacts && p.structuredStyleFromFacts) {
      out.structuredStyleFromFacts = p.structuredStyleFromFacts;
    }
    if (!out.primaryArtistNameJa && p.primaryArtistNameJa) {
      out.primaryArtistNameJa = p.primaryArtistNameJa;
    }
    if (!out.spotifyImages && p.spotifyImages) out.spotifyImages = p.spotifyImages;
    if (!out.thumbnailUrl && p.thumbnailUrl) out.thumbnailUrl = p.thumbnailUrl;
    if (!out.youtubeVideoId && p.youtubeVideoId) out.youtubeVideoId = p.youtubeVideoId;
  }
  return out;
}

/** ISO 日付または YYYY-MM-DD から YYYY.MM を返す */
function formatReleaseYearMonth(value: string): string {
  const s = (value ?? '').trim();
  if (!s) return '';
  const slash = s.match(/^(\d{4})\/(\d{1,2})/);
  if (slash) return `${slash[1]}.${String(Number(slash[2])).padStart(2, '0')}`;
  const m = s.match(/^(\d{4})-(\d{2})/);
  if (m) return `${m[1]}.${m[2]}`;
  const m2 = s.match(/^(\d{4})\.(\d{2})/);
  if (m2) return `${m2[1]}.${m2[2]}`;
  return s.slice(0, 7).replace(/-/g, '.');
}

/**
 * `extractMusic8SongFields` の `releaseDate`（例: "1983.05"）を PostgreSQL `date` 用 `YYYY-MM-DD` にする。
 * 日は Music8 が年月までのため常に `01`。
 */
export function music8ReleaseYearMonthToPostgresDate(releaseYearMonth: string): string | null {
  const s = (releaseYearMonth ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})(?:[\.\-](\d{1,2}))?/);
  if (!m) return null;
  const y = Number(m[1]);
  const monthNum = m[2] != null ? Number(m[2]) : 1;
  if (!Number.isFinite(y) || y < 1000 || y > 2100) return null;
  if (!Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) return null;
  const mm = String(monthNum).padStart(2, '0');
  return `${String(y).padStart(4, '0')}-${mm}-01`;
}

/** WordPress REST `post.date`（ISO8601）→ PostgreSQL `date` 用 `YYYY-MM-DD` */
export function wordpressPublishDateToPostgresDate(value: string): string | null {
  const s = (value ?? '').trim();
  if (!s) return null;
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  if (y < 1000 || y > 2100) return null;
  return `${String(y).padStart(4, '0')}-${mo}-${day}`;
}

/** Music8 の各種日付文字列（ISO / YYYY/MM/DD / 年月）→ `YYYY-MM-DD` */
export function parseFlexibleMusic8DateToPostgresDate(value: string): string | null {
  const s = (value ?? '').trim();
  if (!s) return null;
  const iso = wordpressPublishDateToPostgresDate(s);
  if (iso) return iso;
  const slash = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (slash) {
    const y = slash[1];
    const mo = String(Number(slash[2])).padStart(2, '0');
    const day = String(Number(slash[3])).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }
  return music8ReleaseYearMonthToPostgresDate(formatReleaseYearMonth(s));
}

function isMusic8WpRestLikeJson(obj: Record<string, unknown>): boolean {
  const sk = asObj(obj.stable_key);
  if (sk && typeof sk.artist_slug === 'string') return false;
  const idRaw = obj.id;
  const idNum = typeof idRaw === 'number' ? idRaw : typeof idRaw === 'string' ? Number(idRaw) : NaN;
  return Number.isFinite(idNum) && idNum > 0;
}

/**
 * `songs.original_release_date` 用。WP REST 曲は **投稿公開日（`date`）** を最優先。
 */
export function resolveOriginalReleaseDateFromMusic8Json(data: unknown): string | null {
  const obj = asObj(data);
  if (!obj) return null;

  const sk = asObj(obj.stable_key);
  if (sk && typeof sk.artist_slug === 'string' && typeof sk.song_slug === 'string') {
    const releases = asObj(obj.releases);
    if (releases) {
      const d = asStr(releases.original_release_date ?? releases.this_release_date ?? '').trim();
      if (d) return parseFlexibleMusic8DateToPostgresDate(d);
    }
    const ex = extractMusicaichatV1SongFields(data);
    if (ex?.releaseDate.trim()) return music8ReleaseYearMonthToPostgresDate(ex.releaseDate);
    return null;
  }

  if (isMusic8WpRestLikeJson(obj)) {
    const wpDate = asStr(obj.date ?? '').trim();
    if (wpDate) {
      const parsed = wordpressPublishDateToPostgresDate(wpDate);
      if (parsed) return parsed;
    }
    const acf = asObj(obj.acf);
    if (acf) {
      const yt = asStr(acf.ytreleasedate ?? '').trim();
      if (yt) {
        const p = parseFlexibleMusic8DateToPostgresDate(yt);
        if (p) return p;
      }
      const sp = asStr(acf.spotify_release_date ?? '').trim();
      if (sp) {
        const p = parseFlexibleMusic8DateToPostgresDate(sp);
        if (p) return p;
      }
    }
    const releaseDate = asStr(obj.releaseDate ?? '').trim();
    if (releaseDate) return parseFlexibleMusic8DateToPostgresDate(releaseDate);
  }

  return null;
}

/**
 * `data/songs/{artist}_{slug}.json` の `releaseDate` のみ（原盤）。
 * `acf.ytreleasedate` / Spotify / WP 投稿 `date` は使わない（サイト表示・バックフィル用）。
 */
export function resolveOriginalReleaseDateFromMusic8WpSongsFileJson(data: unknown): string | null {
  const obj = asObj(data);
  if (!obj) return null;
  const rd = asStr(obj.releaseDate ?? '').trim();
  if (!rd) return null;
  return parseFlexibleMusic8DateToPostgresDate(rd);
}

/** 保存済み `music8_song_data` から原盤日を復元 */
export function resolveOriginalReleaseDateFromPersistedSnapshot(data: unknown): string | null {
  const o = asObj(data);
  if (!o) return null;
  if (o.kind === 'music8_wp_song') {
    const wp = asStr(o.wp_published_date ?? '').trim();
    if (wp) return wp;
  }
  const releaseDate = asStr(o.releaseDate_normalized ?? '').trim();
  if (releaseDate) return music8ReleaseYearMonthToPostgresDate(releaseDate);
  return null;
}

/**
 * ライブラリ一覧用のアルバム原盤日。
 * WP 投稿日（`wp_published_date`）は使わず、`releaseDate_normalized` を優先する。
 * （`songs.original_release_date` に WP/YT 日が混入しているときの表示矯正）
 */
export function resolveAlbumReleaseDateFromPersistedSnapshot(data: unknown): string | null {
  const o = asObj(data);
  if (!o) return null;
  const releaseDate = asStr(o.releaseDate_normalized ?? '').trim();
  if (releaseDate) return music8ReleaseYearMonthToPostgresDate(releaseDate);
  return null;
}

/**
 * facts_for_ai の定型文（「Music8 に掲載…」「文脈で分類されています」等）。
 * ソングデータ UI と AI 注入の両方で除外する。
 */
export function isMusicaichatFactsBoilerplateLine(line: string): boolean {
  const t = (line ?? '').trim();
  if (!t) return false;
  if (/Music8\s*に\s*掲載/.test(t) && /楽曲/.test(t)) return true;
  if (/に掲載されている楽曲/.test(t)) return true;
  if (/文脈で分類されています/.test(t)) return true;
  if (/などの文脈で/.test(t) && /分類/.test(t)) return true;
  if (/\blisted on Music8\b/i.test(t)) return true;
  if (/categorized in contexts such as/i.test(t)) return true;
  return false;
}

export function filterMusicaichatFactsBoilerplateLines(lines: string[]): string[] {
  return lines.filter((l) => !isMusicaichatFactsBoilerplateLine(l));
}

export function music8HtmlOrTextToPlain(raw: string): string {
  return (raw ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<figure[\s\S]*?<\/figure>/gi, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      const code = Number.parseInt(n, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    })
    .replace(/\r\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** 曲紹介のジャンル／ボーカル／スタイル行（項目として別表示するため本文からは外す） */
export function stripMusic8StructuredMetaLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*(ジャンル|ボーカル|スタイル|Genre|Vocal|Style)\s*[:：]/i.test(line))
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * 曲 JSON から紹介本文を取る。WP `content` 全文があればそれを優先し、
 * musicaichat の opening_lines 抜粋（末尾 …）は短いときだけ使う。
 */
export function pickMusic8SongFullDescription(song: unknown): string {
  const extracted = music8HtmlOrTextToPlain(extractMusic8SongFields(song).description);
  const obj = asObj(song);
  const contentRaw = obj?.content ?? obj?.description;
  const contentStr =
    typeof contentRaw === 'string'
      ? contentRaw
      : asStr(asObj(contentRaw)?.rendered ?? '');
  const fromContent = music8HtmlOrTextToPlain(contentStr);
  const facts = extracted ? stripMusic8StructuredMetaLines(extracted) : '';
  const content = fromContent ? stripMusic8StructuredMetaLines(fromContent) : '';
  if (content) {
    const factsTruncated = /(?:\.{3}|…)\s*$/.test(facts);
    if (!facts || factsTruncated || content.length >= facts.length) return content;
  }
  return facts;
}

export const MUSIC8_INTRO_MIN_CHARS = 24;

export function normalizeMusic8IntroPlain(text: string): string {
  return (text ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function compactIntroKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '');
}

function firstArtistNameFromWpSong(obj: Record<string, unknown> | null): string {
  if (!obj) return '';
  for (const key of ['artists', 'main_artists'] as const) {
    const raw = obj[key];
    if (Array.isArray(raw)) {
      const first = raw[0];
      if (first && typeof first === 'object' && !Array.isArray(first)) {
        const n = (first as { name?: unknown }).name;
        if (typeof n === 'string' && n.trim()) return n.trim();
      }
      if (typeof first === 'string' && first.trim()) return first.trim();
    }
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return '';
}

function songTitleFromWpSong(obj: Record<string, unknown> | null): string {
  if (!obj) return '';
  if (typeof obj.title === 'string' && obj.title.trim()) return obj.title.trim();
  const rendered = asObj(obj.title)?.rendered;
  return typeof rendered === 'string' ? rendered.trim() : '';
}

/** WP 本文が「Artist - Title」だけの行なら曲紹介ではない */
export function isBareArtistTitleMusic8Intro(
  plain: string,
  artist?: string | null,
  title?: string | null,
): boolean {
  const n = compactIntroKey(plain);
  if (!n) return true;
  const a = (artist ?? '').trim();
  const t = (title ?? '').trim();
  if (!a || !t) return false;
  const credit = compactIntroKey(`${a} - ${t}`);
  const creditEnDash = compactIntroKey(`${a} – ${t}`);
  const creditEmDash = compactIntroKey(`${a} — ${t}`);
  return n === credit || n === creditEnDash || n === creditEmDash;
}

/** 先頭のクレジット行（`Artist - Title`）を本文から外す */
export function stripLeadingMusic8CreditLine(plain: string): string {
  const parts = (plain ?? '').split('\n');
  if (parts.length < 2) return (plain ?? '').trim();
  const first = parts[0]!.trim();
  const rest = parts.slice(1).join('\n').trim();
  if (!rest) return first;
  const firstLooksCredit =
    /^.{1,180}\s[-–—]\s.{1,180}$/.test(first) ||
    (!/[\u3040-\u30FF\u4E00-\u9FFF]/.test(first) &&
      /[-–—]/.test(first) &&
      !/[.!?]/.test(first) &&
      first.length < 120);
  if (firstLooksCredit && rest.length > 0) {
    return rest;
  }
  return (plain ?? '').trim();
}

export function looksLikeCreditOnlyIntro(plain: string): boolean {
  const one = plain.replace(/\n/g, ' ').trim();
  if (!one) return true;
  if (/[\u3040-\u30FF\u4E00-\u9FFF]/.test(one)) return false;
  if (/[。]/.test(one)) return false;
  if (one.length >= 160) return false;
  if (!/\s/.test(one) && one.length < 140) return true;
  if (/\b(?:ft|feat|featuring)\.?\b/i.test(one) && /[-–—]/.test(one) && one.length < 140) {
    return true;
  }
  if (/^.+\s*[-–—]\s*.+$/.test(one) && one.length < 120) return true;
  return false;
}

/**
 * WP 曲 JSON の `content` から HTML を除いた曲紹介本文。
 * `<p>` 等のタグ除去後が短すぎる／クレジット行のみなら空文字。
 */
export function plainMusic8IntroFromWpSongJson(song: unknown): string {
  const obj = asObj(song);
  const artist = firstArtistNameFromWpSong(obj);
  const title = songTitleFromWpSong(obj);
  const plain = stripLeadingMusic8CreditLine(
    normalizeMusic8IntroPlain(pickMusic8SongFullDescription(song)),
  );
  if (plain.length < MUSIC8_INTRO_MIN_CHARS) return '';
  if (isBareArtistTitleMusic8Intro(plain, artist, title)) return '';
  if (looksLikeCreditOnlyIntro(plain)) return '';
  return plain;
}

/** 抜粋（末尾 …）より全文を優先。どちらも全文なら長い方。 */
export function preferFullerMusic8Description(a: string, b: string): string {
  const x = (a ?? '').trim();
  const y = (b ?? '').trim();
  if (!x) return y;
  if (!y) return x;
  const xTrunc = /(?:\.{3}|…)\s*$/.test(x);
  const yTrunc = /(?:\.{3}|…)\s*$/.test(y);
  if (xTrunc && !yTrunc) return y;
  if (yTrunc && !xTrunc) return x;
  return x.length >= y.length ? x : y;
}

/**
 * musicaichat/v1 の曲 JSON（stable_key・facts_for_ai・classification 等）
 */
function extractMusicaichatV1SongFields(data: unknown): Music8SongExtract | null {
  const obj = asObj(data);
  if (!obj) return null;
  const sk = asObj(obj.stable_key as unknown);
  if (!sk || typeof sk.artist_slug !== 'string' || typeof sk.song_slug !== 'string') return null;

  const lines: string[] = [];
  const facts = asObj(obj.facts_for_ai as unknown);
  if (facts) {
    const ol = facts.opening_lines;
    if (Array.isArray(ol)) {
      for (const x of ol) {
        if (typeof x === 'string' && x.trim()) lines.push(x.trim());
      }
    }
    const bl = facts.bullets;
    if (Array.isArray(bl)) {
      for (const x of bl) {
        if (typeof x === 'string' && x.trim()) lines.push(x.trim());
      }
    }
  }
  const rawFactsJoined = lines.join('\n');
  const { vocalLabel, structuredStyleFromFacts } =
    parseMusicaichatStructuredMetadataFromFactsText(rawFactsJoined);
  const descFromFacts = filterMusicaichatFactsBoilerplateLines(lines).join('\n').trim();
  const display = asObj(obj.display as unknown);
  const creditLine = display ? asStr(display.credit_line ?? '') : '';
  const primaryArtistNameJa = display ? asStr(display.primary_artist_name_ja ?? '').trim() : '';

  const genres: string[] = [];
  const cls = obj.classification;
  if (Array.isArray(cls)) {
    for (const x of cls) {
      if (typeof x === 'string' && x.trim()) genres.push(x.trim());
    }
  }

  const releases = asObj(obj.releases as unknown);
  const dateSrc = releases
    ? asStr(releases.original_release_date ?? releases.this_release_date ?? '')
    : '';

  const styleIds: number[] = [];
  const styleNames: string[] = [];
  const stylesSrc = obj.styles;
  if (Array.isArray(stylesSrc)) {
    for (const id of stylesSrc) {
      const n = typeof id === 'number' ? id : Number(id);
      if (!Number.isNaN(n)) {
        styleIds.push(n);
        styleNames.push(MUSIC8_STYLE_ID_TO_NAME[String(n)] ?? String(n));
      }
    }
  }
  if (styleNames.length === 0 && structuredStyleFromFacts) {
    styleNames.push(structuredStyleFromFacts);
  } else if (styleNames.length === 0 && genres.length > 0) {
    for (const g of filterMusic8GenreLabels(genres)) styleNames.push(g);
  }

  const cover = pickSongCoverFields(obj);

  return {
    description: (descFromFacts || creditLine).trim().replace(/(\r?\n){2,}/g, '\n'),
    genres: filterMusic8GenreLabels(genres),
    releaseDate: dateSrc ? formatReleaseYearMonth(dateSrc) : '',
    styleIds,
    styleNames,
    primaryArtistNameJa,
    vocalLabel,
    structuredStyleFromFacts,
    ...cover,
  };
}

/**
 * 曲 JSON / アーティスト JSON の songs[].1 件 / musicaichat v1 曲 JSON のいずれでも渡せる。
 * - 曲 JSON: content, genres[], releaseDate, styles[]
 * - アーティストページ曲: content, genre_data[] or genres[], date / date_gmt, style[] or styles[]
 */
export function extractMusic8SongFields(data: unknown): Music8SongExtract {
  const mc = extractMusicaichatV1SongFields(data);
  if (mc) return mc;

  const obj = asObj(data);
  const result: Music8SongExtract = emptySongExtract();

  if (!obj) return result;

  // 曲単体 JSON は content が文字列のことも、アーティスト JSON の songs[] は content.rendered のことがある
  const contentRaw = obj.content ?? obj.description;
  const descriptionStr =
    typeof contentRaw === 'string'
      ? contentRaw
      : asStr(asObj(contentRaw)?.rendered ?? '');
  // 曲説明文の改行は1回だけにする（連続改行を1つにまとめる）
  result.description = descriptionStr
    .trim()
    .replace(/(\r?\n){2,}/g, '\n');

  const genresSrc = obj.genres ?? obj.genre_data;
  if (Array.isArray(genresSrc)) {
    result.genres = filterMusic8GenreLabels(
      genresSrc
        .map((g) => {
          const item = asObj(g);
          if (item && typeof item.name === 'string') return item.name.trim();
          return typeof g === 'string' ? g.trim() : '';
        })
        .filter(Boolean),
    );
  }

  const dateSrc = asStr(obj.releaseDate ?? obj.date ?? obj.date_gmt ?? '');
  result.releaseDate = dateSrc ? formatReleaseYearMonth(dateSrc) : '';

  const vocalSrc = [...asItemList(obj.vocal_data), ...asItemList(obj.vocals)];
  if (vocalSrc.length > 0) {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const item of vocalSrc) {
      const o = asObj(item);
      const vocalName = o ? asStr(o.name ?? o.slug ?? '').trim() : '';
      const key = vocalName.toLowerCase();
      if (!vocalName || seen.has(key)) continue;
      seen.add(key);
      names.push(vocalName);
    }
    if (names.length > 0) result.vocalLabel = names.join(', ');
  }

  const artistsSrc = obj.artists;
  if (Array.isArray(artistsSrc) && artistsSrc.length > 0) {
    const firstArtist = asObj(artistsSrc[0]);
    const artistAcf = firstArtist ? asObj(firstArtist.acf as unknown) : null;
    const jpName = artistAcf ? asStr(artistAcf.artistjpname ?? '').trim() : '';
    if (jpName) result.primaryArtistNameJa = jpName;
  }

  const styleIdsSrc = obj.styles ?? obj.style ?? [];
  const ids = Array.isArray(styleIdsSrc) ? styleIdsSrc : [styleIdsSrc];
  for (const id of ids) {
    const n = typeof id === 'number' ? id : Number(id);
    if (!Number.isNaN(n)) {
      result.styleIds.push(n);
      const name = MUSIC8_STYLE_ID_TO_NAME[String(n)];
      result.styleNames.push(name ?? String(n));
    }
  }

  const cover = pickSongCoverFields(obj);
  result.spotifyImages = cover.spotifyImages;
  result.thumbnailUrl = cover.thumbnailUrl;
  result.youtubeVideoId = cover.youtubeVideoId;

  return result;
}

/**
 * DB に保存済みの `music8_song_data`（musicaichat_v1 スナップショット）から `Music8SongExtract` 互換を復元。
 * 視聴履歴 upsert 等、生 JSON が無い経路で `songs.style` を同期するときに使う。
 */
export function extractMusic8SongFieldsFromPersistedSnapshot(data: unknown): Music8SongExtract | null {
  const o = asObj(data);
  if (!o || (o.kind !== 'musicaichat_v1' && o.kind !== 'music8_wp_song')) return null;

  const genres: string[] = [];
  if (Array.isArray(o.genres)) {
    for (const x of o.genres) {
      if (typeof x === 'string' && x.trim()) genres.push(x.trim());
    }
  }
  const styleNames: string[] = [];
  if (Array.isArray(o.styleNames)) {
    for (const x of o.styleNames) {
      if (typeof x === 'string' && x.trim()) styleNames.push(x.trim());
    }
  }
  const styleIds: number[] = [];
  if (Array.isArray(o.styleIds)) {
    for (const x of o.styleIds) {
      const n = typeof x === 'number' ? x : Number(x);
      if (!Number.isNaN(n)) styleIds.push(n);
    }
  }

  const releaseDate = typeof o.releaseDate_normalized === 'string' ? o.releaseDate_normalized.trim() : '';
  const vocalLabel = typeof o.vocal === 'string' ? o.vocal.trim() : '';
  const structuredStyleFromFacts =
    typeof o.structured_style === 'string' ? o.structured_style.trim() : '';
  let primaryArtistNameJa = typeof o.primary_artist_name_ja === 'string' ? o.primary_artist_name_ja.trim() : '';
  if (!primaryArtistNameJa) {
    const d = asObj(o.display);
    primaryArtistNameJa = d ? asStr(d.primary_artist_name_ja ?? '').trim() : '';
  }

  return {
    description: '',
    genres: filterMusic8GenreLabels(genres),
    releaseDate,
    styleIds,
    styleNames,
    primaryArtistNameJa,
    vocalLabel,
    structuredStyleFromFacts,
    spotifyImages: typeof o.spotify_images === 'string' ? o.spotify_images.trim() : '',
    thumbnailUrl: typeof o.thumbnail === 'string' ? o.thumbnail.trim() : '',
    youtubeVideoId: typeof o.videoId === 'string' ? o.videoId.trim() : '',
  };
}

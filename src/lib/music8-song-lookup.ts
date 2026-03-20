/**
 * Music8 曲データ取得：ダイレクト曲 JSON を試し、404 ならアーティスト JSON（1〜6 ページ）を検索するフォールバック。
 * - 曲スラッグが重複で数字付き（例: every-breath-you-take-2）の場合はダイレクトで該当しないためアーティスト側で検索。
 */

import { artistNameToMusic8Slug } from '@/lib/music8-artist-display';
import {
  getArtistDisplayString,
  getMainArtist,
  parseArtistTitle,
} from '@/lib/format-song-display';

const MUSIC8_SONGS_BASE = 'https://xs867261.xsrv.jp/data/data/songs';
const MUSIC8_ARTISTS_BASE = 'https://xs867261.xsrv.jp/data/data/artists';
const ARTIST_PAGES_MAX = 6;

/** ローマ数字をアラビア数字に（Music8 の slug は synchronicity2 のように数字） */
function romanNumeralToDigit(title: string): string {
  let s = title;
  const map: [RegExp, string][] = [
    [/\bVIII\b/gi, '8'],
    [/\bIII\b/gi, '3'],
    [/\bVII\b/gi, '7'],
    [/\bIV\b/gi, '4'],
    [/\bVI\b/gi, '6'],
    [/\bIX\b/gi, '9'],
    [/\bII\b/gi, '2'],
    [/\bXI\b/gi, '11'],
    [/\bXII\b/gi, '12'],
    [/\bV\b/gi, '5'],
    [/\bX\b/gi, '10'],
    [/\bI\b/gi, '1'],
  ];
  for (const [re, num] of map) {
    s = s.replace(re, num);
  }
  return s;
}

/**
 * 曲タイトルを music8 の URL 用 slug に変換。
 * ローマ数字（II→2 等）を変換し、スペースはハイフン、小文字化。末尾の -数字 は 数字 にまとめる（synchronicity2 対応）。
 */
export function songTitleToMusic8Slug(title: string): string {
  let s = (title ?? '').trim();
  if (!s) return '';
  s = romanNumeralToDigit(s);
  s = s.replace(/\s+/g, '-').toLowerCase();
  s = s.replace(/[^\w\-]/g, ''); // 英数字・ハイフン以外を除去
  s = s.replace(/-+/g, '-').replace(/^-|-$/g, '');
  s = s.replace(/-(\d+)$/, '$1');
  return s;
}

/**
 * 視聴履歴の title は「Artist - Song (Official Music Video)」のようになっていることがある。
 * 先頭のアーティスト接頭辞と末尾の括弧を除き、Music8 用の「曲名だけ」にする。
 */
export function normalizeSongTitleForLookup(artistNameOrSlug: string, songTitle: string): string {
  let s = (songTitle ?? '').trim();
  if (!s) return '';

  const sep = ' - ';
  const artistSlug = artistNameToMusic8Slug(artistNameOrSlug);
  const parts = s.split(sep).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2 && artistSlug) {
    const firstSlug = songTitleToMusic8Slug(parts[0]);
    const match = firstSlug === artistSlug || firstSlug === `the-${artistSlug}` || firstSlug.endsWith(`-${artistSlug}`);
    if (match) {
      parts.shift();
      s = parts.join(sep);
    }
  }

  while (true) {
    const m1 = s.match(/\s*\([^)]*\)\s*$/);
    const m2 = s.match(/\s*\[[^\]]*\]\s*$/);
    const m = m1 || m2;
    if (!m) break;
    s = s.slice(0, s.length - m[0].length).trim();
  }

  return s.replace(/\s+/g, ' ').trim();
}

/**
 * ダイレクト曲 JSON の URL（スラッグ重複で数字が付く場合は 404 になり得る）
 */
export function getMusic8SongJsonUrl(artistSlug: string, titleSlug: string): string {
  if (!artistSlug?.trim() || !titleSlug?.trim()) return '';
  return `${MUSIC8_SONGS_BASE}/${artistSlug}_${titleSlug}.json`;
}

/**
 * アーティスト JSON の URL（20 曲ごとのページ、1〜6）
 */
export function getMusic8ArtistPageUrl(artistSlug: string, page: number): string {
  if (!artistSlug?.trim() || page < 1 || page > ARTIST_PAGES_MAX) return '';
  return `${MUSIC8_ARTISTS_BASE}/${artistSlug}/${page}.json`;
}

/** アーティスト JSON の songs 配列の要素（抜粋） */
export interface Music8ArtistSongItem {
  id?: number;
  slug?: string;
  title?: { rendered?: string };
  acf?: { ytvideoid?: string; [key: string]: unknown };
  [key: string]: unknown;
}

/** アーティスト JSON のレスポンス形状 */
export interface Music8ArtistPageJson {
  artist?: unknown;
  songs?: Music8ArtistSongItem[];
  totalSongs?: number;
  totalPages?: number;
  currentPage?: number;
}

/**
 * 曲スラッグが一致するか（先頭一致で数字付き重複も許容：every-breath-you-take と every-breath-you-take-2）
 */
function slugMatches(want: string, have: string): boolean {
  if (!want || !have) return false;
  const w = want.toLowerCase().trim();
  const h = have.toLowerCase().trim();
  if (w === h) return true;
  if (h.startsWith(w + '-')) return true;
  return false;
}

/**
 * アーティスト JSON の 1〜6 ページを順に取得し、titleSlug に一致する曲を探す。
 */
async function findSongInArtistPages(
  artistSlug: string,
  titleSlug: string
): Promise<Music8ArtistSongItem | null> {
  for (let page = 1; page <= ARTIST_PAGES_MAX; page++) {
    const url = getMusic8ArtistPageUrl(artistSlug, page);
    if (!url) continue;
    try {
      const res = await fetch(url, { next: { revalidate: 300 } });
      if (!res.ok) continue;
      const data = (await res.json()) as Music8ArtistPageJson;
      const songs = data?.songs ?? [];
      const found = songs.find((s) => slugMatches(titleSlug, (s.slug ?? '').trim()));
      if (found) return found;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Music8 の曲データを取得する。
 * 1) ダイレクト曲 JSON（songs/{artist}_{title}.json）を試す
 * 2) 404 の場合はアーティスト JSON の 1〜6 ページを検索（スラッグ重複で数字付きのケースに対応）
 *
 * @param artistNameOrSlug アーティスト名（例: "The Police"）または既に slug 化した文字列（例: "police"）
 * @param songTitle 曲名（例: "Every Breath You Take"）
 * @returns 曲データ（曲単体 JSON の形状 or アーティスト JSON の songs[].1 件）。見つからなければ null
 */
export async function fetchMusic8SongData(
  artistNameOrSlug: string,
  songTitle: string
): Promise<Record<string, unknown> | null> {
  const artistSlug = artistNameToMusic8Slug(artistNameOrSlug) || (artistNameOrSlug ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  const normalizedTitle = normalizeSongTitleForLookup(artistNameOrSlug, songTitle ?? '');
  const titleSlug = songTitleToMusic8Slug(normalizedTitle || (songTitle ?? '').trim());
  if (!artistSlug || !titleSlug) return null;

  const directUrl = getMusic8SongJsonUrl(artistSlug, titleSlug);
  if (directUrl) {
    try {
      const res = await fetch(directUrl, { next: { revalidate: 300 } });
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        if (data && typeof data === 'object') return data;
      }
    } catch {
      // フォールバックへ
    }
  }

  const fromArtist = await findSongInArtistPages(artistSlug, titleSlug);
  if (fromArtist) return fromArtist as unknown as Record<string, unknown>;
  return null;
}

/**
 * 視聴履歴の title（YouTube 全文）から Music8 検索用の「曲名だけ」を得る。
 * 例: "Gary Byrd & … feat. Stevie Wonder - The Crown (Remastered 2013)" → "The Crown"
 */
export function resolveSongTitleForMusic8(mainArtist: string, fullVideoTitle: string): string {
  const t = (fullVideoTitle ?? '').trim();
  if (!t) return '';
  const parsed = parseArtistTitle(t);
  const rawSong = parsed?.song?.trim() || t;

  // Music8 の slug は英字側で揃っていることが多いので、
  // 可能なら英字の曲名を抽出して使う。
  let preferredSong = rawSong;

  // 1) ( ... ) の中に英字がある場合はそれを優先（例: 「ピアノ・マン (Piano Man)」）
  const parenLatin = rawSong.match(/\(([^)]*[A-Za-z][^)]*)\)/);
  if (parenLatin?.[1]) {
    preferredSong = parenLatin[1].trim();
  } else {
    // 2) 1) で取れない場合、parseArtistTitle が崩れて
    //    song 側が「メインアーティスト名」になってしまっているケースをフォールバック。
    const mainNorm = getMainArtist(mainArtist).trim();
    const mainTokens = mainNorm.toLowerCase().split(/\s+/).filter(Boolean);

    const songIsLikelyArtist =
      mainTokens.length > 0 && mainTokens.every((tok) => preferredSong.toLowerCase().includes(tok));

    if (songIsLikelyArtist) {
      // 最後の " - " 区切りを見て、右側がメインアーティストなら左側から曲名候補を作る
      const sep = /\s*[-\u2013\u2014\u2015]\s*/;
      const parts = t.split(sep).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const right = parts[parts.length - 1];
        const left = parts.slice(0, -1).join(' ');
        const rightLower = right.toLowerCase();
        const rightMatches = mainTokens.every((tok) => rightLower.includes(tok));
        if (rightMatches) preferredSong = left;
      }
    }

    // 3) preferredSong から英字の塊を取り出す（必要なら最後の塊だけに絞る）
    const hasLatin = /[A-Za-z]/.test(preferredSong);
    const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF]/.test(preferredSong);
    if (hasLatin) {
      // 日本語+英語混在なら「最後の英字塊」を採用し、余計なアーティスト語を避ける
      const latinMatches = preferredSong.match(/[A-Za-z][A-Za-z0-9'&.\- ]*/g);
      if (latinMatches && latinMatches.length > 0) {
        preferredSong = latinMatches[latinMatches.length - 1].trim();
      } else if (!hasJapanese) {
        preferredSong = preferredSong.trim();
      }
    }
  }

  const normalized = normalizeSongTitleForLookup(mainArtist, preferredSong);
  return (normalized || preferredSong || rawSong).replace(/\s+/g, ' ').trim();
}

/**
 * メインアーティストに加え、タイトル上の feat./& から候補を列挙（コラボ曲を別 slug で登録している場合のフォールバック）
 */
export function listArtistCandidatesForMusic8(
  mainArtistFromDb: string,
  fullVideoTitle: string
): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    const x = (s ?? '').trim();
    if (!x) return;
    const low = x.toLowerCase();
    if (!out.some((a) => a.toLowerCase() === low)) out.push(x);
  };
  add(mainArtistFromDb);
  const parsed = parseArtistTitle((fullVideoTitle ?? '').trim());
  if (parsed?.artist) {
    const disp = getArtistDisplayString(parsed.artist);
    for (const part of disp.split(',').map((p) => p.trim()).filter(Boolean)) {
      add(getMainArtist(part));
    }
  }
  return out;
}

/**
 * 視聴履歴1行分（メインアーティスト + YouTube タイトル全文）から Music8 曲 JSON を解決する。
 */
export async function fetchMusic8SongDataForPlaybackRow(
  mainArtist: string,
  fullVideoTitle: string
): Promise<Record<string, unknown> | null> {
  const songLookup = resolveSongTitleForMusic8(mainArtist, fullVideoTitle);
  if (!songLookup) return null;
  for (const artist of listArtistCandidatesForMusic8(mainArtist, fullVideoTitle)) {
    const data = await fetchMusic8SongData(artist, songLookup);
    if (data) return data;
  }
  return null;
}

/**
 * music8 アーティスト JSON の表示フォーマット（ref/category.php のルールに準拠）
 * - The の扱い（thePrefix）
 * - 生年月日・永眠（故人）の表記
 * - Occupation / member の整形
 */

import { getMainArtist } from '@/lib/format-song-display';
import { resolveArtistNameForMusic8Lookup } from '@/lib/music8-main-artist-lookup';
export interface Music8OccupationItem {
  value?: string;
  label?: string;
}

export interface Music8MemberItem {
  name?: string;
  slug?: string;
  term_id?: number;
}

export interface Music8ArtistJson {
  name: string;
  slug?: string;
  description?: string;
  thePrefix?: string;
  artistjpname?: string;
  artistorigin?: string;
  artistactiveyearstart?: string;
  artistborn?: string;
  artistdied?: string;
  occupation?: string | Music8OccupationItem[];
  member?: false | Music8MemberItem[] | Music8MemberItem;
  spotify_artist_images?: string;
  [key: string]: unknown;
}

/** JSON のキーが snake_case / camelCase 両方に対応して文字列を取得 */
function getArtistString(artist: Music8ArtistJson, ...keys: string[]): string {
  for (const k of keys) {
    const v = (artist as Record<string, unknown>)[k];
    if (v != null && typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/** member を artist.member / Member などから取得 */
function getArtistMember(
  artist: Music8ArtistJson
): false | Music8MemberItem[] | Music8MemberItem | undefined {
  const m = artist.member ?? (artist as Record<string, unknown>).Member;
  if (m === false || m == null) return undefined;
  return m as false | Music8MemberItem[] | Music8MemberItem;
}

const MUSIC8_ARTISTS_BASE = 'https://xs867261.xsrv.jp/data/data/artists';

/**
 * アーティスト名を music8 の JSON URL 用 slug に変換。
 * - 「Rema, Selena Gomez」「Artist feat. Guest」などからはメインアーティストだけを抽出
 * - 先頭の The / A / An を除き、スペースをハイフン、小文字化。
 */
export function artistNameToMusic8Slug(artistName: string): string {
  let s = (artistName ?? '').trim();
  if (!s) return '';
  try {
    const main = getMainArtist(s);
    if (main && typeof main === 'string') {
      s = main.trim();
    }
  } catch {
    // フォーマット解析に失敗した場合はそのまま続行
  }
  // "Lady Gaga, Bruno Mars" のようなカンマ区切りは先頭だけを使う
  const commaIndex = s.indexOf(',');
  if (commaIndex >= 0) {
    s = s.slice(0, commaIndex).trim();
  }
  s = s.replace(/^\s*(?:The|A|An)\s+/i, '').trim();
  s = s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`]/g, '')
    .replace(/[^A-Za-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return s;
}

/** music8 アーティスト JSON の URL */
export function getMusic8ArtistJsonUrl(artistName: string): string {
  const slug = artistNameToMusic8Slug(resolveArtistNameForMusic8Lookup(artistName));
  return slug ? `${MUSIC8_ARTISTS_BASE}/${slug}.json` : '';
}

/**
 * アーティスト表示名（The を付与）。ref: display_artist_name_with_the_prefix
 * thePrefix が "The" などなら "The " + name、否则 name のみ。
 */
export function formatArtistDisplayName(name: string, thePrefix?: string | null): string {
  const n = (name ?? '').trim();
  if (!n) return '';
  const prefix = (thePrefix ?? '').trim();
  if (prefix) return `${prefix} ${n}`;
  return n;
}

/**
 * 生年月日: artistborn を YYYY.MM.DD に整形。故人でなければ年齢 (age) を付与。
 * ref: category.php 137-156 行
 */
export function formatArtistBorn(
  artistborn?: string | null,
  artistdied?: string | null
): string {
  if (!artistborn || !artistborn.trim()) return '';
  const digits = artistborn.replace(/\D/g, '');
  if (digits.length < 8) return artistborn.trim();
  const y = digits.slice(0, 4);
  const m = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  const displayDate = `${y}.${m}.${d}`;
  const hasDied = Boolean(artistdied && String(artistdied).trim());
  if (hasDied) return displayDate;
  const birth = new Date(`${y}-${m}-${d}`);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const mDiff = today.getMonth() - birth.getMonth();
  if (mDiff < 0 || (mDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return `${displayDate} (${age})`;
}

/**
 * 永眠: artistdied を YYYY.MM.DD に整形。生年が分かれば享年を付与。
 * ref: category.php 159-181 行
 */
export function formatArtistDied(
  artistdied?: string | null,
  artistborn?: string | null
): string {
  if (!artistdied || !String(artistdied).trim()) return '';
  const digits = String(artistdied).replace(/\D/g, '');
  let diedDisplay = String(artistdied).trim();
  let ageAtDeath: number | null = null;
  if (digits.length >= 8) {
    const dy = digits.slice(0, 4);
    const dm = digits.slice(4, 6);
    const dd = digits.slice(6, 8);
    diedDisplay = `${dy}.${dm}.${dd}`;
    const death = new Date(`${dy}-${dm}-${dd}`);
    if (artistborn && artistborn.trim()) {
      const bornDigits = String(artistborn).replace(/\D/g, '');
      if (bornDigits.length >= 8) {
        const by = bornDigits.slice(0, 4);
        const bm = bornDigits.slice(4, 6);
        const bd = bornDigits.slice(6, 8);
        const birth = new Date(`${by}-${bm}-${bd}`);
        ageAtDeath = death.getFullYear() - birth.getFullYear();
      }
    }
  }
  let out = `永眠: ${diedDisplay}`;
  if (ageAtDeath !== null) out += ` (${ageAtDeath})`;
  return out;
}

/**
 * 活動期間表示: artistactiveyearstart と artistdied を "1971 - " または "1971 - 2024" 形式に。
 */
export function formatActiveYears(
  artistactiveyearstart?: string | null,
  artistdied?: string | null
): string {
  const start = (artistactiveyearstart ?? '').trim();
  if (!start) return '';
  const end = (artistdied ?? '').trim();
  if (end) {
    const digits = end.replace(/\D/g, '');
    if (digits.length >= 4) return `${start} - ${digits.slice(0, 4)}`;
    return `${start} - ${end}`;
  }
  return `${start} -`;
}

/**
 * Occupation: 配列なら label（または value）を ", " で連結。ref: category.php 60-76
 */
export function formatOccupation(occupation?: string | Music8OccupationItem[] | null): string {
  if (!occupation) return '';
  if (typeof occupation === 'string') return occupation.trim();
  if (!Array.isArray(occupation)) return '';
  const parts = occupation
    .map((item) => {
      if (item && typeof item === 'object') {
        const label = (item as Music8OccupationItem).label;
        const value = (item as Music8OccupationItem).value;
        return (label ?? value ?? '').trim();
      }
      return '';
    })
    .filter(Boolean);
  return parts.join(', ');
}

/**
 * Member: 配列から name を抽出して ", " で連結。ref: category.php 184-193
 */
export function formatMemberNames(member?: false | Music8MemberItem[] | Music8MemberItem | null): string[] {
  if (!member) return [];
  const list = Array.isArray(member) ? member : [member];
  return list
    .map((m) => (m && typeof m === 'object' && m.name ? String(m.name).trim() : ''))
    .filter(Boolean);
}

/**
 * description から日本語部分のみ取得（\r\n\r\n の後を想定）
 */
export function getJapaneseDescription(description?: string | null): string {
  if (!description || !description.trim()) return '';
  const parts = description.split(/\r\n\r\n|\n\n/);
  for (const p of parts) {
    const t = p.trim();
    if (/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff\uff00-\uffef]/.test(t)) return t;
  }
  return description.trim();
}

/**
 * 1行目:  artistjpname (Occupation) / Member名（thePrefix 付き）
 * 2行目:  Origin / 活動期間 / 生年月日（年齢 or 永眠）
 * ref: ユーザー提示の表示例 + category.php
 * カラム表示用に occupationDisplay, memberDisplay, origin, activeYears も返す。
 */
export function formatMusic8ArtistDisplayLines(artist: Music8ArtistJson): {
  line1: string;
  line2: string;
  descriptionJa: string;
  imageUrl: string | null;
  bornFormatted: string;
  diedFormatted: string;
  /** 名前のみ（日本語名 or display name） */
  nameDisplay: string;
  /** 職業（ラベル付き表示用） */
  occupationDisplay: string;
  /** 在籍バンド・メンバー名（カンマ区切り） */
  memberDisplay: string;
  /** 出身 */
  origin: string;
  /** 活動期間 */
  activeYears: string;
} {
  // music8 API は acf 内に artistorigin / artistborn / member 等を返すためマージして参照する
  const raw = artist as Record<string, unknown>;
  const acf = raw.acf;
  const acfObj =
    acf && typeof acf === 'object' && !Array.isArray(acf) ? (acf as Record<string, unknown>) : {};
  const source = { ...raw, ...acfObj } as Music8ArtistJson;

  const nameDisplay = formatArtistDisplayName(
    artist.name,
    artist.thePrefix ?? getArtistString(artist, 'the_prefix'),
  );
  const occupationRaw =
    source.occupation ?? (source as Record<string, unknown>).Occupation ?? null;
  const occupation = formatOccupation(
    occupationRaw as string | Music8OccupationItem[] | null | undefined,
  );
  const memberData = getArtistMember(source);
  const memberNames = formatMemberNames(memberData);
  const memberDisplay =
    memberNames.length > 0
      ? memberNames.map((n) => n).join(', ')
      : '';

  const nameOnly = (source.artistjpname ?? '').trim() || nameDisplay;
  let line1 = nameOnly;
  if (occupation) line1 += ` (${occupation})`;
  if (memberDisplay) line1 += ` / ${memberDisplay}`;

  const origin = getArtistString(source, 'artistorigin', 'artistorigin', 'artistOrigin', 'artist_origin');
  const artistBorn = getArtistString(source, 'artistborn', 'artistBorn', 'artist_born');
  const artistDied = getArtistString(source, 'artistdied', 'artistDied', 'artist_died');
  const activeYearStart = getArtistString(
    source,
    'artistactiveyearstart',
    'artistActiveYearStart',
    'artist_active_year_start'
  );
  const activeYears = formatActiveYears(activeYearStart, artistDied || undefined);
  const bornFormatted = formatArtistBorn(artistBorn || undefined, artistDied || undefined);
  const diedFormatted = formatArtistDied(artistDied || undefined, artistBorn || undefined);

  const line2Parts = [origin, activeYears, bornFormatted].filter(Boolean);
  const line2 = line2Parts.join(' / ');

  const imageRaw =
    source.spotify_artist_images ??
    (source as Record<string, unknown>).spotifyArtistImages ??
    null;
  const imageUrl =
    typeof imageRaw === 'string' && imageRaw.trim() ? imageRaw.trim() : null;

  return {
    line1,
    line2,
    descriptionJa: getJapaneseDescription(artist.description),
    imageUrl,
    bornFormatted,
    diedFormatted,
    nameDisplay: nameOnly,
    occupationDisplay: occupation,
    memberDisplay,
    origin,
    activeYears,
  };
}

/**
 * MusicBrainz recording 検索 — 邦楽ライト DB 向けメタ（表記・日付・ジャンル・日本語読み）。
 * 1 リクエストで recording 検索（musicbrainz-artist-area と同一スロットル）。
 * 日本語読みはヒット recording の aliases を追加取得（+1 req）。
 */

import { scheduleMusicBrainzRequest } from '@/lib/musicbrainz-artist-area';

const MIN_RECORDING_SCORE = 88;
const SEARCH_LIMIT = '6';

function escapeLucenePhrase(s: string): string {
  return s.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

type MbArtistCredit = {
  name?: string;
  artist?: { name?: string };
};

export type MbRecordingAlias = {
  name?: string;
  'sort-name'?: string;
  locale?: string | null;
  primary?: boolean | null;
  type?: string | null;
};

type MbRecording = {
  id?: string;
  score?: number;
  title?: string;
  'first-release-date'?: string;
  'artist-credit'?: MbArtistCredit[];
  releases?: Array<{ date?: string; status?: string }>;
  genres?: Array<{ name?: string; count?: number }>;
  tags?: Array<{ name?: string; count?: number }>;
  aliases?: MbRecordingAlias[];
};

type RecordingSearchJson = {
  recordings?: MbRecording[];
};

export type MusicBrainzRecordingMetadata = {
  mainArtist: string;
  songTitle: string;
  displayTitle: string;
  originalReleaseDate: string | null;
  genres: string[];
  recordingScore: number;
  /** 英語タイトル等の日本語読み（カタカナ優先）。aliases 由来 */
  songTitleJa: string | null;
  recordingId: string | null;
};

function hasKana(s: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF]/.test(s);
}

function hasJapaneseScript(s: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(s);
}

/**
 * recording aliases からライブラリ検索用の日本語読みを選ぶ。
 * 優先: ja ロケールのカナ表記 → ja の sort-name（カナ）→ その他 alias のカナ sort-name / name
 */
export function pickSongTitleJaFromAliases(
  aliases: MbRecordingAlias[] | null | undefined,
  canonicalTitle?: string | null,
): string | null {
  if (!Array.isArray(aliases) || aliases.length === 0) return null;
  const canon = (canonicalTitle ?? '').trim().toLowerCase();

  const scoreAlias = (a: MbRecordingAlias): number => {
    const locale = (a.locale ?? '').toLowerCase();
    let s = 0;
    if (locale.startsWith('ja')) s += 100;
    if (a.primary === true) s += 20;
    return s;
  };

  const ranked = [...aliases].sort((a, b) => scoreAlias(b) - scoreAlias(a));

  const consider = (raw: string): string | null => {
    const t = raw.trim().replace(/\s+/g, ' ');
    if (!t || t.length > 200) return null;
    if (canon && t.toLowerCase() === canon) return null;
    return t;
  };

  for (const a of ranked) {
    const name = typeof a.name === 'string' ? a.name : '';
    const sort = typeof a['sort-name'] === 'string' ? a['sort-name'] : '';

    if (hasKana(name)) {
      const v = consider(name);
      if (v) return v;
    }
    if (hasKana(sort)) {
      const v = consider(sort);
      if (v) return v;
    }
    if (hasJapaneseScript(name)) {
      // 漢字タイトル: 読みが sort-name にあればそれを優先
      if (hasKana(sort)) {
        const v = consider(sort);
        if (v) return v;
      }
      const v = consider(name);
      if (v) return v;
    }
  }

  return null;
}

function pickEarliestReleaseDateIso(dates: string[]): string | null {
  const valid = dates
    .map((d) => d.trim())
    .filter((d) => /^\d{4}(-\d{2}(-\d{2})?)?$/.test(d))
    .sort();
  if (valid.length === 0) return null;
  const first = valid[0]!;
  if (/^\d{4}$/.test(first)) return `${first}-01-01`;
  if (/^\d{4}-\d{2}$/.test(first)) return `${first}-01`;
  return first;
}

function recordingMeetsMinScore(rec: MbRecording): boolean {
  return typeof rec.score === 'number' && rec.score >= MIN_RECORDING_SCORE;
}

function pickBestScoredRecording(recordings: MbRecording[]): MbRecording | null {
  let best: MbRecording | null = null;
  for (const rec of recordings) {
    if (!recordingMeetsMinScore(rec)) continue;
    if (!best || (rec.score ?? 0) > (best.score ?? 0)) best = rec;
  }
  return best;
}

function pickGenresFromRecording(rec: MbRecording, max = 5): string[] {
  const scores = new Map<string, number>();
  const bump = (nameRaw: string | undefined, countRaw: number | undefined) => {
    const name = typeof nameRaw === 'string' ? nameRaw.trim().toLowerCase() : '';
    if (!name) return;
    const score = typeof countRaw === 'number' && Number.isFinite(countRaw) ? countRaw : 1;
    scores.set(name, (scores.get(name) ?? 0) + score);
  };
  for (const g of rec.genres ?? []) bump(g.name, g.count);
  for (const t of rec.tags ?? []) bump(t.name, t.count);
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([name]) => name);
}

function artistCreditLabel(rec: MbRecording): string | null {
  const credits = rec['artist-credit'];
  if (!Array.isArray(credits) || credits.length === 0) return null;
  const joined = credits
    .map((c) => (typeof c.name === 'string' ? c.name.trim() : c.artist?.name?.trim()) ?? '')
    .filter(Boolean)
    .join(', ');
  return joined || null;
}

function extractReleaseDates(rec: MbRecording): string[] {
  const dates: string[] = [];
  if (typeof rec['first-release-date'] === 'string' && rec['first-release-date'].trim()) {
    dates.push(rec['first-release-date'].trim());
  }
  for (const rel of rec.releases ?? []) {
    if (rel.status && rel.status !== 'Official') continue;
    if (typeof rel.date === 'string' && rel.date.trim()) dates.push(rel.date.trim());
  }
  return dates;
}

/** 原盤公開日: スタジオ盤を優先し、無ければ全ヒットの最古日（ライブのみのとき） */
function pickOriginalReleaseDateFromRecordings(recordings: MbRecording[]): string | null {
  const studioDates: string[] = [];
  const allDates: string[] = [];
  for (const rec of recordings) {
    if (!recordingMeetsMinScore(rec)) continue;
    const dates = extractReleaseDates(rec);
    if (dates.length === 0) continue;
    allDates.push(...dates);
    const title = typeof rec.title === 'string' ? rec.title : '';
    if (!/\b(live|ライヴ|ライブ|bootleg|demo|karaoke|instrumental)\b/i.test(title)) {
      studioDates.push(...dates);
    }
  }
  return pickEarliestReleaseDateIso(studioDates.length > 0 ? studioDates : allDates);
}

export function parseMusicBrainzRecordingMetadataFromSearch(
  data: RecordingSearchJson,
): MusicBrainzRecordingMetadata | null {
  const recordings = data.recordings ?? [];
  const rec = pickBestScoredRecording(recordings);
  if (!rec) return null;

  const mainArtist = artistCreditLabel(rec);
  const songTitle = typeof rec.title === 'string' ? rec.title.trim() : '';
  if (!mainArtist || !songTitle) return null;

  const recordingId = typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : null;
  const songTitleJa = pickSongTitleJaFromAliases(rec.aliases, songTitle);

  return {
    mainArtist,
    songTitle,
    displayTitle: `${mainArtist} - ${songTitle}`,
    originalReleaseDate: pickOriginalReleaseDateFromRecordings(recordings),
    genres: pickGenresFromRecording(rec),
    recordingScore: rec.score ?? 0,
    songTitleJa,
    recordingId,
  };
}

async function fetchRecordingAliases(
  recordingId: string,
  ua: string,
): Promise<MbRecordingAlias[]> {
  const url = new URL(`https://musicbrainz.org/ws/2/recording/${encodeURIComponent(recordingId)}`);
  url.searchParams.set('inc', 'aliases');
  url.searchParams.set('fmt', 'json');

  const data = await scheduleMusicBrainzRequest(async () => {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': ua },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as { aliases?: MbRecordingAlias[] };
  });

  return Array.isArray(data?.aliases) ? data.aliases : [];
}

/**
 * アーティスト名＋曲名で MB recording を検索。ヒット時は表記・日付・ジャンル・日本語読みを返す。
 */
export async function fetchMusicBrainzRecordingMetadata(
  artistName: string,
  recordingTitle: string,
): Promise<MusicBrainzRecordingMetadata | null> {
  if (process.env.MUSICBRAINZ_LOOKUP === '0') return null;
  const ua = process.env.MUSICBRAINZ_USER_AGENT?.trim();
  if (!ua) return null;

  const a = artistName.trim();
  const t = recordingTitle.trim();
  if (a.length < 1 || t.length < 1 || a.length > 200 || t.length > 200) return null;

  const aq = escapeLucenePhrase(a);
  const tq = escapeLucenePhrase(t);
  if (!aq || !tq) return null;

  const url = new URL('https://musicbrainz.org/ws/2/recording');
  url.searchParams.set('query', `artist:"${aq}" AND recording:"${tq}"`);
  url.searchParams.set('fmt', 'json');
  url.searchParams.set('limit', SEARCH_LIMIT);

  try {
    const data = await scheduleMusicBrainzRequest(async () => {
      const res = await fetch(url.toString(), {
        headers: { Accept: 'application/json', 'User-Agent': ua },
        cache: 'no-store',
      });
      if (!res.ok) return null;
      return (await res.json()) as RecordingSearchJson;
    });
    if (!data?.recordings?.length) return null;
    const meta = parseMusicBrainzRecordingMetadataFromSearch(data);
    if (!meta) return null;

    if (!meta.songTitleJa && meta.recordingId) {
      try {
        const aliases = await fetchRecordingAliases(meta.recordingId, ua);
        const ja = pickSongTitleJaFromAliases(aliases, meta.songTitle);
        if (ja) return { ...meta, songTitleJa: ja };
      } catch (e) {
        console.warn(
          '[musicbrainz-recording-metadata] aliases fetch failed',
          e instanceof Error ? e.message : e,
        );
      }
    }

    return meta;
  } catch (e) {
    console.warn(
      '[musicbrainz-recording-metadata] fetch failed',
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

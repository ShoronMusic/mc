/**
 * 曲解説用: MusicBrainz の recording 検索（埋め込み releases）から
 * アルバム／シングル名と年だけを抜き、LLM に渡す「事実ブロック」を組み立てる。
 *
 * - musicbrainz-title-order / artist-area と同じスロットル・UA を使う。
 * - MUSICBRAINZ_LOOKUP=0 または MUSICBRAINZ_COMMENTARY_FACTS=0 でオフ。
 *
 * API: https://musicbrainz.org/doc/MusicBrainz_API/Search/RecordingSearch
 */

import { scheduleMusicBrainzRequest } from '@/lib/musicbrainz-artist-area';

function escapeLucenePhrase(s: string): string {
  return s.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

type MbReleaseGroupLite = {
  id?: string;
  title?: string;
  'primary-type'?: string | null;
  'secondary-types'?: string[] | null;
  'first-release-date'?: string | null;
};

type MbReleaseLite = {
  status?: string;
  title?: string;
  date?: string;
  'release-group'?: MbReleaseGroupLite;
};

type MbSearchRecording = {
  score?: number;
  releases?: MbReleaseLite[];
};

type RecordingSearchJson = {
  recordings?: MbSearchRecording[];
};

export type MbReleaseGroupSummary = {
  id: string;
  title: string;
  primaryType: string;
  secondaryTypes: string[];
  firstReleaseDate: string | null;
};

const MIN_RECORDING_SCORE = 88;
const SEARCH_LIMIT = '8';

function extractYear(iso: string | null | undefined): string | null {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/^(\d{4})/);
  return m ? m[1] : null;
}

/** 検索レスポンスから release-group を集める（lookup は増やさない） */
export function extractReleaseGroupsFromRecordingSearch(data: RecordingSearchJson): MbReleaseGroupSummary[] {
  const candidates: MbReleaseGroupSummary[] = [];

  for (const rec of data.recordings ?? []) {
    if (typeof rec.score === 'number' && rec.score < MIN_RECORDING_SCORE) continue;
    for (const rel of rec.releases ?? []) {
      if (rel.status && rel.status !== 'Official') continue;
      const rg = rel['release-group'];
      if (!rg) continue;
      const id = rg.id?.trim();
      const title = rg.title?.trim();
      if (!id || !title) continue;

      const secondary = Array.isArray(rg['secondary-types'])
        ? (rg['secondary-types'] as string[]).filter(Boolean)
        : [];
      const primary = (rg['primary-type'] ?? '').trim() || 'Album';
      const frd = rg['first-release-date']?.trim() ?? null;
      const year = extractYear(rel.date) ?? extractYear(frd);
      candidates.push({
        id,
        title,
        primaryType: primary,
        secondaryTypes: secondary,
        firstReleaseDate: year,
      });
    }
  }

  const byId = new Map<string, MbReleaseGroupSummary>();
  for (const c of candidates) {
    const prev = byId.get(c.id);
    if (!prev) {
      byId.set(c.id, { ...c });
      continue;
    }
    const y = c.firstReleaseDate ?? '';
    const py = prev.firstReleaseDate ?? '';
    if (y && (!py || y < py)) {
      byId.set(c.id, { ...c });
    }
  }

  return Array.from(byId.values());
}

/**
 * コンピ・ライブを、スタジオアルバム／シングルがあるときは落とす。
 */
export function filterReleaseGroupsForCommentary(groups: MbReleaseGroupSummary[]): MbReleaseGroupSummary[] {
  const isComp = (g: MbReleaseGroupSummary) => g.secondaryTypes.includes('Compilation');
  const isLive = (g: MbReleaseGroupSummary) => g.secondaryTypes.includes('Live');

  const hasStudioLike = groups.some((g) => !isComp(g) && !isLive(g));
  if (hasStudioLike) {
    return groups.filter((g) => !isComp(g) && !isLive(g));
  }
  return groups;
}

function sortKey(g: MbReleaseGroupSummary): number {
  if (g.primaryType === 'Album') return 0;
  if (g.primaryType === 'Single') return 1;
  return 2;
}

export function sortReleaseGroupsForCommentary(groups: MbReleaseGroupSummary[]): MbReleaseGroupSummary[] {
  return [...groups].sort((a, b) => {
    const d = sortKey(a) - sortKey(b);
    if (d !== 0) return d;
    const ya = a.firstReleaseDate ?? '9999';
    const yb = b.firstReleaseDate ?? '9999';
    return ya.localeCompare(yb);
  });
}

/** 日本語の箇条書き（プロンプト用） */
export function formatMusicBrainzFactsBlock(groups: MbReleaseGroupSummary[], maxLines = 4): string | null {
  const slice = groups.slice(0, maxLines);
  if (!slice.length) return null;

  const lines = slice.map((g) => {
    const y = g.firstReleaseDate ?? '年不明';
    let kind = 'リリース';
    if (g.primaryType === 'Album') kind = 'アルバム';
    else if (g.primaryType === 'Single') kind = 'シングル';
    else if (g.primaryType === 'EP') kind = 'EP';
    return `・${kind}『${g.title}』（${y}年）`;
  });

  lines.push(
    '・地域盤・別タイトル盤は MusicBrainz 上では別のリリースグループになることがあります。上記に無い盤名は補完しないでください。',
  );
  return lines.join('\n');
}

/**
 * アーティスト名＋曲名で MB を検索し、曲解説用の事実ブロックを返す。失敗時は null。
 */
export async function fetchMusicBrainzCommentaryFactsBlock(
  artistName: string,
  recordingTitle: string,
): Promise<string | null> {
  if (
    process.env.MUSICBRAINZ_LOOKUP === '0' ||
    process.env.MUSICBRAINZ_COMMENTARY_FACTS === '0'
  ) {
    return null;
  }
  const ua = process.env.MUSICBRAINZ_USER_AGENT?.trim();
  if (!ua) return null;

  const a = artistName.trim();
  const t = recordingTitle.trim();
  if (a.length < 2 || t.length < 1 || a.length > 200 || t.length > 200) return null;

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

    const raw = extractReleaseGroupsFromRecordingSearch(data);
    const filtered = filterReleaseGroupsForCommentary(raw);
    if (!filtered.length) return null;
    const sorted = sortReleaseGroupsForCommentary(filtered);
    return formatMusicBrainzFactsBlock(sorted);
  } catch (e) {
    console.warn(
      '[musicbrainz-commentary-facts] fetch failed',
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

/**
 * 「A - B」形式でチャンネルと一致せず両方アーティストっぽいときだけ、MusicBrainz 録音検索で
 * アーティスト／曲名の順を補正する（最大2回連続検索・musicbrainz-artist-area と同一スロットル）。
 *
 * MUSICBRAINZ_USER_AGENT 必須。MUSICBRAINZ_LOOKUP=0 または MUSICBRAINZ_TITLE_ORDER=0 でオフ。
 *
 * API: https://musicbrainz.org/doc/MusicBrainz_API/Search/RecordingSearch
 */

import { scheduleMusicBrainzRequest } from '@/lib/musicbrainz-artist-area';

function escapeLucenePhrase(s: string): string {
  return s.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

type RecordingSearchResponse = {
  recordings?: Array<{ score?: number }>;
};

async function recordingArtistTitleSearchScore(
  artist: string,
  recording: string,
  userAgent: string,
): Promise<number> {
  const a = escapeLucenePhrase(artist);
  const r = escapeLucenePhrase(recording);
  if (!a || !r || a.length > 200 || r.length > 200) return 0;

  const query = `artist:"${a}" AND recording:"${r}"`;
  const url = new URL('https://musicbrainz.org/ws/2/recording');
  url.searchParams.set('query', query);
  url.searchParams.set('fmt', 'json');
  url.searchParams.set('limit', '5');

  try {
    const data = await scheduleMusicBrainzRequest(async () => {
      const res = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'User-Agent': userAgent,
        },
        cache: 'no-store',
      });
      if (!res.ok) return null;
      return (await res.json()) as RecordingSearchResponse;
    });
    const top = data?.recordings?.[0];
    return typeof top?.score === 'number' ? top.score : 0;
  } catch (e) {
    console.warn('[musicbrainz-title-order] search failed', e instanceof Error ? e.message : e);
    return 0;
  }
}

export type MusicBrainzTitleOrderHint = 'left_is_artist' | 'right_is_artist';

/**
 * left をアーティスト・right を曲名とした検索 vs 逆のスコアを比較。
 * どちらかが十分高く差があれば順序を返す。不確実なら null（呼び出し側は従来ヒューリスティック）。
 */
export async function resolveTitleOrderWithMusicBrainz(
  left: string,
  right: string,
): Promise<MusicBrainzTitleOrderHint | null> {
  if (process.env.MUSICBRAINZ_LOOKUP === '0' || process.env.MUSICBRAINZ_TITLE_ORDER === '0') {
    return null;
  }
  const ua = process.env.MUSICBRAINZ_USER_AGENT?.trim();
  if (!ua) return null;

  const sLeftArtist = await recordingArtistTitleSearchScore(left, right, ua);
  const sRightArtist = await recordingArtistTitleSearchScore(right, left, ua);

  const MIN_SCORE = 82;
  const MIN_GAP = 7;

  if (sLeftArtist >= MIN_SCORE && sLeftArtist >= sRightArtist + MIN_GAP) return 'left_is_artist';
  if (sRightArtist >= MIN_SCORE && sRightArtist >= sLeftArtist + MIN_GAP) return 'right_is_artist';
  return null;
}

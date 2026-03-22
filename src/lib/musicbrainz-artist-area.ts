/**
 * MusicBrainz API でアーティストの出身・活動地域が日本かどうかを参照する（邦楽節約の補助判定）。
 *
 * 利用規約: https://musicbrainz.org/doc/MusicBrainz_API
 * - 非商用は無料。User-Agent にアプリ名・連絡先を含めること。
 * - 原則 1 秒に 1 リクエストまで（全インスタンス共通の単純スロットル）。
 *
 * 環境変数:
 * - MUSICBRAINZ_USER_AGENT … 未設定なら MusicBrainz を呼ばない（例: musicaichat/0.1.0 ( https://example.com )）
 * - MUSICBRAINZ_LOOKUP=0 … MusicBrainz 参照をオフ（日本語メタデータ判定のみ）
 */

const MB_WS = 'https://musicbrainz.org/ws/2/artist';

/** MusicBrainz 推奨に沿った最小間隔（ms） */
const MIN_INTERVAL_MS = 1100;

let lastRequestTime = 0;
let throttleChain: Promise<unknown> = Promise.resolve();

/** recording 検索など他モジュールと共有（1 req/s 遵守） */
export function scheduleMusicBrainzRequest<T>(fn: () => Promise<T>): Promise<T> {
  const next = throttleChain.then(async () => {
    const now = Date.now();
    const wait = Math.max(0, lastRequestTime + MIN_INTERVAL_MS - now);
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    lastRequestTime = Date.now();
    return fn();
  });
  throttleChain = next.catch(() => undefined);
  return next;
}

export type MusicBrainzArtistSearchHit = {
  score?: number;
  country?: string | null;
  area?: {
    name?: string | null;
    'iso-3166-1-codes'?: string[] | null;
  } | null;
};

/**
 * 検索結果1件から「日本のアーティスト」とみなせるか（純粋関数・テスト用）
 */
export function musicBrainzHitIndicatesJapan(
  hit: MusicBrainzArtistSearchHit,
  minScore: number,
): boolean {
  if (typeof hit.score === 'number' && hit.score < minScore) return false;
  if (hit.country === 'JP') return true;
  const codes = hit.area?.['iso-3166-1-codes'];
  if (Array.isArray(codes) && codes.some((c) => c === 'JP')) return true;
  const n = hit.area?.name?.trim().toLowerCase();
  if (n === 'japan') return true;
  return false;
}

function escapeLucenePhrase(s: string): string {
  return s.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildArtistSearchQuery(artistName: string): string {
  const inner = escapeLucenePhrase(artistName);
  if (!inner) return '';
  return `artist:"${inner}"`;
}

type SearchResponse = {
  artists?: MusicBrainzArtistSearchHit[];
};

/**
 * アーティスト名で検索し、最もスコアの高い候補が日本なら true。
 * 呼び出し不可・エラー・不確実なときは false。
 */
export async function isJapaneseArtistByMusicBrainzLookup(artistName: string | null | undefined): Promise<boolean> {
  if (process.env.MUSICBRAINZ_LOOKUP === '0') return false;
  const ua = process.env.MUSICBRAINZ_USER_AGENT?.trim();
  if (!ua) return false;

  const q = typeof artistName === 'string' ? artistName.trim() : '';
  if (q.length < 2 || q.length > 200) return false;

  const query = buildArtistSearchQuery(q);
  if (!query) return false;

  const url = new URL(MB_WS);
  url.searchParams.set('query', query);
  url.searchParams.set('fmt', 'json');
  url.searchParams.set('limit', '5');

  try {
    const data = await scheduleMusicBrainzRequest(async () => {
      const res = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'User-Agent': ua,
        },
        cache: 'no-store',
      });
      if (!res.ok) return null;
      return (await res.json()) as SearchResponse;
    });

    if (!data?.artists?.length) return false;

    const MIN_SCORE = 85;
    const top = data.artists[0];
    if (!top || typeof top.score !== 'number') return false;
    return musicBrainzHitIndicatesJapan(top, MIN_SCORE);
  } catch (e) {
    console.warn('[musicbrainz-artist-area] lookup failed', e instanceof Error ? e.message : e);
    return false;
  }
}

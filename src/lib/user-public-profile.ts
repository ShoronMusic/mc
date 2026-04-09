/**
 * 他ユーザー向け自己紹介（部屋などで表示用・オプトイン）。
 */

export const USER_PUBLIC_PROFILE_TAGLINE_MAX = 200;
export const USER_PUBLIC_PROFILE_LISTENING_MAX = 300;
export const USER_PUBLIC_PROFILE_ARTIST_SLOTS = 5;
export const USER_PUBLIC_PROFILE_ARTIST_EACH_MAX = 80;

export type UserPublicProfilePayload = {
  visibleInRooms: boolean;
  tagline: string;
  favoriteArtists: string[];
  listeningNote: string;
};

export function normalizeFavoriteArtistsInput(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== 'string') continue;
    const t = x.trim().slice(0, USER_PUBLIC_PROFILE_ARTIST_EACH_MAX);
    if (t) out.push(t);
    if (out.length >= USER_PUBLIC_PROFILE_ARTIST_SLOTS) break;
  }
  return out;
}

export function normalizeUserPublicProfileBody(body: unknown):
  | { ok: true; value: UserPublicProfilePayload }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'JSON オブジェクトが必要です。' };
  }
  const o = body as Record<string, unknown>;

  const visibleInRooms = o.visibleInRooms === true;

  const taglineRaw = typeof o.tagline === 'string' ? o.tagline.replace(/\r\n/g, '\n').trim() : '';
  if (taglineRaw.length > USER_PUBLIC_PROFILE_TAGLINE_MAX) {
    return { ok: false, error: `一言は最大 ${USER_PUBLIC_PROFILE_TAGLINE_MAX} 文字です。` };
  }

  const listeningRaw =
    typeof o.listeningNote === 'string' ? o.listeningNote.replace(/\r\n/g, '\n').trim() : '';
  if (listeningRaw.length > USER_PUBLIC_PROFILE_LISTENING_MAX) {
    return { ok: false, error: `補足は最大 ${USER_PUBLIC_PROFILE_LISTENING_MAX} 文字です。` };
  }

  const favoriteArtists = normalizeFavoriteArtistsInput(o.favoriteArtists);

  return {
    ok: true,
    value: {
      visibleInRooms,
      tagline: taglineRaw,
      favoriteArtists,
      listeningNote: listeningRaw,
    },
  };
}

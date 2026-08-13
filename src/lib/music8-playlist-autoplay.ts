/**
 * Music8 プレイリスト専用オートプレイキューの状態ヘルパー（UI 副作用なし）。
 */

export type Music8PlaylistAutoplaySong = {
  videoId: string;
  title: string;
  artist: string;
  music8SongId?: number;
};

export type Music8PlaylistAutoplayState = {
  slug: string;
  title: string;
  songs: Music8PlaylistAutoplaySong[];
  sourceLabel?: string;
  orderLabel?: string;
  /** 現在再生中の index */
  index: number;
  startedAt: string;
  /** 特集ページ経由（AI無料検証用） */
  featuredPageId?: string;
  featuredAiUsageFree?: boolean;
};

export function createMusic8PlaylistAutoplayState(params: {
  slug: string;
  title: string;
  songs: Music8PlaylistAutoplaySong[];
  sourceLabel?: string;
  orderLabel?: string;
  featuredPageId?: string;
  featuredAiUsageFree?: boolean;
}): Music8PlaylistAutoplayState | null {
  if (!params.songs.length) return null;
  return {
    slug: params.slug,
    title: params.title,
    songs: params.songs,
    ...(params.sourceLabel ? { sourceLabel: params.sourceLabel } : {}),
    ...(params.orderLabel ? { orderLabel: params.orderLabel } : {}),
    ...(params.featuredPageId ? { featuredPageId: params.featuredPageId } : {}),
    ...(params.featuredAiUsageFree ? { featuredAiUsageFree: true } : {}),
    index: 0,
    startedAt: new Date().toISOString(),
  };
}

export function getMusic8PlaylistCurrentSong(
  state: Music8PlaylistAutoplayState | null,
): Music8PlaylistAutoplaySong | null {
  if (!state) return null;
  return state.songs[state.index] ?? null;
}

/** 現在曲が終わったあと次へ進める。終端なら null。 */
export function advanceMusic8PlaylistAutoplay(
  state: Music8PlaylistAutoplayState,
): Music8PlaylistAutoplayState | null {
  const nextIndex = state.index + 1;
  if (nextIndex >= state.songs.length) return null;
  return { ...state, index: nextIndex };
}

/**
 * 連続再生キュー内の任意 index へ移動（前の曲へ戻る／別曲指定）。
 * 範囲外なら null。同じ index でも state のコピーを返す（再再生用）。
 */
export function jumpMusic8PlaylistAutoplay(
  state: Music8PlaylistAutoplayState,
  index: number,
): Music8PlaylistAutoplayState | null {
  if (!Number.isInteger(index) || index < 0 || index >= state.songs.length) return null;
  return { ...state, index };
}

/** ライブラリ／特集のアーティスト全曲選曲キューか（slug が library-） */
export function isLibraryArtistPlaylistAutoplay(
  state: Music8PlaylistAutoplayState | null | undefined,
): boolean {
  if (!state) return false;
  return state.slug.startsWith('library-');
}

/** 参加者欄の曲ジャンプボタン表記 */
export function playlistAutoplaySongPickButtonLabel(
  state: Music8PlaylistAutoplayState | null | undefined,
): 'ライブラリ' | '再生リスト' {
  return isLibraryArtistPlaylistAutoplay(state) ? 'ライブラリ' : '再生リスト';
}

/** 曲ジャンプモーダル見出し */
export function playlistAutoplaySongPickModalHeading(
  state: Music8PlaylistAutoplayState | null | undefined,
): string {
  return isLibraryArtistPlaylistAutoplay(state) ? 'ライブラリ曲リスト' : '再生リスト曲リスト';
}

export function isMusic8PlaylistAutoplayCurrentVideo(
  state: Music8PlaylistAutoplayState | null,
  videoId: string | null | undefined,
): boolean {
  if (!state || !videoId) return false;
  const cur = state.songs[state.index];
  return Boolean(cur && cur.videoId === videoId);
}

export function formatMusic8PlaylistStartMessage(params: {
  title: string;
  songCount: number;
  sourceLabel?: string;
  orderLabel?: string;
  truncated?: boolean;
  totalFetched?: number;
}): string {
  const sourceLabel = params.sourceLabel?.trim() || 'Music8';
  const orderLabel = params.orderLabel?.trim() || '公開日が新しい順';
  const base = `${sourceLabel}「${params.title}」${params.songCount}曲を連続再生します（${orderLabel}）`;
  if (params.truncated && params.totalFetched != null && params.totalFetched > params.songCount) {
    return `${base}。全${params.totalFetched}曲中、先頭${params.songCount}曲まで再生します`;
  }
  return base;
}

/** 曲ごとの進捗行（例: Music8「Pop//New wave」2/13曲目: Olivia Rodrigo - expectations） */
export function formatMusic8PlaylistTrackMessage(
  state: Music8PlaylistAutoplayState,
): string | null {
  const song = state.songs[state.index];
  if (!song) return null;
  const sourceLabel = state.sourceLabel?.trim() || 'Music8';
  const pos = `${state.index + 1}/${state.songs.length}曲目`;
  const label = [song.artist, song.title].filter(Boolean).join(' - ');
  return `${sourceLabel}「${state.title}」${pos}${label ? `: ${label}` : ''}`;
}

export const MUSIC8_PLAYLIST_STOPPED_MESSAGE = 'Music8プレイリストの連続再生を止めました。';
export const MUSIC8_PLAYLIST_FINISHED_MESSAGE = 'Music8プレイリストの連続再生が終わりました。';

export function formatMusic8PlaylistStoppedMessage(
  state: Music8PlaylistAutoplayState | null,
): string {
  const sourceLabel = state?.sourceLabel?.trim() || 'Music8';
  return `${sourceLabel}プレイリストの連続再生を止めました。`;
}

export function formatMusic8PlaylistFinishedMessage(
  state: Music8PlaylistAutoplayState | null,
): string {
  const sourceLabel = state?.sourceLabel?.trim() || 'Music8';
  return `${sourceLabel}プレイリストの連続再生が終わりました。`;
}

/** 再生不可（削除・埋め込み不可など）で次曲へ進むときの一行 */
export function formatMusic8PlaylistSkipUnplayableMessage(
  state: Music8PlaylistAutoplayState | null,
  song?: Music8PlaylistAutoplaySong | null,
): string {
  const sourceLabel = state?.sourceLabel?.trim() || 'Music8';
  const label = song
    ? [song.artist, song.title].map((s) => s?.trim()).filter(Boolean).join(' - ')
    : '';
  if (label) {
    return `${sourceLabel}: 再生できないためスキップしました（${label}）`;
  }
  return `${sourceLabel}: 再生できない動画をスキップし、次の曲へ進みます。`;
}

/** ユーザーが「次曲へ」を押したとき */
export function formatMusic8PlaylistManualNextMessage(
  state: Music8PlaylistAutoplayState | null,
): string {
  const sourceLabel = state?.sourceLabel?.trim() || 'Music8';
  return `${sourceLabel}: この曲をスキップして次の曲へ進みます。`;
}

/** ユーザーが曲リストから任意曲を指定したとき */
export function formatMusic8PlaylistJumpMessage(
  state: Music8PlaylistAutoplayState | null,
): string {
  const sourceLabel = state?.sourceLabel?.trim() || 'Music8';
  const song = state ? state.songs[state.index] : null;
  const label = song
    ? [song.artist, song.title].map((s) => s?.trim()).filter(Boolean).join(' - ')
    : '';
  if (label) {
    return `${sourceLabel}: 曲リストから「${label}」を指定して再生します。`;
  }
  return `${sourceLabel}: 曲リストから指定した曲を再生します。`;
}

/** YouTube IFrame API onError の data。連続再生ではいずれも次曲スキップ対象。 */
export function isYoutubePlayerErrorWorthPlaylistSkip(errorCode: number): boolean {
  return Number.isFinite(errorCode);
}

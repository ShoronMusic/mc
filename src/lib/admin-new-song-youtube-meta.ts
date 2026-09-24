/**
 * 洋楽 1 曲登録: Chrome 拡張が watch ページのイベント／場所 UI を
 * 曲名・アーティストとして渡したときの補正。
 */
import { getArtistAndSong, getArtistDisplayString } from '@/lib/format-song-display';

const EVENT_CHROME_RE =
  /一番近いイベント|近くのイベント|開催予定のイベント|nearest event|upcoming events?|get tickets|チケットを購入|ツアー日程|concerts? near/i;

const PLACE_RE =
  /オーストラリア|Australia|\bQLD\b|\bNSW\b|\bVIC\b|United States|United Kingdom|カナダ|Canada/;

export function looksLikeYoutubeWatchPageChromeMeta(artist: string, title: string): boolean {
  const a = artist.trim();
  const t = title.trim();
  if (EVENT_CHROME_RE.test(a) || EVENT_CHROME_RE.test(t)) return true;
  if (PLACE_RE.test(a) && /イベント|events?|会場|tickets?/i.test(t)) return true;
  if (PLACE_RE.test(t) && /イベント|events?|会場|tickets?/i.test(a)) return true;
  return false;
}

function foldTitleForAgree(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019'`´]/g, '')
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, '');
}

/** 拡張が Official Video 等を落とした曲名でも、YouTube タイトルと同じ曲なら true */
export function queryTitleAgreesWithYoutubeTitle(queryTitle: string, youtubeTitle: string): boolean {
  const q = foldTitleForAgree(queryTitle);
  const y = foldTitleForAgree(youtubeTitle);
  if (!q || !y) return false;
  if (q === y) return true;
  const min = /[a-z0-9]/.test(q) ? 4 : 2;
  // 「Stay」⊂「Stay With Me」のように、With 付き曲名の前方切り落としは不一致
  if (q.length >= min && y.includes(`${q}with`)) return false;
  if (q.length >= min && y.includes(q)) return true;
  if (y.length >= min && q.includes(y)) return true;
  return false;
}

/** YouTube 曲名が Stay With … のとき、With 以降をサブアーティストにしない */
export function youtubeSongTitleKeepsWithAsTitle(song: string): boolean {
  return /\bstay\s+with\s+\S+/i.test(song.trim());
}

export function resolveAdminNewSongMetaFromYoutube(input: {
  queryArtist: string;
  queryTitle: string;
  youtubeTitle: string | null | undefined;
  youtubeChannelTitle: string | null | undefined;
}): { artist: string; title: string; corrected: boolean } {
  const queryArtist = input.queryArtist.trim();
  const queryTitle = input.queryTitle.trim();
  const youtubeTitle = (input.youtubeTitle ?? '').trim();
  const channel = (input.youtubeChannelTitle ?? '').trim();

  if (!youtubeTitle) {
    return { artist: queryArtist, title: queryTitle, corrected: false };
  }

  const junk = looksLikeYoutubeWatchPageChromeMeta(queryArtist, queryTitle);
  const parsed = getArtistAndSong(youtubeTitle, channel || null);
  let artistRaw = (parsed.artistDisplay || parsed.artist || channel || queryArtist).trim();
  let artist = getArtistDisplayString(artistRaw) || artistRaw;
  let title = (parsed.song || youtubeTitle).trim();
  const droppedStayWith =
    youtubeSongTitleKeepsWithAsTitle(title) && !/\bwith\b/i.test(queryTitle);
  const agrees = queryTitleAgreesWithYoutubeTitle(queryTitle, youtubeTitle);

  /* 拡張がアーティスト空で開いたとき: パイプ分割で曲名がアーティスト欄に入るのを避け、チャンネルを使う */
  if (!queryArtist) {
    if (channel) {
      artist = getArtistDisplayString(channel) || channel;
    } else {
      artist = '';
    }
    if (queryTitle && agrees) {
      title = queryTitle;
    }
  } else if (!junk && agrees && !droppedStayWith) {
    return { artist: queryArtist, title: queryTitle, corrected: false };
  }

  if (!artist || !title) {
    return { artist: queryArtist || artist, title: queryTitle || title, corrected: false };
  }
  if (artist === queryArtist && title === queryTitle) {
    return { artist, title, corrected: false };
  }
  return { artist, title, corrected: true };
}

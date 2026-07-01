/** ゲストが入室後はじめて自分で選曲した直後に出す軽い誘い（ゲスト単独・1セッション1回） */
export const GUEST_FIRST_SONG_INVITE_MESSAGE =
  '【ヒント】お一人でも選曲を楽しめます。友達を誘ったり、このチャットで出会ったゲスト同士でも、同じ曲を同時に聴きながらチャットできます。無料のユーザー登録後は、AIによる曲の解説や @ への質問ができ、さらにAI参加をオンにすれば一人でもエージェントと交互に選曲できます。';

/** 選曲アナウンス（〇〇さんの選曲です！）の直後に差し込む */
export const GUEST_FIRST_SONG_INVITE_DELAY_MS = 2800;

export function scheduleGuestFirstSongInvite(params: {
  videoId: string;
  isGuest: boolean;
  isOwnPick: boolean;
  /** ゲスト単独（登録ユーザー不在・人間参加者が自分だけ）のときのみ */
  guestSolo: boolean;
  alreadyShownRef: { current: boolean };
  videoIdRef: { current: string | null };
  addAiMessage: (body: string) => void;
  touchActivity: () => void;
}): void {
  if (!params.isGuest || !params.isOwnPick || !params.guestSolo || params.alreadyShownRef.current) return;
  params.alreadyShownRef.current = true;
  const vid = params.videoId;
  window.setTimeout(() => {
    if (params.videoIdRef.current !== vid) return;
    params.addAiMessage(GUEST_FIRST_SONG_INVITE_MESSAGE);
    params.touchActivity();
  }, GUEST_FIRST_SONG_INVITE_DELAY_MS);
}
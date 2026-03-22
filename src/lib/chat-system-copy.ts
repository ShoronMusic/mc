/** 邦楽と判定し AI 曲解説を出さないときのシステムメッセージ */
export const SYSTEM_MESSAGE_JP_NO_COMMENTARY = '邦楽のため曲解説を取得できませんでした。';

/** 曲解説 API が利用できなかったとき（邦楽以外・再試行の文言は付けない） */
export const SYSTEM_MESSAGE_COMMENTARY_FETCH_FAILED = '曲解説を取得できませんでした。';

/** 複数人ルームで再生開始から5分以内に次曲がキューされたとき */
export const SYSTEM_MESSAGE_QUEUE_SONG_DEFERRED =
  '選曲を受け付けました。現在の曲の再生が終わり次第、次の曲を再生します。';

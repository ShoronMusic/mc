/** マイページ未設定・行なし時はどちらも ON */
export const DEFAULT_USER_ROOM_AI_COMMENTARY_ENABLED = true;
export const DEFAULT_USER_ROOM_AI_SONG_QUIZ_ENABLED = true;

export type UserRoomAiFeaturesBody = {
  commentaryEnabled: boolean;
  songQuizEnabled: boolean;
};

export function parseUserRoomAiFeaturesPutBody(body: unknown):
  | { ok: true; value: UserRoomAiFeaturesBody }
  | { ok: false; error: string } {
  if (body == null || typeof body !== 'object') {
    return { ok: false, error: 'JSON オブジェクトで送ってください。' };
  }
  const o = body as Record<string, unknown>;
  if (typeof o.commentaryEnabled !== 'boolean' || typeof o.songQuizEnabled !== 'boolean') {
    return { ok: false, error: 'commentaryEnabled と songQuizEnabled は真偽値で指定してください。' };
  }
  return { ok: true, value: { commentaryEnabled: o.commentaryEnabled, songQuizEnabled: o.songQuizEnabled } };
}

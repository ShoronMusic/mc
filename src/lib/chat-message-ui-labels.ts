/**
 * チャット内 AI メッセージ先頭の【…】ラベル（表示・解析・新規生成で共有）
 */

/** 新規メッセージ用: 曲解説コメント枠（01〜） */
export function buildCommentaryUiLabel(twoDigits: string): string {
  return `【AI曲解説${twoDigits}】`;
}

/** 新規メッセージ用: 三択クイズ */
export const SONG_QUIZ_UI_LABEL = '【曲クイズ】';

/** 新規メッセージ用: 次に聴くなら（01〜） */
export function buildNextRecommendUiLabel(indexOneBased: number): string {
  return `【おすすめ曲${String(indexOneBased).padStart(2, '0')}】`;
}

/** 新規メッセージ用: おすすめ生成待ち */
export const NEXT_RECOMMEND_PENDING_UI_LABEL = '【おすすめ曲準備中】';

/** メッセージ本文先頭の UI ラベル（新形式＋旧形式）。キャプチャ1＝【】内の文字列 */
const CHAT_MESSAGE_UI_LABEL_CAPTURE_RE =
  /^【(AI曲解説\d{2}|AI解説\d{2}|曲クイズ|AIクイズ|おすすめ曲\d{2}|AIオススメ\d{2}|おすすめ曲準備中|AIオススメ準備中|お題講評|AIキャラ|AIキャラクター)】\s*/;

/** 【】内のトークンを常に新名称へ（バッジ表示用。旧ログも新表記に揃える） */
export function normalizeChatUiLabelInner(raw: string): string {
  if (raw.startsWith('AI解説')) return `AI曲解説${raw.slice('AI解説'.length)}`;
  if (raw === 'AIクイズ') return '曲クイズ';
  if (raw === 'AIオススメ準備中') return 'おすすめ曲準備中';
  if (raw.startsWith('AIオススメ')) return `おすすめ曲${raw.slice('AIオススメ'.length)}`;
  if (raw === 'AIキャラクター') return 'AIキャラ';
  return raw;
}

export function extractUiLabelFromBody(body: string): { label: string | null; text: string } {
  const m = body.match(CHAT_MESSAGE_UI_LABEL_CAPTURE_RE);
  if (!m) return { label: null, text: body };
  const inner = m[1] ?? '';
  return { label: inner ? normalizeChatUiLabelInner(inner) : null, text: body.slice(m[0].length) };
}

export function stripUiLabelPrefixFromBody(body: string): string {
  return extractUiLabelFromBody(body).text;
}

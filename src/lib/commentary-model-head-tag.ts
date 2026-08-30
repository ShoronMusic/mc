/**
 * 一時検証用: Gemma 4 31B が生成した曲解説チャット先頭に [G4] を付ける。
 * song_tidbits 本文には保存しない（表示時のみ）。
 * ローカル開発のみ。Vercel 等のリモート（本番ビルド）では出さない。
 */

const GEMMA4_31B_MODEL_RE = /gemma-4-31b/i;
const G4_HEAD_RE = /^(\[G4\]\s*)/;

export function isGemma431bGenerationModel(modelId: string | null | undefined): boolean {
  return GEMMA4_31B_MODEL_RE.test((modelId ?? '').trim());
}

/** クライアントは NODE_ENV（本番ビルドで inlined）。サーバーは VERCEL も見る。 */
export function shouldShowGemma4CommentaryHeadTag(): boolean {
  if (process.env.VERCEL) return false;
  return process.env.NODE_ENV !== 'production';
}

export function formatGemma4CommentaryHeadPrefix(modelId: string | null | undefined): string {
  if (!shouldShowGemma4CommentaryHeadTag()) return '';
  return isGemma431bGenerationModel(modelId) ? '[G4] ' : '';
}

/** UI ラベル除去後の本文から検証タグを除く */
export function stripGemma4CommentaryHeadPrefix(body: string): string {
  return body.replace(G4_HEAD_RE, '');
}

export function splitGemma4CommentaryHeadPrefix(body: string): { prefix: string; rest: string } {
  const m = body.match(G4_HEAD_RE);
  if (!m) return { prefix: '', rest: body };
  return { prefix: m[1] ?? '', rest: body.slice(m[0].length) };
}

export function commentaryBodyHasNewOrDbOriginPrefix(body: string): boolean {
  const t = stripGemma4CommentaryHeadPrefix(body.trimStart());
  return t.startsWith('[NEW]') || t.startsWith('[DB]');
}

/**
 * チャット表示用。ライブラリキャッシュ（他モデルの文）には付けない。
 */
export function formatCommentPackChatOriginPrefix(
  source: string | null | undefined,
  generationModel?: string | null,
): string {
  const origin = source === 'library' ? '[DB] ' : '[NEW] ';
  if (source === 'library') return origin;
  return formatGemma4CommentaryHeadPrefix(generationModel) + origin;
}

/**
 * Gemini API のモデル ID 解決（プライマリ / セカンダリ切替・料金検証用）
 * `gemini.ts` と `gemini-usage-log.ts` から参照（相互 import 回避）
 *
 * 切替例（`.env.local`、再起動後に有効）:
 * - 全体を 3.5 Flash-Lite 試用: `GEMINI_GENERATION_MODEL=gemini-3.5-flash-lite`
 * - 戻す: 行を削除または `GEMINI_GENERATION_MODEL=gemini-2.5-flash`
 * - 一部だけ: `GEMINI_MODEL_SECONDARY=gemini-3.5-flash-lite` + `GEMINI_USE_SECONDARY_FOR=comment_pack,chat_reply`
 * - エージェント選曲は Gemma プライマリでも既定で Flash（`GEMINI_CHARACTER_SONG_PICK_MODEL` / `GEMINI_CHARACTER_SONG_PICK_USE_PRIMARY=1`）
 * 実モデルは `/api/ai/status` の `geminiGeneration` と `gemini_usage_logs.model` で確認。
 */

const DEFAULT_GENERATION_MODEL = 'gemini-2.5-flash';
/** 曲解説清書の既定。2.5 Flash-Lite は新規キーで 404 になるため 3.5 を使う。 */
const DEFAULT_SANITIZE_MODEL = 'gemini-3.5-flash-lite';

/** 廃止・新規不可のモデル ID を現行 ID へ寄せる。 */
export function remapRetiredGeminiModelId(modelId: string): string {
  const n = modelId.trim().replace(/^models\//i, '');
  if (n === 'gemini-2.5-flash-lite') return DEFAULT_SANITIZE_MODEL;
  return modelId.trim();
}

/** プライマリ（既定）の生成モデル ID。`GEMINI_GENERATION_MODEL` で上書き。 */
export function getPrimaryGenerationModelId(): string {
  const e = process.env.GEMINI_GENERATION_MODEL?.trim();
  return remapRetiredGeminiModelId(e && e.length > 0 ? e : DEFAULT_GENERATION_MODEL);
}

function getSecondaryGenerationModelId(): string | null {
  const s = process.env.GEMINI_MODEL_SECONDARY?.trim();
  return s && s.length > 0 ? remapRetiredGeminiModelId(s) : null;
}

/**
 * `GEMINI_USE_SECONDARY_FOR` の1トークンが usage コンテキストにマッチするか。
 * - `all` / `*`: すべて
 * - 完全一致
 * - `token_` 接頭辞（例: `comment_pack` → `comment_pack_base`, `comment_pack_session_bridge`）
 */
export function matchesGeminiSecondaryRoutingToken(usageContext: string, token: string): boolean {
  const t = token.trim();
  if (!t) return false;
  if (t === '*' || t.toLowerCase() === 'all') return true;
  if (usageContext === t) return true;
  if (usageContext.startsWith(`${t}_`)) return true;
  return false;
}

function shouldUseSecondaryForUsageContext(usageContext: string): boolean {
  const secondary = getSecondaryGenerationModelId();
  if (!secondary) return false;
  const raw = process.env.GEMINI_USE_SECONDARY_FOR?.trim();
  if (!raw) return false;
  const tokens = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return tokens.some((tok) => matchesGeminiSecondaryRoutingToken(usageContext, tok));
}

/**
 * 曲解説の「清書」用モデル。下書きが Gemma のときだけ使う（思考漏れの抽出）。
 * `GEMINI_SANITIZE_MODEL` があればそれを優先。なければ非 Gemma のプライマリ／セカンダリ、最後に 3.5 Flash-Lite。
 */
export function resolveSanitizeModelId(): string {
  const override = process.env.GEMINI_SANITIZE_MODEL?.trim();
  if (override) return remapRetiredGeminiModelId(override);
  const primary = getPrimaryGenerationModelId();
  if (!/gemma/i.test(primary)) return remapRetiredGeminiModelId(primary);
  const secondary = getSecondaryGenerationModelId();
  if (secondary && !/gemma/i.test(secondary)) return remapRetiredGeminiModelId(secondary);
  return DEFAULT_SANITIZE_MODEL;
}

export function isCommentaryCopyeditUsageContext(usageContext: string): boolean {
  return usageContext.trim() === 'commentary_copyedit';
}

function resolveGenerationModelIdBase(usageContext: string): string {
  if (shouldUseSecondaryForUsageContext(usageContext)) {
    const sec = getSecondaryGenerationModelId();
    if (sec) return sec;
  }
  return getPrimaryGenerationModelId();
}

export function isCharacterSongPickUsageContext(usageContext: string): boolean {
  const c = usageContext.trim();
  return c === 'character_song_pick' || c.startsWith('character_song_pick_');
}

export function isNextSongRecommendUsageContext(usageContext: string): boolean {
  const c = usageContext.trim();
  return c === 'next_song_recommend' || c.startsWith('next_song_recommend_');
}

export function isSongQuizUsageContext(usageContext: string): boolean {
  const c = usageContext.trim();
  return c === 'song_quiz' || c.startsWith('song_quiz_');
}

export function isChatReplyUsageContext(usageContext: string): boolean {
  const c = usageContext.trim();
  return c === 'chat_reply' || c.startsWith('chat_reply_');
}

/**
 * @ チャット返答。Gemma は英語の指示復唱漏れが起きやすいので、プライマリが Gemma のときは Flash に寄せる。
 * 上書き: `GEMINI_CHAT_REPLY_MODEL`。Gemma のまま: `GEMINI_CHAT_REPLY_USE_PRIMARY=1`。
 */
export function resolveChatReplyModelId(): string {
  const override = process.env.GEMINI_CHAT_REPLY_MODEL?.trim();
  if (override) return remapRetiredGeminiModelId(override);
  const base = resolveGenerationModelIdBase('chat_reply');
  if (process.env.GEMINI_CHAT_REPLY_USE_PRIMARY === '1') return base;
  if (!/gemma/i.test(base)) return base;
  return DEFAULT_GENERATION_MODEL;
}

/**
 * 曲クイズ。Gemma は英語出題・指示文漏れが起きやすいので、プライマリが Gemma のときは Flash に寄せる。
 * 上書き: `GEMINI_SONG_QUIZ_MODEL`。Gemma のまま: `GEMINI_SONG_QUIZ_USE_PRIMARY=1`。
 */
export function resolveSongQuizModelId(): string {
  const override = process.env.GEMINI_SONG_QUIZ_MODEL?.trim();
  if (override) return remapRetiredGeminiModelId(override);
  const base = resolveGenerationModelIdBase('song_quiz');
  if (process.env.GEMINI_SONG_QUIZ_USE_PRIMARY === '1') return base;
  if (!/gemma/i.test(base)) return base;
  return DEFAULT_GENERATION_MODEL;
}

/**
 * エージェント選曲。Gemma は曲名・公式PVの判断が落ちやすいので、プライマリが Gemma のときは Flash に寄せる。
 * 上書き: `GEMINI_CHARACTER_SONG_PICK_MODEL`。Gemma のままにする: `GEMINI_CHARACTER_SONG_PICK_USE_PRIMARY=1`。
 */
export function resolveCharacterSongPickModelId(): string {
  const override = process.env.GEMINI_CHARACTER_SONG_PICK_MODEL?.trim();
  if (override) return remapRetiredGeminiModelId(override);
  const base = resolveGenerationModelIdBase('character_song_pick');
  if (process.env.GEMINI_CHARACTER_SONG_PICK_USE_PRIMARY === '1') return base;
  if (!/gemma/i.test(base)) return base;
  return DEFAULT_GENERATION_MODEL;
}

/**
 * ログ・課金検証用: この API 呼び出しコンテキストで実際に使うモデル ID。
 * （`persistGeminiUsageLog` / `logGeminiUsage` の第1引数と同じキーを渡す）
 */
export function resolveGenerationModelId(usageContext: string): string {
  if (isCommentaryCopyeditUsageContext(usageContext)) {
    return resolveSanitizeModelId();
  }
  if (isCharacterSongPickUsageContext(usageContext) || isNextSongRecommendUsageContext(usageContext)) {
    return resolveCharacterSongPickModelId();
  }
  if (isSongQuizUsageContext(usageContext)) {
    return resolveSongQuizModelId();
  }
  if (isChatReplyUsageContext(usageContext)) {
    return resolveChatReplyModelId();
  }
  return resolveGenerationModelIdBase(usageContext);
}

/** `/api/ai/status` 用: 秘密情報なし */
export function getGeminiGenerationRoutingSummary(): {
  primaryModel: string;
  secondaryModel: string | null;
  useSecondaryFor: string | null;
  characterSongPickModel: string;
} {
  return {
    primaryModel: getPrimaryGenerationModelId(),
    secondaryModel: getSecondaryGenerationModelId(),
    useSecondaryFor: process.env.GEMINI_USE_SECONDARY_FOR?.trim() || null,
    characterSongPickModel: resolveCharacterSongPickModelId(),
  };
}

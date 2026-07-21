/**
 * Gemini API のモデル ID 解決（プライマリ / セカンダリ切替・料金検証用）
 * `gemini.ts` と `gemini-usage-log.ts` から参照（相互 import 回避）
 *
 * 切替例（`.env.local`、再起動後に有効）:
 * - 全体を 3.5 Flash-Lite 試用: `GEMINI_GENERATION_MODEL=gemini-3.5-flash-lite`
 * - 戻す: 行を削除または `GEMINI_GENERATION_MODEL=gemini-2.5-flash`
 * - 一部だけ: `GEMINI_MODEL_SECONDARY=gemini-3.5-flash-lite` + `GEMINI_USE_SECONDARY_FOR=comment_pack,chat_reply`
 * 実モデルは `/api/ai/status` の `geminiGeneration` と `gemini_usage_logs.model` で確認。
 */

const DEFAULT_GENERATION_MODEL = 'gemini-2.5-flash';

/** プライマリ（既定）の生成モデル ID。`GEMINI_GENERATION_MODEL` で上書き。 */
export function getPrimaryGenerationModelId(): string {
  const e = process.env.GEMINI_GENERATION_MODEL?.trim();
  return e && e.length > 0 ? e : DEFAULT_GENERATION_MODEL;
}

function getSecondaryGenerationModelId(): string | null {
  const s = process.env.GEMINI_MODEL_SECONDARY?.trim();
  return s && s.length > 0 ? s : null;
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
 * ログ・課金検証用: この API 呼び出しコンテキストで実際に使うモデル ID。
 * （`persistGeminiUsageLog` / `logGeminiUsage` の第1引数と同じキーを渡す）
 */
export function resolveGenerationModelId(usageContext: string): string {
  if (shouldUseSecondaryForUsageContext(usageContext)) {
    const sec = getSecondaryGenerationModelId();
    if (sec) return sec;
  }
  return getPrimaryGenerationModelId();
}

/** `/api/ai/status` 用: 秘密情報なし */
export function getGeminiGenerationRoutingSummary(): {
  primaryModel: string;
  secondaryModel: string | null;
  useSecondaryFor: string | null;
} {
  return {
    primaryModel: getPrimaryGenerationModelId(),
    secondaryModel: getSecondaryGenerationModelId(),
    useSecondaryFor: process.env.GEMINI_USE_SECONDARY_FOR?.trim() || null,
  };
}

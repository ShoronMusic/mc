/**
 * 曲解説テキストから 3 択クイズを生成（サーバー専用）
 */
import { extractTextFromGenerateContentResponse } from '@/lib/gemini-gemma-host';
import { getGeminiModel, logGeminiUsage } from '@/lib/gemini';
import { resolveGenerationModelId } from '@/lib/gemini-model-routing';
import { persistGeminiUsageLog } from '@/lib/gemini-usage-log';
import { isValidSongQuizPayload, type SongQuizPayload } from '@/lib/song-quiz-types';

function extractJsonObject(raw: string): unknown | null {
  const t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t);
  const body = fence ? fence[1].trim() : t;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

const MIN_CONTEXT_CHARS = 60;

export type SongQuizGenerateMeta = {
  roomId?: string | null;
  videoId?: string | null;
};

/**
 * 曲解説（複数本を連結したテキスト）のみを根拠に 3 択を 1 問生成する。
 */
export async function generateSongQuizFromCommentary(
  commentaryContext: string,
  meta?: SongQuizGenerateMeta,
): Promise<SongQuizPayload | null> {
  const ctx = commentaryContext.trim();
  if (ctx.length < MIN_CONTEXT_CHARS) return null;

  const model = getGeminiModel('song_quiz');
  if (!model) return null;

  const prompt = `あなたは洋楽チャットのクイズ作成者です。次の【曲解説テキスト】に**書かれている内容だけ**を根拠に、サウンド・認知・表現のいずれかに寄せた**三択クイズを 1 問**作ってください。

【厳守】
・正解・誤答の根拠はすべて【曲解説テキスト】の**中に明示または強く示唆されている**ものに限定する。テキストに無い事実・数値・固有名は出さない。
・誤答肢は、テキストと**明らかに矛盾する**か、**別の曲っぽい聴き方**になるようにし、当て推量で細かい数値を作らない。
・チャート順位・売上・受賞の具体数字は出さない。
・問題文は 120 文字以内、各選択肢は 70 文字以内。日本語、です・ます調。

【出力形式】JSON オブジェクトのみ（前後に説明文や Markdown 禁止）。キーは次の通り:
question (string), choices (string の配列で**ちょうど 3 要素**), correctIndex (0, 1, 2 のいずれか), explanation (string: 正解の理由を 1〜2 文)

【曲解説テキスト】
${ctx}`;

  const modelId = resolveGenerationModelId('song_quiz');
  const result = await model.generateContent(prompt);
  logGeminiUsage('song_quiz', result.response);
  await persistGeminiUsageLog('song_quiz', result.response.usageMetadata, {
    roomId: meta?.roomId?.trim() || null,
    videoId: meta?.videoId?.trim() || null,
  });

  const text = extractTextFromGenerateContentResponse(result.response, modelId).trim();
  const parsed = extractJsonObject(text);
  if (!isValidSongQuizPayload(parsed)) return null;

  const choices: [string, string, string] = [
    String(parsed.choices[0]).trim(),
    String(parsed.choices[1]).trim(),
    String(parsed.choices[2]).trim(),
  ];
  return {
    question: parsed.question.trim(),
    choices,
    correctIndex: parsed.correctIndex,
    explanation: parsed.explanation.trim(),
  };
}

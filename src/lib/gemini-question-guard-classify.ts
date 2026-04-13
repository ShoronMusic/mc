/**
 * サーバー専用: 「@」質問が音楽関連か Gemini で分類
 */

import {
  AI_QUESTION_GUARD_CLASSIFIER_INSTRUCTION,
  buildAiQuestionGuardUserPayload,
} from '@/lib/ai-question-guard-prompt';
import { extractTextFromGenerateContentResponse } from '@/lib/gemini-gemma-host';
import { getGeminiModel, logGeminiUsage } from '@/lib/gemini';
import { resolveGenerationModelId } from '@/lib/gemini-model-routing';
import { persistGeminiUsageLog } from '@/lib/gemini-usage-log';

export type RecentGuardMessage = {
  displayName?: string;
  body?: string;
  messageType?: string;
};

function toRecentLines(messages: RecentGuardMessage[]): string[] {
  return messages.map((m) => {
    const who = m.messageType === 'ai' ? 'AI' : (m.displayName ?? 'ユーザー');
    const body = typeof m.body === 'string' ? m.body : '';
    const t = body.replace(/\r\n/g, '\n');
    const short = t.length > 500 ? `${t.slice(0, 499)}…` : t;
    return `${who}: ${short}`;
  });
}

export function parseQuestionGuardModelJson(raw: string): boolean | null {
  const t = raw.trim();
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as { musicRelated?: unknown };
    if (typeof o.musicRelated === 'boolean') return o.musicRelated;
    return null;
  } catch {
    return null;
  }
}

/**
 * @returns null = モデル未設定・生成失敗・パース失敗
 */
export async function classifyMusicRelatedAiQuestionGemini(
  question: string,
  recentMessages: RecentGuardMessage[],
  meta?: { roomId?: string | null }
): Promise<boolean | null> {
  if (process.env.AI_QUESTION_GUARD_GEMINI === '0') {
    return null;
  }
  const model = getGeminiModel('question_guard_classify');
  if (!model) return null;

  const recentLines = toRecentLines(recentMessages);
  const userPayload = buildAiQuestionGuardUserPayload(question, recentLines);
  const prompt = `${AI_QUESTION_GUARD_CLASSIFIER_INSTRUCTION}\n\n---\n${userPayload}`;

  try {
    const guardModelId = resolveGenerationModelId('question_guard_classify');
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 96,
      },
    });
    logGeminiUsage('question_guard_classify', result.response);
    await persistGeminiUsageLog('question_guard_classify', result.response.usageMetadata, {
      roomId: meta?.roomId ?? null,
      videoId: null,
    });
    const text = extractTextFromGenerateContentResponse(result.response, guardModelId);
    const parsed = parseQuestionGuardModelJson(text);
    return parsed;
  } catch (e) {
    console.error('[question-guard-classify]', e);
    return null;
  }
}

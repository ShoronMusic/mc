/**
 * comment-pack: 選曲直前のチャット抜粋をプロンプトに載せる（サーバー専用）。
 * COMMENT_PACK_SESSION_CONTEXT=0 で無効化（既定はオン）。
 */

import type { GenerativeModel } from '@google/generative-ai';
import { extractTextFromGenerateContentResponse } from '@/lib/gemini-gemma-host';
import { logGeminiUsage } from '@/lib/gemini';
import { resolveGenerationModelId } from '@/lib/gemini-model-routing';
import { persistGeminiUsageLog } from '@/lib/gemini-usage-log';

export type CommentPackRecentMessage = {
  displayName?: string;
  body: string;
  messageType: string;
};

const MAX_MESSAGES = 18;
const MAX_BODY_PER_MSG = 480;
const MAX_DISPLAY_NAME = 64;
const MAX_BLOCK_CHARS = 3200;

export function isCommentPackSessionContextEnabled(): boolean {
  return process.env.COMMENT_PACK_SESSION_CONTEXT !== '0';
}

/**
 * リクエスト body の recentMessages を正規化（user / ai のみ、件数・文字数上限）。
 */
export function normalizeCommentPackRecentMessages(raw: unknown): CommentPackRecentMessage[] {
  if (!Array.isArray(raw)) return [];
  const tail = raw.slice(-MAX_MESSAGES);
  const out: CommentPackRecentMessage[] = [];
  for (const item of tail) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const messageType = typeof o.messageType === 'string' ? o.messageType : '';
    if (messageType !== 'user' && messageType !== 'ai') continue;
    const bodyRaw = typeof o.body === 'string' ? o.body : '';
    const body = bodyRaw.slice(0, MAX_BODY_PER_MSG).replace(/\r\n/g, '\n');
    const displayName =
      typeof o.displayName === 'string' ? o.displayName.slice(0, MAX_DISPLAY_NAME) : undefined;
    out.push({ displayName, body, messageType });
  }
  return out;
}

/**
 * プロンプト用の1ブロック（空ならセッション文脈なし）。
 */
export function buildCommentPackSessionContextBlock(messages: CommentPackRecentMessage[]): string {
  if (messages.length === 0) return '';
  const lines = messages.map((m) => {
    const who = m.messageType === 'ai' ? 'AI' : (m.displayName?.trim() || 'ユーザー');
    const b = (m.body ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\s+/g, ' ')
      .trim();
    return `${who}: ${b}`;
  });
  let joined = lines.join('\n').trim();
  if (joined.length > MAX_BLOCK_CHARS) {
    joined = joined.slice(joined.length - MAX_BLOCK_CHARS);
  }
  return joined;
}

export type CommentPackSessionBridgeParams = {
  sessionBlock: string;
  artistLabel: string;
  songLabel: string;
  fixedCommentary: string;
};

/**
 * [DB] 再利用時: 固定本文の前に付ける短い「つなぎ」1〜2文を生成する。
 */
export async function generateCommentPackSessionBridge(
  model: GenerativeModel,
  params: CommentPackSessionBridgeParams,
  usageMeta: { videoId: string; roomId?: string | null },
): Promise<string | null> {
  const { sessionBlock, artistLabel, songLabel, fixedCommentary } = params;
  const fixed = fixedCommentary.trim();
  const sess = sessionBlock.trim();
  if (!sess || !fixed) return null;

  const prompt = `あなたは洋楽チャットの司会補助です。直近の会話と、これから表示する「固定の曲解説」があります。
聴き手向けに、**つなぎの1〜2文だけ**を書いてください（合計で120文字以内・です・ます調）。

【厳守】
・直後に続く固定解説に書かれる事実（リリース年・アルバム名・チャート順位・受賞の具体など）は**繰り返さない**。
・会話の**逐語コピー**や長い要約はしない。なぜこの曲に注目しているか・会話の流れとの接点だけ。
・【アーティスト】${artistLabel}、【曲名】${songLabel} を前提に、取り違えないこと。
・メタデータや固定解説と**矛盾する推測**は書かない。

【直近のチャット（参考）】
${sess}

【このあと続く固定の曲解説（繰り返し禁止・要約し直し禁止）】
${fixed.slice(0, 1200)}

つなぎの文だけを出力してください。前置きや見出しは禁止。`;

  try {
    const bridgeModelId = resolveGenerationModelId('comment_pack_session_bridge');
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 220,
      },
    });
    logGeminiUsage('comment_pack_session_bridge', result.response);
    await persistGeminiUsageLog('comment_pack_session_bridge', result.response.usageMetadata, {
      videoId: usageMeta.videoId,
      roomId: usageMeta.roomId ?? null,
    });
    const text = extractTextFromGenerateContentResponse(result.response, bridgeModelId);
    if (!text) return null;
    /** Gemma が英語メタだけ返したときはつなぎを出さない */
    if (!/[\u3040-\u30FF\u4E00-\u9FFF]/.test(text)) return null;
    const oneLine = text.replace(/\s+/g, ' ').trim();
    return oneLine.length > 200 ? oneLine.slice(0, 197) + '…' : oneLine;
  } catch (e) {
    console.error('[comment-pack-session-context] bridge', e);
    return null;
  }
}

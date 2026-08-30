/**
 * Gemma 曲解説の下書きを、別モデル（既定 Flash-Lite）が日本語本文だけ抽出して清書する。
 * 加筆・言い換えはしない。正規表現 polish で足りるときは API を呼ばない。
 */

import type { GenerationConfig } from '@google/generative-ai';
import { extractJsonObjectFromGeminiText } from '@/lib/admin-artist-profile-parse';
import { getGeminiModel, logGeminiUsage } from '@/lib/gemini';
import {
  isGemmaHostedModelId,
  polishGemmaModelVisibleText,
} from '@/lib/gemini-gemma-host';
import { resolveSanitizeModelId } from '@/lib/gemini-model-routing';
import { persistGeminiUsageLog, type GeminiUsagePersistMeta } from '@/lib/gemini-usage-log';

export const COMMENTARY_COPYEDIT_USAGE_CONTEXT = 'commentary_copyedit';

const COPYEDIT_MARKERS =
  /\bDraft\s*\d\b|\bRefining\b|\bCheck\.|Constraints?:|\bOnly Japanese\b|Just the Japanese|Too simple|\bBetter,\s+specific|\bMetadata says\b|\bWait,\s+is\b|One detail:|Final confirmation|Total\s+chars?:|Total\s+characters?:|\bPerfect\.(?=[A-Za-z\u3040-\u30FF])|\bReady\.(?=[A-Za-z\u3040-\u30FF])|\bDone\.(?=[A-Za-z\u3040-\u30FF])|豆知識[^\n]{0,24}Check|\(\s*(Too simple|Better,|Too generic)|Final Text Construction|Character count:|Length is (?:around|about)|Length\?|\(Perfect\)|->\s*\d{2,4}\s*characters|Fits the \d{2,3}\s*[-–]\s*\d{2,3}\s+range|Does it put|Is it \d{2,3}\s*[-–]\s*\d{2,3}\s*chars|terminology for album|No detailed sound|First sentence:|Genre\/Position(?:ing)?[?:]|Theme\/(?:Mood|Atmosphere)[?:]|Release year\s*\/\s*Album|\bare safe\b|Current year:|No chart rankings|Correct labels:|No instrument details|No detailed lyric/i;

function countJpChars(s: string): number {
  return (s.match(/[\u3040-\u30FF\u4E00-\u9FFF]/g) ?? []).length;
}

/**
 * 「The Weekndの『曲』」のアーティスト名より前に、英語の自己チェックが張り付いているか。
 * 既知マーカー漏れ（Ready. / Length? / -> 146 characters. など）でも清書へ回す。
 */
export function hasGemmaEnglishMetaPrefix(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  const titled = t.search(/の『/);
  const jpRun = t.search(/[\u3040-\u30FF\u4E00-\u9FFF]{8}/);
  const cut = titled >= 0 ? titled : jpRun >= 0 ? jpRun : -1;
  if (cut <= 0) return false;
  const prefix = t.slice(0, cut);
  if (COPYEDIT_MARKERS.test(prefix)) return true;
  if (/^(?:->|→|⇒|=>)/.test(prefix.trim())) return true;
  if (/\d{2,4}\s*characters?/i.test(prefix)) return true;
  if (/\?\s*(?:Yes|No)\b/i.test(prefix)) return true;
  /** `Ready.Maroon` / `Perfect.The Weeknd` — 4文字以上の英単語＋ピリオドが次の大文字に直結 */
  if (/[A-Za-z]{4,}\.(?=[A-Z])/i.test(prefix) || /[A-Za-z]{4,}\.(?=[A-Z])/i.test(t.slice(0, cut + 12))) {
    return true;
  }
  if (/^[A-Za-z][A-Za-z0-9 ?:'()~.-]{8,120}[.?:]\s*(?=[A-Z\u3040-\u30FF])/i.test(t)) return true;
  return false;
}

/** polish 後も英語思考・Draft/Check が残っているか（アーティスト英語名だけの本文は汚れていない） */
export function isGemmaCommentaryStillDirty(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (COPYEDIT_MARKERS.test(t)) return true;
  if (hasGemmaEnglishMetaPrefix(t)) return true;
  const jp = countJpChars(t);
  const latin = (t.match(/[A-Za-z]/g) ?? []).length;
  if (jp >= 18 && latin >= 40 && jp / Math.max(1, t.length) < 0.38) return true;
  return false;
}

export function parseCopyeditBodiesJson(raw: string, expectedCount: number): string[] | null {
  const obj = extractJsonObjectFromGeminiText(raw);
  if (!obj) return null;
  const bodies = obj.bodies;
  if (!Array.isArray(bodies) || bodies.length !== expectedCount) return null;
  return bodies.map((b) => (typeof b === 'string' ? b.trim() : ''));
}

function copyeditDisabled(): boolean {
  const v = process.env.GEMINI_COMMENTARY_COPYEDIT?.trim().toLowerCase();
  return v === '0' || v === 'false';
}

function copyeditForceAll(): boolean {
  const v = process.env.GEMINI_COMMENTARY_COPYEDIT?.trim().toLowerCase();
  return v === 'always' || v === 'all';
}

/**
 * Gemma 下書き配列を清書。きれいならそのまま。汚れていれば Flash で1回抽出し、
 * なお汚い枠は空文字（チャットに出さない）。API 失敗時は polish 済み原文を残す。
 */
export async function copyeditGemmaCommentaryBodies(
  bodies: string[],
  opts: {
    draftModelId: string;
    persistMeta?: GeminiUsagePersistMeta;
  },
): Promise<string[]> {
  const originals = bodies.map((b) => (typeof b === 'string' ? b : ''));
  const polished = originals.map((t) => {
    if (!t.trim()) return '';
    return isGemmaHostedModelId(opts.draftModelId) ? polishGemmaModelVisibleText(t) : t.trim();
  });

  if (copyeditDisabled() || !isGemmaHostedModelId(opts.draftModelId)) {
    return polished;
  }
  if (isGemmaHostedModelId(resolveSanitizeModelId())) {
    console.warn('[commentary-copyedit] sanitize model is Gemma; skipping editor');
    return polished;
  }

  const dirtyIdx = polished
    .map((t, i) => {
      const orig = originals[i] ?? '';
      if (!t.trim()) {
        /** polish が英語思考ごと本文を消したときも、原文に日本語が残っていれば清書へ回す */
        if (orig.trim() && (copyeditForceAll() || countJpChars(orig) >= 8)) return i;
        return -1;
      }
      if (copyeditForceAll()) return i;
      if (isGemmaCommentaryStillDirty(t)) return i;
      /** polish が見逃した原文の英語接頭辞 */
      if (isGemmaCommentaryStillDirty(originals[i] ?? '')) return i;
      return -1;
    })
    .filter((i) => i >= 0);
  if (dirtyIdx.length === 0) return polished;

  const model = getGeminiModel(COMMENTARY_COPYEDIT_USAGE_CONTEXT);
  if (!model) {
    console.warn('[commentary-copyedit] model unavailable; keeping polished drafts');
    return polished;
  }

  console.info(
    '[commentary-copyedit] running Flash extract',
    dirtyIdx.length,
    copyeditForceAll() ? '(always)' : '(dirty)',
  );

  const drafts = dirtyIdx.map((i) => {
    const orig = originals[i] ?? '';
    const pol = polished[i] ?? '';
    const src = orig.length >= pol.length ? orig : pol;
    return src.slice(0, 2500);
  });
  const prompt = `あなたは曲解説の清書係です。入力の各下書きから、視聴者向けの日本語解説本文だけを抜き出してください。

厳守:
- 加筆・言い換え・要約・新しい事実の追加は禁止。下書きに既にある日本語だけを残す。
- 英語の思考・自己チェックが本文の前や途中に残っているときは、日本語本文だけを残す。
- 英語の思考・自己チェック・Draft / Check / Constraint / Too simple / Better / Only Japanese / Does it …? Yes/No / Is it N-N chars? / terminology for album? Yes / No detailed sound analysis: Yes / First sentence: / Genre/Position: / are safe / Ready. / Perfect. / Length? / -> N characters. などは捨てる。
- 「アーティストの『曲名』」で始まる文はメタではない。必ず残す。
- 複数案があるときは日本語の完成稿を残す。ただし最後の案が「世界観」「大ヒット」「広く知られる」だけの短い文で、前の案に『曲名』と年・アルバムがあるときは、固有名詞のある本文を優先する。
- 日本語の解説が取れない要素は空文字にする。

入力 JSON:
${JSON.stringify({ drafts })}

出力は JSON のみ。キーは bodies。要素数は入力 drafts と同じ ${drafts.length} 個。
例: {"bodies":["日本語本文",""]}`;

  const generationConfig: GenerationConfig = {
    temperature: 0.1,
    maxOutputTokens: 2048,
    responseMimeType: 'application/json',
  };

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    });
    logGeminiUsage(COMMENTARY_COPYEDIT_USAGE_CONTEXT, result.response);
    await persistGeminiUsageLog(
      COMMENTARY_COPYEDIT_USAGE_CONTEXT,
      result.response.usageMetadata,
      opts.persistMeta,
    );
    const raw = result.response.text()?.trim() ?? '';
    const extracted = parseCopyeditBodiesJson(raw, drafts.length);
    if (!extracted) {
      console.warn('[commentary-copyedit] JSON parse failed; keeping polished drafts');
      return polished;
    }
    const out = [...polished];
    dirtyIdx.forEach((origI, j) => {
      const body = polishGemmaModelVisibleText(extracted[j] ?? '');
      out[origI] = isGemmaCommentaryStillDirty(body) ? '' : body;
    });
    return out;
  } catch (e) {
    console.warn('[commentary-copyedit] failed; keeping polished drafts', e);
    return polished;
  }
}

export async function copyeditGemmaCommentaryText(
  text: string,
  opts: {
    draftModelId: string;
    persistMeta?: GeminiUsagePersistMeta;
  },
): Promise<string> {
  const [out] = await copyeditGemmaCommentaryBodies([text], opts);
  return out ?? '';
}

/**
 * Gemini API 上の Gemma（hosted）向け: thinking 無効化・本文への思考漏れ対策
 */

import type { ModelParams } from '@google/generative-ai';

function countJpChars(s: string): number {
  return (s.match(/[\u3040-\u30FF\u4E00-\u9FFF]/g) ?? []).length;
}

const GEMMA_COT_STRONG_MARKERS =
  /\*\s*Role:\s*Assistant|Assistant moderator for|\*\s*Task:|\*\s*Constraints:|Final Draft:|Final selection:|Final\s+Text\s+Construction|My draft starts|\*Self-Correction|Let\'s check the first comment|\bOne detail:|\*Final Version\*|^\s*\*Final Version\*/i;

const GEMMA_LINE_META =
  /^\s*(\*\s*)?(Role|Task|Constraints)\s*:/i;

/**
 * Gemma が英語の思考・指示文（* Role / Final Draft / Let's …）を本文に混ぜる対策。
 * 行単位で英語メタを落とし、それでも残るときは日本語が最も濃い段落／連続行を採用する。
 */
export function stripGemmaCoTLeakage(raw: string): string {
  let t = raw.replace(/\r\n/g, '\n').trim();
  if (!t) return t;

  const lines = t.split('\n');
  const kept: string[] = [];
  let startedJp = false;
  for (const line of lines) {
    const tr = line.trim();
    if (!tr) {
      if (startedJp) kept.push('');
      continue;
    }
    const jp = countJpChars(tr);
    const isMetaLine =
      GEMMA_LINE_META.test(tr) ||
      /\bAssistant moderator\b/i.test(tr) ||
      /^\(\d+\s*characters?\)/i.test(tr) ||
      (/^(Final Draft|Final selection|Draft)\s*:/i.test(tr) && jp < 6) ||
      (/^\*?\s*Final\s+Text\s+Construction\s*\*?\s*:?/i.test(tr) && jp < 12) ||
      (/^\*Final Version\*?:?/i.test(tr) && jp < 8) ||
      (/^One detail:/i.test(tr) && jp < 8) ||
      (/^(Let\'s|I should|My draft|The prompt asks)\b/i.test(tr) && jp < 6) ||
      (/^\*\w/i.test(tr) && jp < 4 && tr.length > 18) ||
      (/^[-•*]\s*"/.test(tr) && jp < 5 && tr.length > 20);
    const mostlyAsciiJunk =
      jp < 4 &&
      tr.length > 35 &&
      jp / Math.max(1, tr.length) < 0.06 &&
      /[A-Za-z]{12,}/.test(tr);
    if (!startedJp) {
      if (isMetaLine || mostlyAsciiJunk) continue;
      if (jp >= 5 && tr.length >= 8) startedJp = true;
      else if (jp >= 3 && /の『[^』]+』/.test(tr)) startedJp = true;
      else if (!isMetaLine && tr.length < 50 && jp >= 4) startedJp = true;
      else continue;
    }
    if (startedJp && isMetaLine && jp < 8) continue;
    if (startedJp && mostlyAsciiJunk) continue;
    kept.push(line);
  }
  t = kept.join('\n').trim();

  const stillMessy =
    GEMMA_COT_STRONG_MARKERS.test(t) ||
    (t.length > 100 && countJpChars(t) < t.length * 0.12);
  if (stillMessy) {
    const picked = pickBestJapaneseParagraphForGemma(raw);
    if (picked.length >= 20) t = picked;
    else {
      const run = extractLongestJapaneseLineRun(raw);
      if (run.length >= 20) t = run;
    }
  }

  t = stripTrailingGemmaEnglishLines(t);
  return t.trim();
}

function pickBestJapaneseParagraphForGemma(text: string): string {
  const paras = text
    .replace(/\r\n/g, '\n')
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const candidates = paras
    .map((p) => {
      const jp = countJpChars(p);
      const len = p.length;
      if (jp < 12 || len < 28) return { p: '', score: -1 };
      if (GEMMA_LINE_META.test(p) && jp < len * 0.2) return { p: '', score: -1 };
      if (/\bAssistant moderator\b/i.test(p) && jp < len * 0.18) return { p: '', score: -1 };
      let score = jp + Math.min(80, len / 4);
      if (/の『[^』]+』/.test(p)) score += 50;
      return { p, score };
    })
    .filter((x) => x.score > 0);
  if (candidates.length === 0) return '';
  candidates.sort((a, b) => b.score - a.score || b.p.length - a.p.length);
  return candidates[0].p;
}

function extractLongestJapaneseLineRun(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let best = '';
  let cur = '';
  for (const line of lines) {
    const tr = line.trim();
    const jp = countJpChars(tr);
    const dense = jp >= 6 && tr.length >= 14 && jp / Math.max(1, tr.length) > 0.1;
    if (dense && !GEMMA_LINE_META.test(tr)) {
      cur = cur ? `${cur}\n${tr}` : tr;
      if (cur.replace(/\s/g, '').length > best.replace(/\s/g, '').length) best = cur;
    } else {
      cur = '';
    }
  }
  return best.trim();
}

function stripTrailingGemmaEnglishLines(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  while (lines.length > 0) {
    const tr = lines[lines.length - 1]?.trim() ?? '';
    if (!tr) {
      lines.pop();
      continue;
    }
    const jp = countJpChars(tr);
    if (jp >= 8) break;
    if (jp < 4 && /draft|character|selection|moderator/i.test(tr)) lines.pop();
    else break;
  }
  return lines.join('\n').trim();
}

/**
 * Gemma が日本語本文の前に付ける短い英語の相槌・見出し（Perfect. / Final Text Construction 等）を除く。
 */
function stripGemmaEnglishPreambles(raw: string): string {
  let t = raw.replace(/\r\n/g, '\n').trim();
  if (!t) return t;
  for (let pass = 0; pass < 8; pass++) {
    const before = t;
    t = t
      /** 多くは `*Final Text Construction:* 本文`（コロン直後に第2の `*`） */
      .replace(/^\s*\*Final\s+Text\s+Construction:\*\s+/i, '')
      .replace(/^\s*\*Final\s+Text\s+Construction\s*:\s+/i, '')
      .replace(/^\s*Final\s+Text\s+Construction\s*:\s+/i, '')
      .replace(/^\s*\*?\s*Final\s+Text\s+Construction\s*\*?\s*:?\s*\n+/i, '')
      .replace(
        /^\s*(?:Perfect|Great|Okay|Good|Sure|Understood|Excellent|Alright|Yes|Nice|Correct|Right)[.,!]?\s+/i,
        '',
      )
      .trim();
    if (t === before) break;
  }
  const lines = t.split('\n');
  while (lines.length > 0) {
    const tr = lines[0].trim();
    if (!tr) {
      lines.shift();
      continue;
    }
    if (/^\*?\s*Final\s+Text\s+Construction\s*\*?\s*:?\s*$/i.test(tr)) {
      lines.shift();
      continue;
    }
    break;
  }
  if (lines.length > 0) {
    lines[0] = lines[0]
      .replace(/^\s*\*Final\s+Text\s+Construction:\*\s*/i, '')
      .replace(/^\s*\*Final\s+Text\s+Construction\s*:\s*/i, '')
      .replace(/^\s*Final\s+Text\s+Construction\s*:\s*/i, '')
      .replace(
        /^\s*(?:Perfect|Great|Okay|Good|Sure|Understood|Excellent|Alright|Yes|Nice|Correct|Right)[.,!]?\s+/i,
        '',
      )
      /** `* 日本語…` のように見出し除去後に孤立した `*` */
      .replace(/^\s*\*\s+(?=[\u3040-\u30FF\u4E00-\u9FFF])/u, '');
  }
  return lines.join('\n').trim();
}

/**
 * 「…によるこの楽曲は…」と「…の共演によるこの楽曲は…」のようにほぼ同文が2連になるケースを落とす。
 */
function dedupeRoughJapaneseSentences(text: string): string {
  const s = text.replace(/\r\n/g, '\n').trim();
  if (s.length < 50) return s;
  const parts = s.split(/(?<=[。．])/);
  const kept: string[] = [];
  const norms: string[] = [];
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    const n = p
      .replace(/\s+/g, '')
      .replace(/の共演による/g, 'による')
      .replace(/[、,]/g, '')
      .toLowerCase();
    if (n.length < 28) {
      kept.push(p.endsWith('。') || p.endsWith('．') ? p : `${p}。`);
      continue;
    }
    let dup = false;
    for (const prev of norms) {
      if (prev.length < 28) continue;
      if (n === prev) {
        dup = true;
        break;
      }
      const shorter = n.length <= prev.length ? n : prev;
      const longer = n.length > prev.length ? n : prev;
      if (shorter.length >= 35 && longer.includes(shorter.slice(0, Math.min(shorter.length, 48)))) {
        dup = true;
        break;
      }
    }
    if (!dup) {
      const piece = p.endsWith('。') || p.endsWith('．') ? p : `${p}。`;
      kept.push(piece);
      norms.push(n);
    }
  }
  return kept.join('').replace(/。{2,}/g, '。').trim();
}

/** `models/gemma-…` または `gemma-…` */
export function isGemmaHostedModelId(modelId: string): boolean {
  return /gemma/i.test(modelId.trim());
}

/**
 * hosted Gemma 用の追加 ModelParams。
 * 注意: `thinkingConfig` / `thinkingBudget` は consumer Gemini API では Gemma が拒否することがあり、
 * リクエスト全体が 400 になり comment-pack 等が 500 になる。そのためここでは付与しない。
 * 思考の英語漏れは `sanitizeGemmaVisibleOutputText` とプロンプトで抑える。
 */
export function buildGoogleGenerativeModelParams(modelId: string): ModelParams {
  return { model: modelId };
}

/**
 * thinking オフでも稀に英語メタが先頭に付く場合の保険。
 * 最終の「…の『曲』…」形式の日本語解説ブロックを優先して切り出す。
 */
export function sanitizeGemmaVisibleOutputText(raw: string): string {
  const t = raw.replace(/\r\n/g, '\n').trim();
  if (!t) return t;

  /** 短くてメタ混入の痕跡がなければそのまま（通常の豆知識等を壊さない） */
  const looksLeaked =
    t.length >= 200 ||
    /\*Wait\*|Metadata provided:|\*\s+Artist:|\*\s+Song Title:|One detail:|\*Final Version\*|Final Version:|Final\s+Text\s+Construction|^\s*(?:Perfect|Great|Okay)\b[.,]?\s+/im.test(
      t,
    );
  if (!looksLeaked) return t;

  const lines = t.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.length < 35) continue;
    if (!/の『[^』]{1,120}』/.test(line)) continue;
    if (!/[\u3040-\u30FF\u4E00-\u9FFF]/.test(line)) continue;
    return lines.slice(i).join('\n').trim();
  }

  const paras = t.split(/\n\n+/);
  for (let i = paras.length - 1; i >= 0; i--) {
    const p = paras[i].trim();
    if (p.length < 40) continue;
    if (!/の『[^』]+』/.test(p)) continue;
    const jpChars = (p.match(/[\u3040-\u30FF\u4E00-\u9FFF]/g) ?? []).length;
    if (jpChars >= 15 && jpChars / Math.max(1, p.length) > 0.12) return p;
  }

  const re = /[A-Za-z0-9'’ ,.$-]+の『[^』]{1,120}』[\s\S]{20,2000}/g;
  const matches = [...t.matchAll(re)];
  if (matches.length > 0) {
    const last = matches[matches.length - 1][0].trim();
    const jpChars = (last.match(/[\u3040-\u30FF\u4E00-\u9FFF]/g) ?? []).length;
    if (jpChars >= 15) return last;
  }
  return t;
}

/**
 * hosted Gemma が同一解説を改行なしで2連結したり、同じ段落を2回並べることがあるため折りたたむ。
 * 意図的な繰り返し（短いフレーズの二度言い等）より「全文コピー」寄りの一致のみ対象にする。
 */
export function collapseImmediateDuplicateBody(text: string): string {
  let t = text.replace(/\r\n/g, '\n').trim();
  for (let pass = 0; pass < 6; pass++) {
    const n = t.length;
    if (n < 24) break;
    let next = t;

    /** 半分折りより先に三連を見る（例: AAA が A+A に誤分解されるのを防ぐ）。チャンクは短すぎると誤検知するため 30 文字以上。 */
    if (n % 3 === 0) {
      const u = n / 3;
      if (u >= 30) {
        const a = t.slice(0, u);
        const b = t.slice(u, 2 * u);
        const c = t.slice(2 * u);
        if (a === b && b === c) next = a.trim();
      }
    }
    if (next === t && n % 2 === 0) {
      const h = n / 2;
      const a = t.slice(0, h);
      const b = t.slice(h);
      if (a === b) next = a.trim();
    }
    if (next === t) {
      const paras = t.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
      if (paras.length >= 2 && paras[0].length >= 20 && paras[0] === paras[1]) {
        next = [paras[0], ...paras.slice(2)].join('\n\n');
      }
    }
    if (next === t) {
      const lines = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      if (lines.length >= 2 && lines[0].length >= 20 && lines[0] === lines[1]) {
        next = [lines[0], ...lines.slice(2)].join('\n');
      }
    }
    if (next === t) break;
    t = next.trim();
  }
  return t;
}

export function extractTextFromGenerateContentResponse(
  response: { text: () => string },
  resolvedModelId: string,
): string {
  let s = '';
  try {
    s = response.text()?.trim() ?? '';
  } catch {
    return '';
  }
  if (isGemmaHostedModelId(resolvedModelId)) {
    return polishGemmaModelVisibleText(s);
  }
  return s;
}

/** DB キャッシュ返却・再表示用。生成時の extractText（Gemma）と同じパイプライン */
export function polishGemmaModelVisibleText(raw: string): string {
  const s = typeof raw === 'string' ? raw : '';
  if (!s.trim()) return s;
  const pre = stripGemmaEnglishPreambles(s);
  const peeled = stripGemmaCoTLeakage(pre);
  const collapsed = collapseImmediateDuplicateBody(sanitizeGemmaVisibleOutputText(peeled));
  return dedupeRoughJapaneseSentences(collapsed);
}

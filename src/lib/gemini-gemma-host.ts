/**
 * Gemini API 上の Gemma（hosted）向け: thinking 無効化・本文への思考漏れ対策
 */

import type { ModelParams } from '@google/generative-ai';

function countJpChars(s: string): number {
  return (s.match(/[\u3040-\u30FF\u4E00-\u9FFF]/g) ?? []).length;
}

const GEMMA_COT_STRONG_MARKERS =
  /\*\s*Role:\s*Assistant|Assistant moderator for|\*\s*Task:|\*\s*Constraints:|Final Draft:|Final\s+selection\s*:|Final\s+text\s*:|Constraint\s+Check|Sentence\s+\d\s*\*?\s*:|Final\s+Text\s+Construction|Final\s+Polish|Final\s+check\s*:|Revised\s+Draft|Basic\s+info:|the\s+prompt\s+says|Total:\s*\d+\s*characters?|Length:\s*~?\s*\d+\s*characters?|My draft starts|\*Self-Correction|Let\'s check the first comment|\bOne detail:|\*Final Version\*|^\s*\*Final Version\*|Final\s+Version\s*:|Final\s+Version\s+Selection|Attempt\s+\d+\s*\*?\s*:|Character\s+Count\s+Check|\*{1,3}\s+\*{1,3}\s*Final\s+Text|\*{1,3}\s+\*{1,3}\s*Final\s+Polish|\*{1,3}\s+\*{1,3}\s*Final\s+Version\s+Selection|\*{1,3}\s+\*{1,3}\s*Refined|\*{1,3}\s+\*{1,3}\s*Draft|\*{1,3}\s+\*{1,3}\s*Sentence\s+\d|\*{1,3}\s+\*{1,3}\s*Constraint\s+Check|\*\s*Final\s+Polish\s*:|Actually,\s+I'?ll\s+go\s+with|\(\d+\s*chars?\)\s*-\s*\*/i;

const GEMMA_LINE_META =
  /^\s*(\*\s*)?(Role|Task|Constraints)\s*:/i;

/** Total: 112 characters. / Perfect.Post … など comment-pack 先頭ノイズ */
function stripGemmaLeadingTotalsAndAck(text: string): string {
  let t = text.replace(/\r\n/g, '\n').trim();
  if (!t) return t;
  /** `"Post Maloneの『` のように先頭だけ ASCII 引用が付いたケース */
  t = t.replace(/^"\s*(?=[\u3040-\u30FF\u4E00-\u9FFFA-Za-z])/u, '');
  for (let i = 0; i < 6; i++) {
    const before = t;
    t = t
      .replace(/^Total:\s*\d+\s*characters?\.?\s*/i, '')
      /** `Perfect.Post` のようにピリオド直後に日本語／英字が続く */
      .replace(/^(?:Perfect|Great|Okay|Good|Sure)\.(?=[A-Za-z\u3040-\u30FF\u4E00-\u9FFF])/i, '')
      /** `Perfect. *` の直後に和文（Constraint Check ブロック末尾） */
      .replace(/^(?:Perfect|Great|Okay|Good|Sure)\.\s*\*\s*(?=[\u3040-\u30FF\u4E00-\u9FFF])/iu, '')
      .replace(
        /^\s*(?:Perfect|Great|Okay|Good|Sure|Understood|Excellent|Alright|Yes|Nice|Correct|Right)[.,!]?\s+/i,
        '',
      )
      .trim();
    if (t === before) break;
  }
  return t;
}

/** `* *Draft 1:*` / `* *Sentence 1:*` … 英語評価付きの複数案のあとに本編が続くとき、最初の「…の『タイトル』」から採用する */
function stripGemmaMultiDraftIntroPrefix(text: string): string {
  let t = text.replace(/\r\n/g, '\n').trim();
  if (
    !/\*\s*\*\s*Draft\s*\d/i.test(t) &&
    !/\*Draft\s*\d+\s*:/i.test(t) &&
    !/\*\s*\*\s*Sentence\s+\d/i.test(t)
  )
    return t;
  const re =
    /([\u3040-\u30FF\u4E00-\u9FFFA-Za-z][\u3040-\u30FF\u4E00-\u9FEFA-Za-z0-9$s'.,\s·&]{0,120}の『[^』]{2,120}』)/;
  const m = re.exec(t);
  if (!m || m.index == null) return t;
  return t.slice(m.index).trim();
}

/** 「…。1: ト(1)ラ(2)…」のように（n）付き字勘が続く Gemma の文末ノイズを落とす */
function stripGemmaTrailingCharEnumeratorRun(text: string): string {
  return text.replace(/([。．])(\s*\d+:[\s\S]+)$/u, (full, punct: string, tail: string) => {
    const marks = tail.match(/\(\d+\)/g) ?? [];
    return marks.length >= 6 ? punct : full;
  });
}

/** `〜でした。"。」` のように閉じ `"` が余った末尾を直す */
function stripGemmaStrayClosingQuoteBeforePeriod(text: string): string {
  return text
    .replace(/"\s*([。．])/g, '$1')
    .replace(/([。．])"\s*(?=[。．\n]|$)/g, '$1')
    /** `…ました。"。` のように二重句点になる場合 */
    .replace(/([。．])\1+/g, '$1')
    .replace(/"\s*$/g, '');
}

/**
 * `*   *Final Text:*` / `Final Version:` / `*   *Attempt 1:*` / `Character Count Check:` 等の星付き英語見出しを除去。
 */
function stripGemmaStarMetaLabels(text: string): string {
  let t = text.replace(/\r\n/g, '\n');
  for (let pass = 0; pass < 24; pass++) {
    const before = t;
    t = t
      .replace(/\s*\*{1,3}\s+\*{1,3}\s*Final\s+Text\s*\*?\s*:\s*/gi, ' ')
      .replace(/\s*\*+\s*Final\s+Text\s*\*?\s*:\s*/gi, ' ')
      .replace(/\s*Final\s+Version\s*:\s*/gi, ' ')
      .replace(/\s*\*{1,3}\s+\*{1,3}\s*Attempt\s+\d+\s*\*?\s*:\s*/gi, ' ')
      .replace(/\s*\*+\s*Attempt\s+\d+\s*\*?\s*:\s*/gi, ' ')
      .replace(/\s*\*{1,3}\s+\*{1,3}\s*Character\s+Count\s+Check\s*\*?\s*:\s*/gi, ' ')
      .replace(/\s*\bCharacter\s+Count\s+Check\s*\*?\s*:\s*/gi, ' ')
      .replace(/\s*\*{1,3}\s+\*{1,3}\s*Refined\s*\*?\s*/gi, ' ')
      .replace(/\s*\*{1,3}\s+\*{1,3}\s*Final\s+Polish\s*\*?\s*:\s*/gi, ' ')
      .replace(/\s*\*+\s*Final\s+Polish\s*\*?\s*:\s*/gi, ' ')
      .replace(/\s*\*{1,3}\s+\*{1,3}\s*Final\s+Version\s+Selection\s*\*?\s*:\s*/gi, ' ')
      .replace(/\s*\*+\s*Final\s+Version\s+Selection\s*\*?\s*:\s*/gi, ' ')
      .replace(/\s*\*{1,3}\s+\*{1,3}\s*Draft\s*\d+\s*\*?\s*:\s*/gi, ' ')
      .replace(/\s*\*{1,3}\s+\*{1,3}\s*Sentence\s+\d+\s*\*?\s*:\s*/gi, ' ')
      .replace(/\s*\*+\s*Sentence\s+\d+\s*\*?\s*:\s*/gi, ' ')
      .replace(/\s*\*{1,3}\s+\*{1,3}\s*Constraint\s+Check\s*\*?\s*:\s*/gi, ' ')
      .replace(/\s*\*+\s*Constraint\s+Check\s*\*?\s*:\s*/gi, ' ')
      .replace(/\s*Final\s+text\s*:\s*/gi, ' ')
      .replace(/\s*Final\s+selection\s*:\s*/gi, ' ')
      /** `~?`+`\d+` だけだと別行の西暦4桁に誤って繋がることがあるため、行頭＋桁数上限で Length 行に限定 */
      .replace(/(?:^|\n)\s*Length:\s*(?:~\s*)?\d{1,6}\s*characters?\.?\s*Perfect\.?\s*\*?\s*/gi, '\n')
      .replace(/\s*\(\d+\s*chars?\)\s*-\s*\*[^*]*\*\s*/gi, ' ')
      .replace(/\s*Final\s+check\s*:\s*/gi, ' ')
      /** 箇条書きと和文が同一行のとき [^\n]* で日本語まで消えないよう、和文1文字目手前で打ち切る */
      .replace(
        /(?:^|\n)\s*-\s+No\s+repetition(?:(?![\u3040-\u30FF\u4E00-\u9FFF])[^\n])*/gi,
        '\n',
      )
      .replace(
        /(?:^|\n)\s*-\s+Focused\s+on(?:(?![\u3040-\u30FF\u4E00-\u9FFF])[^\n])*/gi,
        '\n',
      )
      .replace(
        /(?:^|\n)\s*-\s+No\s+unfounded(?:(?![\u3040-\u30FF\u4E00-\u9FFF])[^\n])*/gi,
        '\n',
      )
      .replace(
        /(?:^|\n)\s*-\s+No\s+English(?:(?![\u3040-\u30FF\u4E00-\u9FFF])[^\n])*/gi,
        '\n',
      )
      .replace(
        /(?:^|\n)\s*\*\s+Includes\b(?:(?![\u3040-\u30FF\u4E00-\u9FFF])[^\n])*/gi,
        '\n',
      )
      .replace(
        /(?:^|\n)\s*\*\s+Qualitative\b(?:(?![\u3040-\u30FF\u4E00-\u9FFF])[^\n])*/gi,
        '\n',
      )
      .replace(
        /(?:^|\n)\s*\*\s+No\s+specific\b(?:(?![\u3040-\u30FF\u4E00-\u9FFF])[^\n])*/gi,
        '\n',
      )
      .replace(
        /(?:^|\n)\s*\*\s+No\s+repetition\b(?:(?![\u3040-\u30FF\u4E00-\u9FFF])[^\n])*/gi,
        '\n',
      )
      .replace(
        /(?:^|\n)\s*\*\s+Length\s+check\s*:(?:(?![\u3040-\u30FF\u4E00-\u9FFF])[^\n])*/gi,
        '\n',
      )
      /**
       * `Actually, I'll go with …` 型。`\s*[A-Za-z…]{2,}の『` 先読みだと ` the … Post Maloneの『` で先頭の `the` まで成立し英語が残るため、
       * 先読みは「大文字始まり英単語列＋の『」または「短い和名＋の『」または連続2かなに限定する。
       */
      .replace(
        /(?:^|\n)Actually,\s+I(?:'ll| will)\s+go\s+with\b[\s\S]*?(?=\b[A-Z][A-Za-z$']*(?:\s+[A-Za-z$']+)+\s*の『[^』]{1,120}』|\b[A-Z][a-z]+\s*の『[^』]{1,120}』|[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]{1,20}の『[^』]{1,120}』|[\u3040-\u309F\u30A0-\u30FF]{2})/gi,
        (m) => (m.startsWith('\n') ? '\n' : ''),
      )
      .replace(/([。．])\s*\*\s*(?=\n|$)/g, '$1')
      /** `* *Final Polish:*` 片方だけ残って `* 2018年…` になるとき（先読みは和文または4桁年） */
      .replace(/(?:^|\n)\s*\*+\s+(?=[\u3040-\u30FF\u4E00-\u9FFF]|\d{4}年)/gu, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n[ \t]+\n/g, '\n\n')
      .trim();
    if (t === before) break;
  }
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

/** 英語だけの長い思考行（comment-pack 自由枠で Gemma が全文吐くパターン） */
function isGemmaEnglishCoTLine(tr: string, jp: number): boolean {
  if (tr.length < 36) return false;
  const ratio = jp / Math.max(1, tr.length);
  if (ratio >= 0.14) return false;
  if (/の『[^』]+』/.test(tr) && jp >= 10) return false;
  const low = tr.toLowerCase();
  return (
    /\bthe\s+prompt\b/i.test(tr) ||
    /\bprompt\s+says\b/i.test(tr) ||
    /\bbasic\s+info\b/i.test(tr) ||
    /\bthe\s+basic\s+info\b/i.test(tr) ||
    /\binstruction\s+says\b/i.test(tr) ||
    /\blet's\s+try\b/i.test(low) ||
    /\bactually,\b/i.test(low) ||
    /\bhowever,\b/i.test(low) ||
    /\bi\s+must\s+/i.test(tr) ||
    /\bif\s+i\s+/i.test(low) ||
    /\bdoes\s+it\s+/i.test(low) ||
    /\bcharacter\s+count\b/i.test(low) ||
    /\btotal:\s*\d/i.test(low) ||
    /\brevised\s+draft\b/i.test(low) ||
    /\bfinal\s+text\b/i.test(low) ||
    /\bfinal\s+check\b/i.test(low) ||
    /\bwait,\b/i.test(low) ||
    /\bmy\s+text:/i.test(low) ||
    /\bis\s+this\s+/i.test(low) ||
    /\bthis\s+should\b/i.test(low) ||
    /\bready\.\s*$/i.test(tr.trim()) ||
    /\bi\s+will\s+/i.test(low) ||
    /\bi\s+need\s+to\b/i.test(low) ||
    /\bi\s+picked\b/i.test(low) ||
    /\bone\s+final\b/i.test(low) ||
    /\bartist\/song\b/i.test(low) ||
    /\bno\s+repetition\b/i.test(low) ||
    /\(check\)/i.test(tr) ||
    /\bcheck:\s*$/i.test(tr.trim()) ||
    /\bdoes\s+this\s+repeat\b/i.test(low) ||
    /\btoo\s+close\?/i.test(low) ||
    /\bi\s+didnt\s+use\b/i.test(low) ||
    /\bcharacter\s+count\s+check\b/i.test(low) ||
    /\bfinal\s+version\s*:/i.test(low) ||
    /\battempt\s+\d+\s*\*?\s*:/i.test(low) ||
    (/\bactually,\s+i'?ll\s+go\s+with\b/i.test(low) &&
      jp / Math.max(1, tr.length) < 0.28) ||
    (/\bdraft\s*\d+\b/i.test(low) && jp / Math.max(1, tr.length) < 0.35) ||
    (/\(\d+\s*chars?\)\s*-\s*\*/i.test(tr) && jp < 25) ||
    (/\bfinal\s+polish\s*:/i.test(low) && jp < 30) ||
    (/\bfinal\s+version\s+selection\s*:/i.test(low) && jp < 30) ||
    /\bconstraint\s+check\b/i.test(low) ||
    /\bsentence\s+[123]\b/i.test(low) ||
    /\bincludes\s+year\b/i.test(low) ||
    /\bqualitative\s+success\b/i.test(low) ||
    /\bno\s+specific\s+numbers\b/i.test(low) ||
    /\blength\s+check\b/i.test(low) ||
    /^length:\s*~?\s*\d/i.test(low)
  );
}

/**
 * 英語 CoT のあとにだけ日本語段落があるとき、下から最初の「日本語が濃い」段落を採用する。
 */
function extractLastJapaneseDenseParagraph(text: string): string {
  const paras = text
    .replace(/\r\n/g, '\n')
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (let i = paras.length - 1; i >= 0; i--) {
    const p = paras[i];
    const jp = countJpChars(p);
    const len = Math.max(1, p.length);
    if (jp < 20 || len < 32) continue;
    const ratio = jp / len;
    /** 英語 CoT と日本語が同一段落に混ざると比率が下がるため長文は閾値を緩める */
    const minRatio = len > 220 ? 0.22 : 0.32;
    if (ratio < minRatio) continue;
    if (
      /\b(basic\s+info|the\s+prompt|actually,|let\'?s\s+try|final\s+text|final\s+selection|constraint\s+check|sentence\s+[123]|character\s+count|total:\s*\d|\*?\s*draft\s*\d)\b/i.test(
        p,
      ) &&
      ratio < 0.55
    ) {
      continue;
    }
    return p;
  }
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (let j = lines.length - 1; j >= 0; j--) {
    const tr = lines[j].trim();
    const jp = countJpChars(tr);
    if (jp >= 18 && tr.length >= 28 && jp / Math.max(1, tr.length) > 0.42) return tr;
  }
  return '';
}

/**
 * Gemma が英語の思考・指示文（* Role / Final Draft / prompt 内省 …）を本文に混ぜる対策。
 * 行単位で英語メタを落とし、それでも残るときは日本語が最も濃い段落／連続行を採用する。
 */
export function stripGemmaCoTLeakage(raw: string): string {
  let t = stripGemmaLeadingTotalsAndAck(raw.replace(/\r\n/g, '\n').trim());
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
      /^Total:\s*\d+\s*characters?\.?$/i.test(tr) ||
      (/^(Final Draft|Final\s+selection|Draft)\s*:/i.test(tr) && jp < 6) ||
      (/^\*{1,3}\s+\*{1,3}\s*Constraint\s+Check/i.test(tr) && jp < 20) ||
      (/^\*{1,3}\s+\*{1,3}\s*Sentence\s+\d/i.test(tr) && jp < 8) ||
      (/^\s*\*\s+Includes\b/i.test(tr) && jp < 22) ||
      (/^\s*Length:\s*~?\s*\d+\s*characters?/i.test(tr) && jp < 30) ||
      (/^\*?\s*Final\s+Text\s+Construction\s*\*?\s*:?/i.test(tr) && jp < 12) ||
      (/^\*Final Version\*?:?/i.test(tr) && jp < 8) ||
      (/^One detail:/i.test(tr) && jp < 8) ||
      (/^(Let\'s|I should|My draft|The prompt asks)\b/i.test(tr) && jp < 6) ||
      (/^\*\w/i.test(tr) && jp < 4 && tr.length > 18) ||
      (/^[-•*]\s*"/.test(tr) && jp < 5 && tr.length > 20) ||
      (/^(Final\s+text|Final\s+Text|Final\s+Polish)\s*:/i.test(tr) && jp < 10) ||
      (/^\*?\s*Revised\s+Draft\s*:/i.test(tr) && jp < 10) ||
      (/^\*?\s*Artist\/Song\s+usage/i.test(tr) && jp < 12) ||
      (/^\*{1,3}\s+\*{1,3}\s*Final\s+Text/i.test(tr) && jp < 40) ||
      (/^\s*Final\s+Version\s*:/i.test(tr) && jp < 40) ||
      (/^\*{1,3}\s+\*{1,3}\s*Attempt\s+\d/i.test(tr) && jp < 40) ||
      (/^\*{1,3}\s+\*{1,3}\s*Character\s+Count/i.test(tr) && jp < 30) ||
      (/^\s*Character\s+Count\s+Check\s*:/i.test(tr) && jp < 25) ||
      (/^\s*Final\s+check\s*:/i.test(tr) && jp < 40) ||
      (/^\*{1,3}\s+\*{1,3}\s*Refined/i.test(tr) && jp < 40) ||
      (/^\*{1,3}\s+\*{1,3}\s*Draft/i.test(tr) && jp < 55) ||
      (/^\*{1,3}\s+\*{1,3}\s*Final\s+Polish/i.test(tr) && jp < 55) ||
      (/^\*+\s*Final\s+Polish\s*\*?\s*:/i.test(tr) && jp < 55) ||
      (/^\*{1,3}\s+\*{1,3}\s*Final\s+Version\s+Selection/i.test(tr) && jp < 55) ||
      (/^\*+\s*Final\s+Version\s+Selection\s*\*?\s*:/i.test(tr) && jp < 55) ||
      (/^\s*\(\d+\s*chars?\)\s*-\s*\*/i.test(tr) && jp < 22) ||
      (/^\s*\d+:\s/.test(tr) && (tr.match(/\(\d+\)/g) ?? []).length >= 6 && jp < 40) ||
      (/^\s*-\s+(No\s+repetition|Focused\s+on|No\s+unfounded|No\s+English)/i.test(tr) && jp < 18);
    const mostlyAsciiJunk =
      jp < 4 &&
      tr.length > 35 &&
      jp / Math.max(1, tr.length) < 0.06 &&
      /[A-Za-z]{12,}/.test(tr);
    const englishCoT = isGemmaEnglishCoTLine(tr, jp);
    if (!startedJp) {
      if (isMetaLine || mostlyAsciiJunk || englishCoT) continue;
      if (jp >= 5 && tr.length >= 8) startedJp = true;
      else if (jp >= 3 && /の『[^』]+』/.test(tr)) startedJp = true;
      else if (!isMetaLine && tr.length < 50 && jp >= 4) startedJp = true;
      else continue;
    }
    if (startedJp && isMetaLine && jp < 8) continue;
    if (startedJp && mostlyAsciiJunk) continue;
    if (startedJp && englishCoT) continue;
    kept.push(line);
  }
  t = stripGemmaStarMetaLabels(kept.join('\n').trim());

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

  const jpAfter = countJpChars(t);
  const lenAfter = Math.max(1, t.length);
  if (t.length > 90 && jpAfter / lenAfter < 0.24) {
    const tail = extractLastJapaneseDenseParagraph(raw);
    if (tail.length >= 28) t = tail;
  }

  t = stripTrailingGemmaEnglishLines(t);
  return stripGemmaLeadingTotalsAndAck(t).trim();
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
      if (
        /\b(the\s+prompt|prompt\s+says|basic\s+info|let\'?s\s+try|actually,|i\s+must\s+|final\s+text|final\s+selection|constraint\s+check|sentence\s+[123]|character\s+count|total:\s*\d|\*?\s*draft\s*\d)\b/i.test(
          p,
        ) &&
        jp < len * 0.52
      ) {
        return { p: '', score: -1 };
      }
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
    if (dense && !GEMMA_LINE_META.test(tr) && !isGemmaEnglishCoTLine(tr, jp)) {
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
    if (jp < 4 && /draft|character|selection|sentence|constraint|length\s+check|moderator/i.test(tr))
      lines.pop();
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
    if (/^\s*Final\s+text\s*:\s*$/i.test(tr)) {
      lines.shift();
      continue;
    }
    if (/^\s*Final\s+selection\s*:\s*$/i.test(tr)) {
      lines.shift();
      continue;
    }
    if (/^\*{1,3}\s+\*{1,3}\s*Constraint\s+Check\s*\*?\s*:?\s*$/i.test(tr)) {
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
      .replace(/^\s*Final\s+text\s*:\s*/i, '')
      .replace(/^\s*Final\s+selection\s*:\s*/i, '')
      .replace(
        /^\s*(?:Perfect|Great|Okay|Good|Sure|Understood|Excellent|Alright|Yes|Nice|Correct|Right)[.,!]?\s+/i,
        '',
      )
      .replace(/^(?:Perfect|Great|Okay|Good|Sure)\.(?=[A-Za-z\u3040-\u30FF\u4E00-\u9FFF])/i, '')
      .replace(/^(?:Perfect|Great|Okay|Good|Sure)\.\s*\*\s*(?=[\u3040-\u30FF\u4E00-\u9FFF])/iu, '')
      /** `* 日本語…` のように見出し除去後に孤立した `*` */
      .replace(/^\s*\*\s+(?=[\u3040-\u30FF\u4E00-\u9FFF])/u, '');
  }
  return stripGemmaStarMetaLabels(lines.join('\n').trim());
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
    /\*Wait\*|Metadata provided:|\*\s+Artist:|\*\s+Song Title:|One detail:|\*Final Version\*|Final Version:|Final\s+Text\s+Construction|Final\s+Version\s*:|Final\s+Version\s+Selection|Final\s+check\s*:|Character\s+Count\s+Check|\*{1,3}\s+\*{1,3}\s*Final\s+Text|\*{1,3}\s+\*{1,3}\s*Final\s+Polish|\*{1,3}\s+\*{1,3}\s*Final\s+Version\s+Selection|\*{1,3}\s+\*{1,3}\s*Refined|\*{1,3}\s+\*{1,3}\s*Draft|\*{1,3}\s+\*{1,3}\s*Sentence\s+\d|\*{1,3}\s+\*{1,3}\s*Constraint\s+Check|\*\s*Final\s+Polish\s*:|\(\d+\s*chars?\)\s*-\s*\*|Attempt\s+\d+\s*\*?\s*:|Total:\s*\d+\s*characters?|Length:\s*~?\s*\d+\s*characters?|Final\s+text\s*:|Final\s+selection\s*:|Constraint\s+Check|Sentence\s+[123]\s*:|the\s+prompt\s+says|Basic\s+info:|Actually,\s*the\s+prompt|Actually,\s+I'?ll\s+go\s+with|^\s*(?:Perfect|Great|Okay)\b[.,]?\s+/im.test(
      t,
    );
  if (!looksLeaked) return t;

  const lines = t.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.length < 35) continue;
    if (!/の『[^』]{1,120}』/.test(line)) continue;
    if (!/[\u3040-\u30FF\u4E00-\u9FFF]/.test(line)) continue;
    return stripGemmaLeadingTotalsAndAck(lines.slice(i).join('\n').trim());
  }

  const paras = t.split(/\n\n+/);
  for (let i = paras.length - 1; i >= 0; i--) {
    const p = paras[i].trim();
    if (p.length < 40) continue;
    if (!/の『[^』]+』/.test(p)) continue;
    const jpChars = (p.match(/[\u3040-\u30FF\u4E00-\u9FFF]/g) ?? []).length;
    if (jpChars >= 15 && jpChars / Math.max(1, p.length) > 0.12) return stripGemmaLeadingTotalsAndAck(p);
  }

  const re = /[A-Za-z0-9'’ ,.$-]+の『[^』]{1,120}』[\s\S]{20,2000}/g;
  const matches = [...t.matchAll(re)];
  if (matches.length > 0) {
    const last = matches[matches.length - 1][0].trim();
    const jpChars = (last.match(/[\u3040-\u30FF\u4E00-\u9FFF]/g) ?? []).length;
    if (jpChars >= 15) return stripGemmaLeadingTotalsAndAck(last);
  }
  return stripGemmaLeadingTotalsAndAck(t);
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
  const sTrim = s.replace(/\r\n/g, '\n').trim();
  /** Draft/Sentence 複数案は星ラベル除去より先に「…の『』」へ飛ばす（先に strip すると MultiDraft が効かない） */
  const pre0 = stripGemmaMultiDraftIntroPrefix(sTrim);
  const pre = stripGemmaEnglishPreambles(stripGemmaStarMetaLabels(pre0));
  const peeled = stripGemmaCoTLeakage(pre);
  const collapsed = collapseImmediateDuplicateBody(sanitizeGemmaVisibleOutputText(peeled));
  const deduped = dedupeRoughJapaneseSentences(stripGemmaTrailingCharEnumeratorRun(collapsed));
  return stripGemmaStrayClosingQuoteBeforePeriod(
    stripGemmaLeadingTotalsAndAck(stripGemmaStarMetaLabels(deduped)),
  ).trim();
}

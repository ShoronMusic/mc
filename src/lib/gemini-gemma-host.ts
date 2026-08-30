/**
 * Gemini API 上の Gemma（hosted）向け: thinking 無効化・本文への思考漏れ対策
 */

import type { ModelParams } from '@google/generative-ai';
import { isEnglishInstructionOrPlanningLeak } from '@/lib/ai-output-policy';

function countJpChars(s: string): number {
  return (s.match(/[\u3040-\u30FF\u4E00-\u9FFF]/g) ?? []).length;
}

const GEMMA_COT_STRONG_MARKERS =
  /\*\s*Role:\s*Assistant|Assistant moderator for|\*\s*Task:|\*\s*Constraints?:|Final Draft:|Final\s+selection\s*:|Final\s+text\s*:|Constraint\s+Check|Sentence\s+\d\s*\*?\s*:|Final\s+Text\s+Construction|Final\s+Polish|Final\s+check\s*:|Revised\s+Draft|Basic\s+info:|the\s+prompt\s+says|Total:\s*\d+\s*characters?|->\s*\d+\s*characters?|Length:\s*~?\s*\d+\s*characters?|Length\s*\?|Length\s+is\s+(?:around|about)|Fits\s+the\s+\d{2,3}\s*[-–]\s*\d{2,3}\s+range|Does it put|Is it\s+\d{2,3}\s*[-–]\s*\d{2,3}\s*chars|Current year:|No chart rankings|Correct labels:|terminology for album|No detailed sound|First sentence:|Genre\/Position:|Theme\/Mood:|\bare safe\b|My draft starts|\*Self-Correction|Let\'s check the first comment|\bOne detail:|\bJust the Japanese text\b|\bno meta-?notes\b|\*Final Version\*|^\s*\*Final Version\*|Final\s+Version\s*:|Final\s+Version\s+Selection|Attempt\s+\d+\s*\*?\s*:|Character\s+Count\s+Check|\*{1,3}\s+\*{1,3}\s*Final\s+Text|\*{1,3}\s+\*{1,3}\s*Final\s+Polish|\*{1,3}\s+\*{1,3}\s*Final\s+Version\s+Selection|\*{1,3}\s+\*{1,3}\s*Refined|\*{1,3}\s+\*{1,3}\s*Draft|\*{1,3}\s+\*{1,3}\s*Sentence\s+\d|\*{1,3}\s+\*{1,3}\s*Constraint\s+Check|\*\s*Final\s+Polish\s*:|Actually,\s+I'?ll\s+go\s+with|\(\d+\s*chars?\)\s*-\s*\*|\bRelease year\s*:|\bToo generic\b|\bMatches all criteria\b|\bCharacter count:\s*approx|\bCheck constraints\s*:|\bDesu\/masu\b|\bI need to mention\b|\*\s*Refining\s*:|\*\s*Draft\s+\d+\s*:|Priority for talking points|talking points\s*\(while song is playing\)|No irrelevant artists|no specific chart numbers|no fake info|Use rotating intros|Natural conversation\s*\(|\*\s*Priority\s*:|Priority:\s*User'?s topic|Search Block|Intro phrase rotation|Tone:\s*Friendly/i;

const GEMMA_LINE_META =
  /^\s*(\*\s*)?(Role|Task|Constraints?)\s*:/i;

/** Total: 112 characters. / Perfect.Post … など comment-pack 先頭ノイズ */
function stripGemmaLeadingTotalsAndAck(text: string): string {
  let t = text.replace(/\r\n/g, '\n').trim();
  if (!t) return t;
  /** `"Post Maloneの『` のように先頭だけ ASCII 引用が付いたケース */
  t = t.replace(/^"\s*(?=[\u3040-\u30FF\u4E00-\u9FFFA-Za-z])/u, '');
  t = t.replace(/^\s*\*\s*"\s*/u, '');
  for (let i = 0; i < 12; i++) {
    const before = t;
    t = t
      .replace(/^Total:\s*\d+\s*characters?\.?\s*/i, '')
      .replace(/^Total\s+chars?:\s*~?\s*\d{1,4}\.?\s*/i, '')
      .replace(/^Final\s+characters?:\s*~?\s*\d{1,4}\.?\s*/i, '')
      .replace(/^Final\s+(?:character\s+)?count:\s*~?\s*\d{1,4}\.?\s*/i, '')
      .replace(/^Final\s+confirmation(?:\s+on\s+names)?\s*:?\s*\n?/i, '')
      .replace(/^\s*Artist:\s*[^\n]+\n?/i, '')
      .replace(/^\s*Song:\s*[^\n]+\n?/i, '')
      .replace(/^\(\s*All correct\s*\)\s*/i, '')
      .replace(/^Current\s+year\s*:\s*\d{4}\.?\s*/i, '')
      .replace(/^Wait,\s+is[\s\S]{0,800}?\bYes\.?\s*/i, '')
      /** `- No "One detail:", no English, no meta-notes. Just the Japanese text.The Weekndの『` */
      .replace(/^[-•]\s+(?=No\s)/i, '')
      .replace(
        /^(?:[-*•]\s+)?No\s+"?One detail:?["']?,?\s*no English,?\s*no meta-?notes\.?\s*Just the Japanese text\.?\s*/i,
        '',
      )
      .replace(/^(?:[-*•]\s+)?No\s+"?One detail:?["']?,?\s*/i, '')
      .replace(/^no English,?\s*/i, '')
      .replace(/^no meta-?notes\.?\s*/i, '')
      .replace(/^Just the Japanese text\.?\s*/i, '')
      /** `豆知識ですが": Check.` / `- Only Japanese: Check.Weekndは` */
      .replace(/^豆知識[^\n]{0,24}?Check\.?\s*/u, '')
      .replace(/^\s*[-•*]\s*Only Japanese:?\s*Check\.?\s*/i, '')
      .replace(/^Only Japanese:?\s*Check\.?\s*/i, '')
      /** `豆知識"? Check.The Weekndが…` 枠名の自己確認が本文に張り付く */
      .replace(/^(?:豆知識|自由(?:コメント)?|基本|歌詞|功績|アレンジ|選曲)["']\??\s*Check\.?\s*/u, '')
      .replace(/^["']\??\s*Check\.?\s*/u, '')
      .replace(/^Check\.(?=[A-Za-z0-9\u3040-\u30FF\u4E00-\u9FFF])/i, '')
      .replace(/^(?:\*+\s*)?Draft\s*\d+\s*(?:\([^)]{0,48}\))?\s*\*?\s*:?\s*/i, '')
      /** `Constraint: No album name…` / `* Constraint: Focus on expression…).歌詞では` */
      .replace(
        /^\s*(?:\*+\s*)?Constraints?:\s*[^\n\u3040-\u30FF\u4E00-\u9FFF]+(?=[\u3040-\u30FF\u4E00-\u9FFF])/iu,
        '',
      )
      .replace(/^\s*(?:\*+\s*)?Constraints?:\s*[^\n]+\n+/i, '')
      /** `* Polite tone.The Weekndの『` */
      .replace(/^(?:\*+\s*)?(?:Polite|Casual|Formal|Friendly|Neutral)\s+tone\.?\s*/i, '')
      /** `112 characters. Perfect.` の残骸 `characters. Perfect.` */
      .replace(/^(?:(?:->|→|⇒|=>)\s*)?(?:~?\d{1,4}\s+)?characters?\.?\s*/i, '')
      /** `Perfect.Post` / `Perfect.2024年` / `Perfect.歌詞` */
      .replace(/^\(?\s*(?:Perfect|Great|Okay|Good|Sure|Check|Ready|Done)\s*\)?\.(?=[A-Za-z0-9\u3040-\u30FF\u4E00-\u9FFF])/i, '')
      /** `Perfect. *` の直後に和文（Constraint Check ブロック末尾） */
      .replace(/^(?:Perfect|Great|Okay|Good|Sure|Ready|Done)\.\s*\*\s*(?=[\u3040-\u30FF\u4E00-\u9FFF])/iu, '')
      .replace(
        /^\s*(?:Perfect|Great|Okay|Good|Sure|Understood|Excellent|Alright|Yes|Nice|Correct|Right|Ready|Done)[.,!]?\s+/i,
        '',
      )
      .replace(/^\*+\s+(?=[A-Za-z\u3040-\u30FF\u4E00-\u9FFF])/u, '')
      .replace(/^(?:\*+\s*)?(?:Numbers|Forbidden content|Length|Tone)\s*:\s*/i, '')
      .replace(/^Desu\/Masu\.?\s*/i, '')
      .replace(/^(?:Desu\/)?Masu\.?\s*/i, '')
      .replace(/^\d+\s+sentences?\.?\s*/i, '')
      .replace(/^Approx\.?\s*\d{1,4}\s+characters?\.?\s*/i, '')
      /** `Length is around 120 characters. Fits the 80-150 range.The Weekndの『` */
      .replace(
        /^Length\s+is\s+(?:around|about|approx(?:imately)?|roughly)\s*~?\s*\d{1,4}\s*characters?\.?\s*/i,
        '',
      )
      .replace(/^Length\s*[?:]\s*~?\s*\d{1,4}\s*characters?\.?\s*/i, '')
      .replace(
        /^Fits\s+(?:within\s+)?(?:the\s+)?\d{1,4}\s*[-–〜~]\s*\d{1,4}(?:\s+characters?)?\s+range\.?\s*/i,
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
  const hasDraftMarks =
    /\*\s*\*\s*Draft\s*\d/i.test(t) ||
    /\*Draft\s*\d+/i.test(t) ||
    /\bDraft\s+\d+\s*(?:\([^)]{0,48}\))?\s*:/i.test(t) ||
    /\*\s*\*\s*Sentence\s+\d/i.test(t);
  if (!hasDraftMarks) return t;
  const preferLastBody =
    /\bDraft\s*[2-9]\b/i.test(t) ||
    /\bRefining\b/i.test(t) ||
    /\(\s*Better,/i.test(t) ||
    /\(\s*Too simple/i.test(t);
  if (preferLastBody) {
    const run = extractLastJapaneseSentenceRun(t);
    if (countJpChars(run) >= 16) return run;
  }
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

/**
 * モデルが文字数制約の自己チェックとして本文末尾に付けるメタを除去。
 * 例: `(136文字)` / `（約120字）` / `(112 characters)` / `(136文字)。`
 */
const TRAILING_CHAR_COUNT_META =
  /(?:Total|Final)\s+(?:character\s+)?(?:count|characters?|chars?)\s*:\s*~?\s*\d{1,4}\s*(?:characters?|chars?)?\.?/i;

export function stripTrailingSelfReportedCharCount(raw: string): string {
  let t = typeof raw === 'string' ? raw : '';
  if (!t) return t;
  for (let i = 0; i < 6; i++) {
    const before = t;
    t = t.replace(
      /\s*[（(]\s*(?:約\s*)?\d{1,4}\s*(?:文字|字|characters?|chars?)\s*[）)]\s*[。．.]?\s*$/iu,
      '',
    );
    t = t.replace(new RegExp(`\\s*${TRAILING_CHAR_COUNT_META.source}\\s*[。．.]?\\s*$`, 'i'), '');
    t = t.replace(
      new RegExp(`([。．])\\s*${TRAILING_CHAR_COUNT_META.source}\\s*[。．.]?\\s*$`, 'i'),
      '$1',
    );
    if (t === before) break;
  }
  return t.trimEnd();
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
      .replace(/\s*\*{1,3}\s+\*{1,3}\s*Draft\s*\d+\s*(?:\([^)]{0,48}\))?\s*\*?\s*:\s*/gi, ' ')
      .replace(/\s*\*+\s*Draft\s*\d+\s*(?:\([^)]{0,48}\))?\s*\*?\s*:\s*/gi, ' ')
      .replace(/(?:^|\n)\s*Draft\s*\d+\s*(?:\([^)]{0,48}\))?\s*\*?\s*:\s*/gi, '\n')
      .replace(/\s*\*{1,3}\s+\*{1,3}\s*Sentence\s+\d+\s*\*?\s*:\s*/gi, ' ')
      .replace(/\s*\*+\s*Sentence\s+\d+\s*\*?\s*:\s*/gi, ' ')
      /** `* *First sentence:*` / `* *Genre/Position:*` / `* *Closing (Global hit):*` */
      .replace(
        /\s*\*{1,3}\s+\*{1,3}\s*[A-Za-z][A-Za-z0-9 /&()'.,+-]{0,48}(?:\([^)]{0,40}\))?\s*\*?\s*:\s*/g,
        ' ',
      )
      .replace(
        /\s*\*+\s*(?:First sentence|Genre(?:\/Position)?|Theme(?:\/Mood)?|Closing|Sound(?:\s*analysis)?)\b[^*:\n]{0,40}\*?\s*:\s*/gi,
        ' ',
      )
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
      .replace(/([。．])\s*\*+\s*(?=[\u3040-\u30FF\u4E00-\u9FFF]|[A-Z]|\n|$)/g, '$1')
      .replace(/([、，])\s*\*+\s+(?=[\u3040-\u30FF\u4E00-\u9FFF0-9])/g, '$1')
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
  const low = tr.toLowerCase();
  const nameCheck =
    /\bwait,\s+is\b/i.test(low) ||
    /\bmetadata says\b/i.test(low) ||
    /\bfinal confirmation\b/i.test(low) ||
    /\ball correct\b/i.test(low) ||
    /\bcorrect artist name\b/i.test(low) ||
    /\bjust the japanese text\b/i.test(low) ||
    /\bno meta-?notes\b/i.test(low) ||
    /\bone detail\b/i.test(low) ||
    /["']\?\s*check\b/i.test(low) ||
    /^豆知識["']\?/u.test(tr) ||
    /^\s*\*?\s*constraints?:\s/i.test(low) ||
    /\bonly japanese\b/i.test(low) ||
    /^豆知識ですが/u.test(tr);
  if (ratio >= 0.14 && !nameCheck) return false;
  if (/の『[^』]+』/.test(tr) && jp >= 10 && !nameCheck) return false;
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
    /^length:\s*~?\s*\d/i.test(low) ||
    /\brelease year\s*:/i.test(low) ||
    /\brelease year\s*\/\s*album/i.test(low) ||
    /\bgenre\s*\/\s*positioning/i.test(low) ||
    /\btheme\s*\/\s*atmosphere/i.test(low) ||
    /\btotal\s+characters?\s*:/i.test(low) ||
    /\bi need to mention\b/i.test(low) ||
    /\btoo generic\b/i.test(low) ||
    /\bmatches all criteria\b/i.test(low) ||
    /\bcharacter count:\s*approx/i.test(low) ||
    /\bcheck constraints\b/i.test(low) ||
    /\bdesu\/masu\b/i.test(low) ||
    /\bknown as a part of\b/i.test(low) ||
    /\bexpected to hit charts\b/i.test(low) ||
    /\bno guest artists\b/i.test(low) ||
    /\bno preamble\b/i.test(low) ||
    /\bfocused on lyrics\b/i.test(low) ||
    /^\*\s*refining\s*:/i.test(low) ||
    /^\*?\s*numbers\s*:/i.test(low) ||
    /\bforbidden content\b/i.test(low) ||
    /\bno personal stories\b/i.test(low) ||
    /\bno recording details\b/i.test(low) ||
    /^\*?\s*length:\s*\d+\s+sentences/i.test(low) ||
    /^\*?\s*tone:\s*desu/i.test(low) ||
    /\bapprox\.?\s*\d+\s+characters?\b/i.test(low) ||
    /^(?:->|→|⇒|=>)\s*~?\d+\s+characters?/i.test(low) ||
    /\blength is (?:around|about|approx)/i.test(low) ||
    /^length\s*\?\s*~?\s*\d/i.test(low) ||
    /\bfits (?:within )?the \d{2,3}\s*[-–〜~]\s*\d{2,3}(?:\s+characters?)?\s+range/i.test(low) ||
    /\bare safe\b/i.test(low) ||
    /\bfirst sentence\s*:/i.test(low) ||
    /\bno detailed sound\b/i.test(low) ||
    /\bterminology for album\b/i.test(low) ||
    /\bfinal confirmation\b/i.test(low) ||
    /\btotal\s+chars?\s*:/i.test(low) ||
    /\ball correct\b/i.test(low) ||
    /\bmetadata says\b/i.test(low) ||
    /\bjust the japanese text\b/i.test(low) ||
    /\bno meta-?notes\b/i.test(low) ||
    /\bone detail\b/i.test(low)
  );
}

function isGemmaNameCheckMetaLine(tr: string): boolean {
  return (
    /^Final\s+confirmation(?:\s+on\s+names)?\s*:?/i.test(tr) ||
    (/^\s*Artist:\s+/i.test(tr) && countJpChars(tr) < 10) ||
    (/^\s*Song:\s+/i.test(tr) && countJpChars(tr) < 10) ||
    /^\(\s*All correct\s*\)/i.test(tr) ||
    /^Wait,\s+is\b/i.test(tr) ||
    /\bMetadata says\b/i.test(tr) ||
    /\bcorrect artist name\b/i.test(tr)
  );
}

/** `* Draft 1: 本文 * Refining: …` のように同一行へ連結された思考を行に分ける */
function explodeGemmaInlineCotBlobs(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\(\s*Too generic\?[^)]*\)/gi, '\n')
    .replace(/\(\s*Too simple[^)]*\)\.?/gi, '\n')
    .replace(/\(\s*Better,[^)]*\)\.?/gi, '\n')
    .replace(/\(\s*Character count:[^)]*\)/gi, '\n')
    .replace(/\bMatches all criteria\.?/gi, '\n')
    .replace(/\s+\*\s+/g, '\n* ');
}

/** 英語の思考と日本語本文が同一行に混ざる（自由枠で多い） */
function hasSameLineEnglishJapaneseMix(text: string): boolean {
  const lines = explodeGemmaInlineCotBlobs(text).split('\n');
  const originals = text.replace(/\r\n/g, '\n').split('\n');
  for (const line of [...originals, ...lines]) {
    const tr = line.trim();
    if (!tr) continue;
    const jp = countJpChars(tr);
    const ascii = (tr.match(/[A-Za-z]/g) ?? []).length;
    if (jp >= 12 && ascii >= 12 && jp / Math.max(1, tr.length) < 0.72) return true;
    if (
      jp >= 8 &&
      /\b(Release year|Draft \s*\d+|Refining|Check constraints|Too generic|Too simple|Matches all criteria|Character count|Desu\/masu|I need to mention|Numbers|Forbidden content|Tone|All correct|Total chars|One detail|Just the Japanese text|Only Japanese|meta-?notes|豆知識["']\?|Constraints?:)\b/i.test(
        tr,
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * 英語思考のあとに置かれた「最後の日本語文の連なり」を採用する（自由コメントは の『』 が無い）。
 */
function extractLastJapaneseSentenceRun(text: string): string {
  const t = explodeGemmaInlineCotBlobs(stripGemmaLeadingTotalsAndAck(text));
  const sentenceRe =
    /(?:[A-Za-z][A-Za-z0-9'’ &$ -]{0,48}|\d{4})?[\u3040-\u30FF\u4E00-\u9FFF][^。．*]{6,320}[。．]/g;
  const sentences = [...t.matchAll(sentenceRe)]
    .map((m) => (m[0] ?? '').trim().replace(/^\*+\s*/, ''))
    .filter((s) => {
      const jp = countJpChars(s);
      const ratio = jp / Math.max(1, s.length);
      const hasTitleCue = /の『[^』]{1,120}』/.test(s);
      /** 英名アーティスト＋英題＋英アルバムだと漢字かなが薄く、書き出し文が捨てられて雰囲気文だけ残る */
      if (jp < 16 || (ratio < 0.28 && !hasTitleCue)) return false;
      if (hasTitleCue && jp < 10) return false;
      if (
        /\b(too generic|fits constraints|character count|matches all criteria|refining|check constraints|desu\/masu|release year|i need to mention|wait,\s+is|metadata says|total chars?|final confirmation|all correct|correct artist name|just the japanese text|one detail|meta-?notes)\b/i.test(
          s,
        ) ||
        /(?:豆知識|自由(?:コメント)?|基本)["']\?\s*Check\./u.test(s)
      ) {
        return false;
      }
      return true;
    });
  if (sentences.length === 0) return '';
  let run = sentences[sentences.length - 1] ?? '';
  for (let i = sentences.length - 2; i >= 0; i--) {
    const prev = sentences[i] ?? '';
    const idxPrev = t.lastIndexOf(prev);
    const idxRun = t.lastIndexOf(run);
    if (idxPrev < 0 || idxRun < 0 || idxPrev >= idxRun) break;
    const between = t.slice(idxPrev + prev.length, idxRun);
    if (
      /\bDraft\s*\d/i.test(between) ||
      /\bRefining\b/i.test(between) ||
      /\(\s*(?:Better|Too simple)/i.test(between)
    ) {
      break;
    }
    if (between.replace(/[\s*]/g, '').length > 8) break;
    run = `${prev}${run}`;
  }
  return preferTitledJapaneseRun(sentences, run, t);
}

function isThinGenericHitBlurb(s: string): boolean {
  const jp = countJpChars(s);
  if (jp >= 70) return false;
  if (/の『[^』]{1,120}』/.test(s)) return false;
  if (/アルバム|収録|リリース|\d{4}年(?!代)/.test(s)) return false;
  return /世界観|広く知られ|世界的な(?:大)?ヒット|象徴する/.test(s);
}

/** 最後の文が雰囲気・ヒット概説だけなら、直前の「〇〇の『曲』」本文を落とさない */
function preferTitledJapaneseRun(sentences: string[], run: string, source: string): string {
  const titled = sentences.filter((s) => /の『[^』]{1,120}』/.test(s));
  if (titled.length === 0 || /の『[^』]{1,120}』/.test(run)) return run;
  const lastTitle = titled[titled.length - 1] ?? '';
  if (!lastTitle) return run;
  const idxTitle = source.lastIndexOf(lastTitle);
  const idxRun = source.lastIndexOf(run);
  const between =
    idxTitle >= 0 && idxRun > idxTitle ? source.slice(idxTitle + lastTitle.length, idxRun) : '';
  const draftBreak =
    /\bDraft\s*\d/i.test(between) ||
    /\bRefining\b/i.test(between) ||
    /\(\s*(?:Better|Too simple)/i.test(between);
  if (draftBreak) {
    return isThinGenericHitBlurb(run) ? lastTitle : run;
  }
  if (run && !lastTitle.includes(run.slice(0, Math.min(12, run.length)))) {
    return `${lastTitle}${run}`;
  }
  return lastTitle || run;
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
  let t = stripGemmaLeadingTotalsAndAck(
    stripGemmaConstraintSelfCheck(explodeGemmaInlineCotBlobs(raw.replace(/\r\n/g, '\n')).trim()),
  );
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
    if (isGemmaNameCheckMetaLine(tr)) {
      const after = stripGemmaLeadingTotalsAndAck(tr);
      if (
        countJpChars(after) >= 16 &&
        !/^Wait,/i.test(after) &&
        !/\bMetadata says\b/i.test(after) &&
        !/\bcorrect artist name\b/i.test(after)
      ) {
        startedJp = true;
        kept.push(after);
      }
      continue;
    }
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
      (/^\s*Length\s*\?\s*~?\s*\d+\s*characters?/i.test(tr) && jp < 30) ||
      (/^(?:->|→|⇒|=>)\s*~?\d+\s+characters?/i.test(tr) && jp < 20) ||
      (/^\s*Length\s+is\s+(?:around|about|approx)/i.test(tr) && jp < 40) ||
      (/^\s*Fits\s+(?:within\s+)?(?:the\s+)?\d{1,4}\s*[-–〜~]/i.test(tr) && jp < 20) ||
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
      (/^\s*-\s+(No\s+repetition|Focused\s+on|No\s+unfounded|No\s+English)/i.test(tr) && jp < 18) ||
      (/^\s*\*?\s*Numbers\s*:/i.test(tr) && jp < 10) ||
      (/^\s*\*?\s*Forbidden content\s*:/i.test(tr) && jp < 12) ||
      (/^\s*\*?\s*Length\s*:\s*\d+\s+sentences/i.test(tr) && jp < 12) ||
      (/^\s*\*?\s*Tone\s*:\s*Desu/i.test(tr) && jp < 10) ||
      /^Total\s+chars?:\s*\d/i.test(tr);
    const mostlyAsciiJunk =
      jp < 4 &&
      tr.length > 35 &&
      jp / Math.max(1, tr.length) < 0.06 &&
      /[A-Za-z]{12,}/.test(tr);
    const englishCoT = isGemmaEnglishCoTLine(tr, jp);
    if (englishCoT || isMetaLine) {
      if (jp >= 16) {
        const peeled = stripGemmaLeadingTotalsAndAck(tr.replace(/^\*+\s*/, ''));
        const jpStart =
          /^[\u3040-\u30FF\u4E00-\u9FFF]/.test(peeled) ||
          /^\d{4}年/.test(peeled) ||
          /の『[^』]+』/.test(peeled);
        const run = jpStart ? peeled : extractLastJapaneseSentenceRun(peeled) || peeled;
        if (countJpChars(run) >= 16) {
          startedJp = true;
          kept.push(run);
        }
      }
      continue;
    }
    if (!startedJp) {
      if (mostlyAsciiJunk) continue;
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
  if (hasSameLineEnglishJapaneseMix(raw) && !/の『[^』]{1,120}』/.test(raw)) {
    const run = extractLastJapaneseSentenceRun(raw);
    if (run.length >= 24) t = run;
  }
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

function isGemmaTrailingSelfCheckLine(tr: string): boolean {
  if (!tr) return false;
  if (
    /^\*?\s*Check\s+(?:length|priorit(?:y|ies)|prohibited|constraints?|labels?|tone|album|song)\b/i.test(
      tr,
    )
  ) {
    return true;
  }
  if (/^\*?\s*Search\s+block\s*\*?/i.test(tr)) return true;
  if (/draft|character|selection|sentence|constraint|length\s+check|moderator|positioning|atmosphere/i.test(tr)) {
    return true;
  }
  if (/^\*\s*(Does it|Is it|Did I|Have I|Do I|Genre|Theme|Release year)\b/i.test(tr)) return true;
  if (/\?\s*(?:Yes|No|None|Correct|Good)\.?\s*$/i.test(tr)) return true;
  if (/\b\d{2,3}\s*[-–]\s*\d{2,3}\s*chars?/i.test(tr)) return true;
  if (
    /(?:chart rankings|lyric analysis|instrument details|correct labels|within\s+\d{2,3}|characters?\.\s*Good)/i.test(
      tr,
    )
  ) {
    return true;
  }
  return false;
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
    /** 和文のあとに英語セルフチェックだけが続く行 */
    if (jp >= 8) {
      const m = /([。．])\s*\*?\s*(?:Check\s+(?:length|priorit|prohibited)|Search\s+block)\b/i.exec(tr);
      if (m && typeof m.index === 'number' && m.index > 0) {
        lines[lines.length - 1] = tr.slice(0, m.index + 1).trim();
        continue;
      }
      break;
    }
    if (jp < 8 && isGemmaTrailingSelfCheckLine(tr)) {
      lines.pop();
    } else break;
  }
  return lines.join('\n').trim();
}

/** `。* Does it put the artist in 『』? No.` / `* Is it 60-140 chars? Yes.` / 末尾 `Check length*:` */
function stripGemmaConstraintSelfCheck(text: string): string {
  let t = text.replace(/\r\n/g, '\n');
  t = t.replace(/^\s*\*\s*"\s*/u, '');
  for (let i = 0; i < 8; i++) {
    const before = t;
    t = t.replace(/([。．])\s*\*\s*(?:Does it|Is it|Did I|Have I|Do I)\b[^\n]*/gi, '$1');
    t = t.replace(/\n[ \t]*\*\s*(?:Does it|Is it|Did I|Have I|Do I)\b[^\n]*/gi, '');
    t = t.replace(/\n[ \t]*\*\s*Is it\s+\d{1,3}\s*[-–]\s*\d{1,3}\s*chars?\?[^\n]*/gi, '');
    t = t.replace(/\n[ \t]*\*\s*(?=[A-Za-z])[^\n]{8,100}\?\s*(Yes|No)\.?\s*$/gim, '');
    /** `terminology for album (EP)? Yes.` / `No detailed sound analysis: Yes.` */
    t = t.replace(
      /^(?:\*+\s*)?(?:No\s+)?[A-Za-z][A-Za-z0-9 /()'.,-]{3,80}(?:\([^)]{0,24}\))?\s*[?:]\s*(?:Yes|No)\.?\s*/i,
      '',
    );
    /** `話題となった" (became a topic) and "広く再生されている" (widely played) are safe.` */
    t = t.replace(
      /[^。\n]{0,80}"\s*\([^)]{2,48}\)\s+and\s+"[^"\n]{2,80}"\s*\([^)]{2,48}\)\s+are safe\.?\s*/gi,
      '',
    );
    t = t.replace(/^Current\s+year\s*:\s*\d{4}\.?\s*/i, '');
    /**
     * chat_reply 等: `名曲だと思います。Check length*: ~160…` 以降の英語セルフチェック塊。
     * Search block / Check priorities / prohibited words もまとめて落とす。
     */
    t = t.replace(
      /([。．])\s*\*?\s*Check\s+(?:length|priorit(?:y|ies)|prohibited|constraints?|labels?)\s*\*?\s*:[\s\S]*$/i,
      '$1',
    );
    t = t.replace(
      /\n[ \t]*\*?[ \t]*Check\s+(?:length|priorit(?:y|ies)|prohibited|constraints?|labels?)\s*\*?\s*:[^\n]*/gi,
      '',
    );
    t = t.replace(/\n[ \t]*\*?[ \t]*Search\s+block\s*\*?\s*:[\s\S]*$/i, '');
    t = t.replace(/([。．])\s*\*?\s*Search\s+block\s*\*?\s*:[\s\S]*$/i, '$1');
    /** `です。No chart rankings? None.` 以降の制約チェックを末尾まで落とす */
    t = t.replace(
      /([。．])\s*(?:\*\s*)?(?:No chart rankings|No detailed lyric analysis|No instrument details|No detailed sound analysis|Correct labels)\b[\s\S]*$/i,
      '$1',
    );
    /** `です。Release year/Album? … Yes.` / `* Genre/Positioning? … Yes.` */
    t = t.replace(
      /([。．])\s*(?:\*\s*)?Release year(?:\s*\/\s*Album)?\s*\?[\s\S]*$/i,
      '$1',
    );
    t = t.replace(
      /\n[ \t]*\*\s*(?:Genre\s*\/\s*Position(?:ing)?|Theme\s*\/\s*(?:Atmosphere|Mood)|Release year(?:\s*\/\s*Album)?)\s*\?[^\n]*/gi,
      '',
    );
    t = t.replace(
      /\n\s*\*\s*(?:No chart rankings|No detailed lyric|No instrument details|Correct labels)[\s\S]*$/i,
      '',
    );
    if (t === before) break;
  }
  return stripTrailingGemmaEnglishLines(t.trim());
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
      .replace(/^Final\s+characters?:\s*~?\s*\d{1,4}\.?\s*/i, '')
      .replace(/^Final\s+(?:character\s+)?count:\s*~?\s*\d{1,4}\.?\s*/i, '')
      .replace(
        /^\s*(?:\*+\s*)?Constraints?:\s*[^\n\u3040-\u30FF\u4E00-\u9FFF]+(?=[\u3040-\u30FF\u4E00-\u9FFF])/iu,
        '',
      )
      .replace(/^\s*(?:\*+\s*)?Constraints?:\s*[^\n]+\n+/i, '')
      .replace(
        /^(?:[-*•]\s+)?No\s+"?One detail:?["']?,?\s*no English,?\s*no meta-?notes\.?\s*Just the Japanese text\.?\s*/i,
        '',
      )
      .replace(/^Just the Japanese text\.?\s*/i, '')
      .replace(/^\s*\*?\s*Final\s+Text\s+Construction\s*\*?\s*:?\s*\n+/i, '')
      .replace(
        /^\s*(?:Perfect|Great|Okay|Good|Sure|Understood|Excellent|Alright|Yes|Nice|Correct|Right|Ready|Done)[.,!]?\s+/i,
        '',
      )
      .replace(/^(?:\*+\s*)?(?:Polite|Casual|Formal|Friendly|Neutral)\s+tone\.?\s*/i, '')
      .replace(/^(?:(?:->|→|⇒|=>)\s*)?(?:~?\d{1,4}\s+)?characters?\.?\s*/i, '')
      .replace(
        /^Length\s+is\s+(?:around|about|approx(?:imately)?|roughly)\s*~?\s*\d{1,4}\s*characters?\.?\s*/i,
        '',
      )
      .replace(/^Length\s*[?:]\s*~?\s*\d{1,4}\s*characters?\.?\s*/i, '')
      .replace(
        /^Fits\s+(?:within\s+)?(?:the\s+)?\d{1,4}\s*[-–〜~]\s*\d{1,4}(?:\s+characters?)?\s+range\.?\s*/i,
        '',
      )
      .replace(/^\(?\s*(?:Perfect|Great|Okay|Good|Sure|Check|Ready|Done)\s*\)?\.(?=[A-Za-z0-9\u3040-\u30FF\u4E00-\u9FFF])/i, '')
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
    if (/^\s*\*?\s*Constraints?:\s+/i.test(tr) && countJpChars(tr) < 8) {
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
        /^\s*(?:Perfect|Great|Okay|Good|Sure|Understood|Excellent|Alright|Yes|Nice|Correct|Right|Ready|Done)[.,!]?\s+/i,
        '',
      )
      .replace(/^(?:\*+\s*)?(?:Polite|Casual|Formal|Friendly|Neutral)\s+tone\.?\s*/i, '')
      .replace(/^(?:(?:->|→|⇒|=>)\s*)?(?:~?\d{1,4}\s+)?characters?\.?\s*/i, '')
      .replace(
        /^Length\s+is\s+(?:around|about|approx(?:imately)?|roughly)\s*~?\s*\d{1,4}\s*characters?\.?\s*/i,
        '',
      )
      .replace(/^Length\s*[?:]\s*~?\s*\d{1,4}\s*characters?\.?\s*/i, '')
      .replace(
        /^Fits\s+(?:within\s+)?(?:the\s+)?\d{1,4}\s*[-–〜~]\s*\d{1,4}(?:\s+characters?)?\s+range\.?\s*/i,
        '',
      )
      .replace(/^\(?\s*(?:Perfect|Great|Okay|Good|Sure|Check|Ready|Done)\s*\)?\.(?=[A-Za-z0-9\u3040-\u30FF\u4E00-\u9FFF])/i, '')
      .replace(/^(?:Perfect|Great|Okay|Good|Sure|Ready|Done)\.\s*\*\s*(?=[\u3040-\u30FF\u4E00-\u9FFF])/iu, '')
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
    /\*Wait\*|Wait,\s+is\b|Metadata provided:|Metadata says|\*\s+Artist:|\*\s+Song Title:|One detail:|\*Final Version\*|Final Version:|Final\s+Text\s+Construction|Final\s+Version\s*:|Final\s+Version\s+Selection|Final\s+check\s*:|Final confirmation on names|Character\s+Count\s+Check|\*{1,3}\s+\*{1,3}\s*Final\s+Text|\*{1,3}\s+\*{1,3}\s*Final\s+Polish|\*{1,3}\s+\*{1,3}\s*Final\s+Version\s+Selection|\*{1,3}\s+\*{1,3}\s*Refined|\*{1,3}\s+\*{1,3}\s*Draft|\*{1,3}\s+\*{1,3}\s*Sentence\s+\d|\*{1,3}\s+\*{1,3}\s*Constraint\s+Check|\*\s*Final\s+Polish\s*:|\(\d+\s*chars?\)\s*-\s*\*|Attempt\s+\d+\s*\*?\s*:|Total:\s*\d+\s*characters?|Total\s+chars?:\s*\d|->\s*\d+\s*characters?|Length:\s*~?\s*\d+\s*characters?|Length\s*\?|Length\s+is\s+(?:around|about)|Fits\s+the\s+\d{2,3}\s*[-–]\s*\d{2,3}\s+range|Does it put|Is it\s+\d{2,3}\s*[-–]\s*\d{2,3}\s*chars|Current year:|No chart rankings|Correct labels:|terminology for album|No detailed sound|First sentence:|Genre\/Position:|Theme\/Mood:|\bare safe\b|Final\s+text\s*:|Final\s+selection\s*:|Constraint\s+Check|^\s*\*?\s*Constraints?:\s|Sentence\s+[123]\s*:|the\s+prompt\s+says|Basic\s+info:|Actually,\s*the\s+prompt|Actually,\s+I'?ll\s+go\s+with|^\s*(?:Perfect|Great|Okay|Ready|Done)\b[.,]?\s+|Release year\s*:|Too generic|Matches all criteria|Character count:\s*approx|Check constraints\s*:|\*\s*Refining\s*:|\*\s*Draft\s+\d+\s*:/im.test(
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
    /** 空行後に第1文だけが繰り返されるケース（後半が前方の接頭辞／部分文字列） */
    if (next === t) {
      const paras = t.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
      if (paras.length >= 2) {
        const last = paras[paras.length - 1] ?? '';
        const earlier = paras.slice(0, -1).join('\n\n');
        if (last.length >= 24 && earlier.includes(last)) {
          next = paras.slice(0, -1).join('\n\n');
        }
      }
    }
    if (next === t) {
      const lines = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      if (lines.length >= 2) {
        const last = lines[lines.length - 1] ?? '';
        const earlier = lines.slice(0, -1).join('\n');
        if (last.length >= 24 && earlier.includes(last)) {
          next = lines.slice(0, -1).join('\n');
        }
      }
    }
    if (next === t) break;
    t = next.trim();
  }
  return t;
}

/**
 * 同一曲の『』書き出しが2回以上あるときは、最後の完成稿だけ残す
 * （Gemma が下書き＋清書を連結するケース）。
 */
function keepLastTitledJapaneseCommentary(text: string): string {
  const t = text.trim();
  const re = /(?:[A-Za-z][A-Za-z0-9'’ .,&$/-]{0,80})の『[^』]{1,160}』/g;
  const matches = [...t.matchAll(re)];
  if (matches.length < 2) return t;
  const last = matches[matches.length - 1];
  if (last.index == null || last.index < 24) return t;
  const tail = t.slice(last.index).trim();
  if (countJpChars(tail) < 36) return t;
  return tail;
}

export function extractRawTextFromGenerateContentResponse(response: {
  text: () => string;
}): string {
  try {
    return response.text()?.trim() ?? '';
  } catch {
    return '';
  }
}

export function extractTextFromGenerateContentResponse(
  response: { text: () => string },
  resolvedModelId: string,
): string {
  const s = extractRawTextFromGenerateContentResponse(response);
  if (!s) return '';
  if (isGemmaHostedModelId(resolvedModelId)) {
    return polishGemmaModelVisibleText(s);
  }
  return stripTrailingSelfReportedCharCount(s);
}

/** DB キャッシュ返却・再表示用。生成時の extractText（Gemma）と同じパイプライン */
export function polishGemmaModelVisibleText(raw: string): string {
  const s = typeof raw === 'string' ? raw : '';
  if (!s.trim()) return s;
  const sTrim = stripGemmaConstraintSelfCheck(s.replace(/\r\n/g, '\n')).trim();
  /** Draft/Sentence 複数案は星ラベル除去より先に「…の『』」へ飛ばす（先に strip すると MultiDraft が効かない） */
  const pre0 = stripGemmaMultiDraftIntroPrefix(sTrim);
  const pre = stripGemmaEnglishPreambles(stripGemmaStarMetaLabels(pre0));
  const peeled = stripGemmaCoTLeakage(pre);
  const collapsed = collapseImmediateDuplicateBody(sanitizeGemmaVisibleOutputText(peeled));
  /** 文字数メタは dedupe の句点補完より先に落とす（`(136文字)` → `(136文字)。` 化を防ぐ） */
  const withoutCharMeta = stripTrailingSelfReportedCharCount(collapsed);
  const deduped = dedupeRoughJapaneseSentences(stripGemmaTrailingCharEnumeratorRun(withoutCharMeta));
  const polished = keepLastTitledJapaneseCommentary(
    stripTrailingSelfReportedCharCount(
      stripGemmaStrayClosingQuoteBeforePeriod(
        stripGemmaConstraintSelfCheck(
          stripGemmaLeadingTotalsAndAck(stripGemmaStarMetaLabels(deduped)),
        ),
      ),
    ),
  ).trim();
  if (!polished) return '';
  if (isEnglishInstructionOrPlanningLeak(polished)) return '';
  const jp = countJpChars(polished);
  const latin = (polished.match(/[A-Za-z]/g) ?? []).length;
  /** 指示文・英語だけの漏れはチャットに出さない */
  if (jp < 12 && (GEMMA_COT_STRONG_MARKERS.test(polished) || latin > jp * 2)) return '';
  return polished;
}

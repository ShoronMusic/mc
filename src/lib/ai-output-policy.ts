/**
 * Gemini 生成文のポリシー判定（チャット/tidbit / comment-pack 自由コメント）。
 * ロジック変更時は ai-output-policy.unit-test.ts を必ず更新すること。
 */

const EVIDENCE_PATTERN = /出典|ソース|Wikipedia|公式|根拠/i;

/** チャット返答・tidbit 用: 根拠語なしで「バズ/チャート/受賞…」等が含まれるとき true（再生成対象） */
export function isRejectedChatOrTidbitOutput(txt: string | null | undefined): boolean {
  const t = (txt ?? '').trim();
  if (!t) return false;
  if (EVIDENCE_PATTERN.test(t)) return false;
  const patterns = [
    /ブーム|バズ|巻き起こ|象徴的|影響力|拡散|瞬く間|世界中/,
    /チャレンジ|挑戦.*動画|BGM.*チャレンジ|TikTok/i,
    /ビルボード|全英1位|チャート上位|トップ|1位|首位/,
    /UK[^。\n]{0,24}シングルチャート|イギリスのシングルチャート/,
    /\d{1,2}\s*位を記録|\d{1,2}\s*位を獲得/,
    /最高位[^。\n]{0,10}\d{1,2}\s*位/,
    /アイルランド[^。\n]{0,40}\d{1,2}\s*位/,
    /受賞|ノミネート|グラミー/i,
    /数日で|異例.*速|わずか.*日|制作.*短期間|唯一無二|世界観を.*築き/i,
    /全ての工程|全工程|ミックスまで|録音では|レコーディングでは/i,
  ];
  return patterns.some((re) => re.test(t));
}

/**
 * 曲解説（/api/ai/commentary）用。
 * モデルに「アルバム名を必ず」と言わせると取り違えや捏造が多いため、断定っぽいディスコグラフィー・チャート表現を検知して再生成に回す。
 */
export function containsUnreliableCommentaryDiscographyClaim(txt: string | null | undefined): boolean {
  const t = (txt ?? '').trim();
  if (!t) return false;
  if (EVIDENCE_PATTERN.test(t)) return false;

  const patterns = [
    /デビューアルバム[^。\n]{0,100}収録/,
    /(?:1枚目|一枚目|ファーストアルバム|セカンドアルバム|2枚目|二枚目)[^。\n]{0,100}収録/,
    /アルバム[『「][^』」]{2,60}[』」][^。\n]{0,40}収録/,
    /サウンドトラック[『「][^』」]{2,50}[』」][^。\n]{0,40}収録/,
    /(?:全英|全米|ビルボード|イギリス|アイルランド|UK)[^。\n]{0,50}チャート[^。\n]{0,40}\d{1,3}\s*位/,
    /シングルチャート[^。\n]{0,40}\d{1,3}\s*位/,
    /最高位[^。\n]{0,12}\d{1,3}\s*位/,
    /\d{1,2}\s*位を記録|\d{1,2}\s*位を獲得/,
    /アイルランド[^。\n]{0,40}\d{1,2}\s*位/,
    /チャート[^。\n]{0,30}トップ\s*10/,
  ];
  return patterns.some((re) => re.test(t));
}

/**
 * 全英（UK）と全米（Billboard 等）の最高位をモデルが同一数字にコピーする誤りが多い（例: 米33位を英にも当てはめる）。
 * 同一文中で両市場に触れ、かつ同じ順位（小さな順位＝両方でよくある一致は除外）のときは再生成する。
 */
export function hasSuspiciousUkUsIdenticalChartPeak(txt: string | null | undefined): boolean {
  const t = (txt ?? '').trim();
  if (!t) return false;
  const ukM = t.match(/(?:全英|英国|イギリス|UK)[^。\n]{0,130}?(\d{1,3})\s*位/);
  const usM = t.match(/(?:全米|米国|アメリカ合衆国|ビルボード|Billboard)[^。\n]{0,130}?(\d{1,3})\s*位/);
  if (!ukM || !usM) return false;
  const n = parseInt(ukM[1], 10);
  const m = parseInt(usM[1], 10);
  if (n !== m || Number.isNaN(n)) return false;
  if (n <= 3) return false;
  if (n < 12) return false;
  return true;
}

/**
 * comment-pack 栄誉枠（1本目）専用。
 * 当APIはチャートDBを参照しないため、「9位」「33位」など数値順位はモデルが都度まちまちに捏造しやすい。
 * 根拠語がなければ具体順位を書かせず、定性的なチャート言及（大ヒット・チャート入り等）に寄せる。
 */
export function hasFabricatedStyleChartRankNumber(txt: string | null | undefined): boolean {
  const t = (txt ?? '').trim();
  if (!t) return false;
  if (EVIDENCE_PATTERN.test(t)) return false;
  return /(?:最高\s*)?\d{1,3}\s*位|第\s*\d{1,3}\s*位/.test(t);
}

/**
 * comment-pack 自由コメント用。
 * allowChartAwards=true（1本目＝栄誉）のときはチャート/受賞系の禁止を緩める。
 * 常に弾く表現（制作期間断定・バズ誇張等）は allowChartAwards に関わらず検査する。
 */
export function containsUnreliableCommentPackClaim(txt: string, allowChartAwards: boolean): boolean {
  if (!txt) return false;
  if (EVIDENCE_PATTERN.test(txt)) return false;

  /** どのスロットでも弾く（制作断定・TikTok誇張など） */
  const alwaysUnreliable = [
    /わずか.*(日|日間)|数日で|異例.*速/i,
    /全ての工程|全工程|ミックスまで|録音では|レコーディングでは/i,
    /唯一無二|世界観を.*築き/i,
    /徹底したこだわり|こだわりが.*唯一/i,
    /チャレンジ|挑戦.*動画|BGM.*チャレンジ|TikTok|YouTube.*チャレンジ/i,
    /若者文化/i,
  ];
  if (alwaysUnreliable.some((re) => re.test(txt))) return true;

  /** 根拠のないバズ煽り（栄誉スロットでも禁止） */
  if (/ブーム|バズ|巻き起こ|瞬く間/i.test(txt)) return true;

  /**
   * 「世界中」「象徴的」等は歌詞・サウンド枠では禁止だが、
   * 栄誉枠ではチャート実績とセットで使うことがあるため許容する。
   */
  if (!allowChartAwards && /象徴的|影響力|拡散|世界中|世界中の/i.test(txt)) return true;

  if (allowChartAwards) {
    if (hasSuspiciousUkUsIdenticalChartPeak(txt)) return true;
    if (hasFabricatedStyleChartRankNumber(txt)) return true;
    return false;
  }

  const noChartUnlessHonorsSlot = [
    /チャート.*(トップ|1位|首位)/,
    /ビルボード/i,
    /受賞|ノミネート|受賞歴/i,
    /グラミー/i,
    /主要.*(国|チャート).*トップ/,
  ];
  return noChartUnlessHonorsSlot.some((re) => re.test(txt));
}

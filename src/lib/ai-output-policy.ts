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
    /受賞|ノミネート|グラミー/i,
    /数日で|異例.*速|わずか.*日|制作.*短期間|唯一無二|世界観を.*築き/i,
    /全ての工程|全工程|ミックスまで|録音では|レコーディングでは/i,
  ];
  return patterns.some((re) => re.test(t));
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

  if (allowChartAwards) return false;

  const noChartUnlessHonorsSlot = [
    /チャート.*(トップ|1位|首位)/,
    /ビルボード/i,
    /受賞|ノミネート|受賞歴/i,
    /グラミー/i,
    /主要.*(国|チャート).*トップ/,
  ];
  return noChartUnlessHonorsSlot.some((re) => re.test(txt));
}

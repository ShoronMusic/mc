/**
 * 「@」質問のうち、選曲ターン・順番の指摘・訂正のみを検出する。
 * これらは音楽チャットの運用に直結するため、AI 質問ガードの対象外とする。
 */

export type TurnOrderParticipant = { clientId: string; displayName: string };

/**
 * @ 以降の本文（先頭の @ は除いたもの）向け
 */
export function isAiTurnOrderClarificationText(text: string): boolean {
  const t = text.trim().replace(/^@\s*/, '').trim();
  if (!t) return false;
  const patterns: RegExp[] = [
    /次は\s*.+さん\s*の番/,
    /さんの番(?:です|だ)(?:よ|ね)?[!！?？\s]*$/,
    /さんの番に(?:なる|なって|なります)/,
    /選曲(?:の|を)?順[^。!?？\n]{0,32}(?:違|おかしい|間違)/,
    /順番が(?:おかしい|違う|間違い)/,
    /順番.{0,20}(?:おかしい|間違)/,
    /ターンが(?:おかしい|違う)/,
    /(?:指名|案内|次の人).{0,20}間違/,
    /\bNEXT\b.{0,24}(?:違|おかしい)/i,
    /(?:選曲|手番).{0,16}飛ば/,
    /選曲待ち.{0,20}(?:違|おかしい)/,
    /(?:私|自分)の番(?:です|だ|よ)/,
  ];
  return patterns.some((re) => re.test(t));
}

export function buildTurnOrderClarificationReply(
  order: TurnOrderParticipant[],
  currentTurnClientId: string,
): string {
  if (order.length === 0) {
    return 'ご指摘ありがとうございます。こちらで選曲順を一覧できませんでした。参加者一覧の番号と「NEXT」をご確認いただくか、オーナーにご相談ください。案内がずれていたらすみません。';
  }
  const listed = order
    .map((p, i) => {
      const name = (p.displayName ?? '').trim() || '不明';
      return `[${i + 1}] ${name}さん`;
    })
    .join(' → ');
  const next = order.find((p) => p.clientId === currentTurnClientId);
  const nextLabel = next
    ? `${(next.displayName ?? '').trim() || '不明'}さん`
    : '（表示を更新中です）';
  return `ご指摘ありがとうございます。選曲の順番（入室順・選曲に参加している方のみ。視聴専用は含みません）は次のとおりです。\n${listed}\n\nいま次に選曲をお願いしているのは${nextLabel}です。私の案内が前後していたら失礼しました。`;
}

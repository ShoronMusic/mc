/** 部屋のチャット欄「AIのコメント」案内用（段落単位。結合全文は `AI_CHAT_DISCLAIMER`） */
const AI_CHAT_DISCLAIMER_PARTS = [
  'AIのコメントは事実と異なる場合があります。また参加者のご意見やご質問に対して肯定的に答える傾向があります。あくまで参考情報としてお楽しみいただき、内容の正確性はご自身でもご確認ください。',
  'AIに質問したいときは、発言の先頭に「@」を付けてください（例: @ おすすめの洋楽を1つ教えて）。',
  'AIへの質問は音楽（洋楽）関連を前提にしています。音楽以外の質問や会話は控えてください。',
  '「@」で始まるAI宛ての質問について、音楽（洋楽）に関係なさそうだと自動判定した場合は、チャット内に控えめな案内が表示されることがあります。イエローカードや強制退場は行いません。対象は「@」付きの質問のみで、通常チャットはチャットオーナーの判断で対応します。詳細は「ご利用上の注意」の「AI について」をご確認ください。',
  'なお、AIによる曲の解説ではアーティスト名と曲名が逆になって表示されることがあります。的はずれな内容や、真偽が怪しいコメントも含まれることがあります。',
  '改善のため、各コメントの「良い／悪い」ボタンや、コメントアイコンから詳細フィードバックを送っていただけると助かります。',
] as const;

export const AI_CHAT_DISCLAIMER = AI_CHAT_DISCLAIMER_PARTS.join('\n\n');

/** `NEXT_PUBLIC_AI_QUESTION_GUARD_DISABLED=1` のときの注意文（自動チェック・イエローカード運用なし） */
const AI_CHAT_DISCLAIMER_WHEN_GUARD_OFF_PARTS = [
  'AIのコメントは事実と異なる場合があります。また参加者のご意見やご質問に対して肯定的に答える傾向があります。あくまで参考情報としてお楽しみいただき、内容の正確性はご自身でもご確認ください。',
  'AIに質問したいときは、発言の先頭に「@」を付けてください（例: @ おすすめの洋楽を1つ教えて）。',
  '現在の設定では、「@」質問に対する自動の音楽関連チェックやイエローカードによる段階的制限は行っていません。部屋の雰囲気を損なう使い方はチャットオーナーや運営の判断で対応することがあります。',
  'なお、AIによる曲の解説ではアーティスト名と曲名が逆になって表示されることがあります。的はずれな内容や、真偽が怪しいコメントも含まれることがあります。',
  '改善のため、各コメントの「良い／悪い」ボタンや、コメントアイコンから詳細フィードバックを送っていただけると助かります。',
] as const;

export const AI_CHAT_DISCLAIMER_WHEN_GUARD_OFF = AI_CHAT_DISCLAIMER_WHEN_GUARD_OFF_PARTS.join('\n\n');

export function isAiQuestionGuardDisabledClient(): boolean {
  return process.env.NEXT_PUBLIC_AI_QUESTION_GUARD_DISABLED === '1';
}

export function getAiChatDisclaimerForDisplay(): string {
  return isAiQuestionGuardDisabledClient() ? AI_CHAT_DISCLAIMER_WHEN_GUARD_OFF : AI_CHAT_DISCLAIMER;
}

/**
 * 案内モーダル「AIのコメント」タブ用。@ の手順・ガード説明は「AIに質問」タブと重複しないよう除く。
 */
export function getAiChatDisclaimerCommentsTabForDisplay(): string {
  if (isAiQuestionGuardDisabledClient()) {
    return [
      AI_CHAT_DISCLAIMER_WHEN_GUARD_OFF_PARTS[0],
      AI_CHAT_DISCLAIMER_WHEN_GUARD_OFF_PARTS[3],
      AI_CHAT_DISCLAIMER_WHEN_GUARD_OFF_PARTS[4],
    ].join('\n\n');
  }
  return [
    AI_CHAT_DISCLAIMER_PARTS[0],
    AI_CHAT_DISCLAIMER_PARTS[4],
    AI_CHAT_DISCLAIMER_PARTS[5],
  ].join('\n\n');
}

/** チャット欄「AIに質問」モーダル本文（段落単位） */
const AI_CONVERSATION_GUIDE_PARTS = [
  'AIに質問するときは、発言の先頭に「@」を付けて送信してください（例: @ おすすめの洋楽を1つ教えて）。',
  '質問は音楽（洋楽）関連を前提にしています。音楽以外の質問や会話は控えてください。',
  '「@」で始まる質問について、音楽に関係なさそうだと自動判定した場合は、チャット内に控えめな案内が表示されることがあります。イエローカードや強制退場は行いません。誤判定のときはメッセージ下の「異議」からお知らせください。',
  '詳細は「ご利用上の注意」の「AI について」をご確認ください。',
] as const;

export const AI_CONVERSATION_GUIDE = AI_CONVERSATION_GUIDE_PARTS.join('\n\n');

const AI_CONVERSATION_GUIDE_WHEN_GUARD_OFF_PARTS = [
  'AIに質問するときは、発言の先頭に「@」を付けて送信してください（例: @ おすすめの洋楽を1つ教えて）。',
  '質問は音楽（洋楽）関連を前提にしています。音楽以外の質問や会話は控えてください。',
  '現在の設定では、「@」質問に対する自動の音楽関連チェックやイエローカードによる段階的制限は行っていません。',
  '詳細は「ご利用上の注意」の「AI について」をご確認ください。',
] as const;

export const AI_CONVERSATION_GUIDE_WHEN_GUARD_OFF = AI_CONVERSATION_GUIDE_WHEN_GUARD_OFF_PARTS.join('\n\n');

export function getAiConversationGuideForDisplay(): string {
  return isAiQuestionGuardDisabledClient()
    ? AI_CONVERSATION_GUIDE_WHEN_GUARD_OFF
    : AI_CONVERSATION_GUIDE;
}

/** 案内モーダル「AIに質問」タブ用。末尾の「ご利用上の注意」誘導はリンクで出すため本文から除く。 */
export function getAiConversationGuideQuestionTabForModal(): string {
  const parts = isAiQuestionGuardDisabledClient()
    ? AI_CONVERSATION_GUIDE_WHEN_GUARD_OFF_PARTS
    : AI_CONVERSATION_GUIDE_PARTS;
  return parts.slice(0, -1).join('\n\n');
}

/** 「@」が音楽関連でないと判定したときの案内（イエローカード・退場は伴わない） */
export function buildAiQuestionGuardSoftDeclineMessage(displayName: string): string {
  const name = displayName.trim() || 'その方';
  return `${name}さん、今回の「@」は音楽の話題ではなさそうに見えました。お手数ですがご控えください。自動判定のため外れることもあります。誤判定のときはメッセージ下の「異議」からお知らせください。`;
}

/** 邦楽と判定し AI 曲解説を出さないときのシステムメッセージ */
export const SYSTEM_MESSAGE_JP_NO_COMMENTARY = '邦楽のため曲解説を取得できませんでした。';

/**
 * `skipAiCommentary` 応答の `skipReason` に応じて、邦楽用の固定システムメッセージを出すか。
 * `jp_economy` のみ true。`uncertain_artist` / `promotional_metadata` は無言省略。
 * `skipReason` なしは従来 API 互換のため邦楽文案を出す。
 */
export function shouldShowJpNoCommentarySystemMessage(
  skipReason: string | null | undefined,
  isJpDomesticSilenceVideo: boolean,
): boolean {
  if (isJpDomesticSilenceVideo) return false;
  if (skipReason === 'jp_economy') return true;
  if (skipReason == null || skipReason === '') return true;
  return false;
}

/** 曲解説 API が利用できなかったとき（邦楽以外・再試行の文言は付けない） */
export const SYSTEM_MESSAGE_COMMENTARY_FETCH_FAILED = '曲解説を取得できませんでした。';

/** 複数人在室の部屋で再生開始から5分以内に次曲がキューされたとき */
export const SYSTEM_MESSAGE_QUEUE_SONG_DEFERRED =
  '選曲を受け付けました。現在の曲の再生が終わり次第、次の曲を再生します。';

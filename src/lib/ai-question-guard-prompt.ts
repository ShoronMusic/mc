/**
 * 「@」質問の音楽関連判定用プロンプト（Gemini）。
 * 運営向け: 異議データをエクスポートし、正例を追記する手順は docs/supabase-setup.md を参照。
 */

export const AI_QUESTION_GUARD_CLASSIFIER_INSTRUCTION = `あなたは洋楽・音楽中心のチャットサービス用の分類器です。
ユーザーは「@」付きで AI に質問します。次の質問文が、次のいずれかに当てはまる場合は musicRelated を true にしてください。

- 楽曲・アーティスト・アルバム・ライブ・MV・歌詞・ジャンル・チャート・賞・レコード・楽器・制作・音源・配信・フェス・映画の主題歌・サントラなど、音楽に直接または間接的に関わる内容
- **アーティスト同士のコラボ・コラボレーション・featuring・共演の有無や相手**を聞く内容（例：「AとBのコラボはあった？」「MGKとの曲は？」「feat. は誰？」）は、略称（MGK 等）だけでも **musicRelated true**
- **アーティストの来日・日本公演・ツアー・ライブスケジュールや履歴**を聞く内容（例：「来日歴は？」「日本でやった公演は？」）は **musicRelated true**（アーティスト名が洋楽でも邦楽でも同様）
- 直前の会話（選曲・曲解説・アーティスト談義など）と明らかに結びついたフォロー質問（代名詞だけでも文脈が音楽なら true）
- **同時代・デビュー期の別アーティスト名を出して比較・対比・ライバル・よく並べられた相手**を聞く質問（例：アヴリルとブリトニー（スピアーズ）を比較、デビュー当時よく比較されなかったか）は、芸能ゴシップではなく**音楽史・ポップ史の文脈**として musicRelated true
- カバー曲・代表曲の話の直後の「オリジナルは誰」「原曲は」「カバー元は誰」「先に出したのは誰」など、**原曲・初演者・ネタ元**を聞く短い質問は、文脈に楽曲があれば必ず musicRelated true（曲名が質問に無くても true）
- この部屋の**選曲ターン・順番・次は誰の番か**の指摘・訂正・確認（例：次は〇〇さんの番、順番が違う、案内が間違っている）。洋楽チャットの進行に直結するため musicRelated は true
- アーティストの**病気・闘病・療養・体調不良・活動休止・活動再開の遅れ・スランプ・批判や物議・スキャンダル・訴訟・メンバー脱退・破局・逝去**など、**キャリア史・バイオグラフィ・当時の話題**として聞く内容は、ゴシップ色があっても**洋楽・アーティスト談義の延長**として musicRelated true。特に直近ログにそのアーティスト・アルバム・楽曲・MV・時代の話があれば、質問に曲名が無くても **true**（「この頃彼女は大きな病気だった？」のようなフォローも含む）

次に当てはまる場合は false にしてください。

- 天気・株・料理・政治・プログラミング・宿題など、音楽チャットとして明らかに無関係
- **自分・家族の病気や治療の相談**、**一般医学・健康アドバイスを求める内容**（アーティストの経歴として聞いている場合は除く）
- 挨拶のみ・テスト投稿のみ

出力は次の JSON 1 行のみ。説明文やマークダウンは禁止。
{"musicRelated":true}
または
{"musicRelated":false}`;

/**
 * サーバー環境変数 AI_QUESTION_GUARD_EXTRA_PROMPT に追記する few-shot や運営メモ（任意）。
 */
export function getAiQuestionGuardExtraPrompt(): string {
  const raw = process.env.AI_QUESTION_GUARD_EXTRA_PROMPT;
  if (typeof raw !== 'string' || !raw.trim()) return '';
  const t = raw.trim();
  return t.length > 12000 ? `${t.slice(0, 12000)}\n…（省略）` : t;
}

export function buildAiQuestionGuardUserPayload(question: string, recentLines: string[]): string {
  const q = question.trim().slice(0, 2000);
  const lines = recentLines
    .map((l) => l.replace(/\r\n/g, '\n').trim())
    .filter(Boolean)
    .slice(-10);
  const ctx = lines.length ? lines.join('\n') : '（直近ログなし）';
  const extra = getAiQuestionGuardExtraPrompt();
  const extraBlock = extra ? `\n\n【運営が追加した参考例・注意（モデルはこれに従ってよい）】\n${extra}` : '';
  return `【直近のチャット抜粋（古い順）】\n${ctx}\n\n【分類対象の質問（@ 以降）】\n${q}${extraBlock}`;
}

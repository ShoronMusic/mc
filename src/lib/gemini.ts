/**
 * サーバー専用: Gemini API 呼び出し（API Routes から使用）
 */

import { GoogleGenerativeAI, type GenerationConfig } from '@google/generative-ai';
import {
  containsUnreliableCommentaryDiscographyClaim,
  isRejectedChatOrTidbitOutput,
} from '@/lib/ai-output-policy';
import { buildSongIntroOnlyBaseComment } from '@/lib/commentary-song-intro-only-mode';
import {
  buildGoogleGenerativeModelParams,
  extractTextFromGenerateContentResponse,
} from '@/lib/gemini-gemma-host';
import { persistGeminiUsageLog } from '@/lib/gemini-usage-log';
import { resolveGenerationModelId } from '@/lib/gemini-model-routing';
import { SONG_ERA_OPTIONS, type SongEraOption } from '@/lib/song-era-options';

export {
  getGeminiGenerationRoutingSummary,
  getPrimaryGenerationModelId,
  matchesGeminiSecondaryRoutingToken,
  resolveGenerationModelId,
} from '@/lib/gemini-model-routing';

/** generateContent レスポンスの usageMetadata（モデル・バージョンでキー名が変わる場合あり） */
type GeminiUsageMeta = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  cachedContentTokenCount?: number;
};

/**
 * `.env.local` に `GEMINI_LOG_USAGE=1`（または `true`）を付けると、
 * 各 API 呼び出しのトークン数を **1行 JSON** で `console.log` します。
 * サーバーログ（Vercel / Docker 等）を `gemini_usage` でフィルタすると集計しやすいです。
 *
 * 例: `{"t":"gemini_usage","context":"chat_reply","model":"gemini-2.5-flash","promptTokenCount":1200,"outputTokenCount":80,...}`
 */
export function logGeminiUsage(
  context: string,
  response: { usageMetadata?: GeminiUsageMeta | null }
): void {
  const enabled =
    process.env.GEMINI_LOG_USAGE === '1' || process.env.GEMINI_LOG_USAGE === 'true';
  if (!enabled) return;
  const u = response?.usageMetadata;
  console.log(
    JSON.stringify({
      t: 'gemini_usage',
      context,
      model: resolveGenerationModelId(context),
      promptTokenCount: u?.promptTokenCount ?? null,
      outputTokenCount: u?.candidatesTokenCount ?? null,
      totalTokenCount: u?.totalTokenCount ?? null,
      cachedTokenCount: u?.cachedContentTokenCount ?? null,
      ts: new Date().toISOString(),
    })
  );
}

function getApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY;
  return typeof key === 'string' && key.trim() !== '' ? key : null;
}

function readGeneratedText(response: { text: () => string }, usageContext: string): string {
  return extractTextFromGenerateContentResponse(response, resolveGenerationModelId(usageContext));
}

/**
 * @param usageContext `logGeminiUsage` / `persistGeminiUsageLog` と同じコンテキスト名（ルーティング一致用）
 */
export function getGeminiModel(usageContext: string) {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelId = resolveGenerationModelId(usageContext);
  return genAI.getGenerativeModel(buildGoogleGenerativeModelParams(modelId));
}

export type GeminiUsageLogMeta = {
  roomId?: string | null;
  videoId?: string | null;
  /** 曲解説で「タイトル原文」と解析済み名の整合を取らせる用 */
  rawYouTubeTitle?: string | null;
  /** MusicBrainz 検索で得た事実のみアルバム名・年を述べてよいときの箇条書き本文 */
  groundedFactsBlock?: string | null;
  /** musicaichat 曲 JSON の buildMusicaichatFactsForAiPromptBlock 出力 */
  music8FactsBlock?: string | null;
  /** 参照データに年・出自が揃わないとき true。generateCommentary は定型の曲紹介のみ返す */
  songIntroOnlyDiscography?: boolean;
  /** スーパーグループ文脈（手動マスタ + 外部データ補完） */
  supergroupHintText?: string | null;
};

/** チャット文脈の上限（長い会話・長文貼り付けでのトークン膨張を抑える） */
const CHAT_CONTEXT_MAX_MESSAGES = 8;
const CHAT_CONTEXT_MAX_BODY_CHARS = 480;
/** 「@」明示呼び出し時はロープレ・フォロー質問が続くため文脈を広げる */
const CHAT_CONTEXT_MAX_MESSAGES_FORCE = 14;
const CHAT_CONTEXT_MAX_BODY_CHARS_FORCE = 620;

function truncateChatContextBody(body: string, maxChars: number = CHAT_CONTEXT_MAX_BODY_CHARS): string {
  const t = body.replace(/\r\n/g, '\n');
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars - 1)}…`;
}

/** 直近のチャット履歴から AI の返答を生成（相槌・感想、または曲の事実質問への回答） */
export async function generateChatReply(
  recentMessages: { displayName?: string; body: string; messageType?: string }[],
  currentSong?: string | null,
  currentSongStyle?: string | null,
  usageMeta?: GeminiUsageLogMeta,
  options?: {
    forceReply?: boolean;
    userTasteSummary?: string | null;
    personaInstruction?: string | null;
    /** AIキャラの参加表示名。会話ログに出るため、本文で自分を「〇〇さん」と呼ばないよう注入する */
    characterSelfDisplayName?: string | null;
  }
): Promise<string | null> {
  const model = getGeminiModel('chat_reply');
  if (!model) return null;

  const forceReply = options?.forceReply === true;
  const personaInstructionRaw =
    typeof options?.personaInstruction === 'string' ? options.personaInstruction.trim() : '';
  const personaInstructionBlock =
    personaInstructionRaw.length > 0
      ? `【キャラクター設定（最優先）】\n${personaInstructionRaw}\n\n`
      : '';
  const characterSelfNameRaw =
    typeof options?.characterSelfDisplayName === 'string' ? options.characterSelfDisplayName.trim() : '';
  const characterSelfGuardBlock =
    characterSelfNameRaw.length > 0
      ? `【キャラ会話・自己指称の禁止】\nあなたの参加表示名は「${characterSelfNameRaw}」です。これは**あなた自身**です。返答で「${characterSelfNameRaw}さん」などと**自分を第三者のように呼びかけない**でください（一人称は「私」）。会話に「〇〇さんの選曲です！」とあるときは、その〇〇さん（人間の選曲者）を褒める／応じる対象です。選曲者の名前がはっきり分からないときは「ナイス選曲ですね」「いいセンスですね」など、**自分の表示名を使わず**に述べてください。\n\n`
      : '';
  const userTasteRaw = typeof options?.userTasteSummary === 'string' ? options.userTasteSummary.trim() : '';
  const userTasteBlock =
    forceReply && userTasteRaw.length > 0
      ? `【この発言ユーザーについて（マイページの本人メモと、あれば履歴・マイリスト等からの自動要約。参考程度。会話や確かな音楽事実と食い違う場合は会話・事実を優先。逐語繰り返しはしない）】\n${userTasteRaw}\n\n`
      : '';
  const maxMsgs = forceReply ? CHAT_CONTEXT_MAX_MESSAGES_FORCE : CHAT_CONTEXT_MAX_MESSAGES;
  const maxBody = forceReply ? CHAT_CONTEXT_MAX_BODY_CHARS_FORCE : CHAT_CONTEXT_MAX_BODY_CHARS;

  const lines = recentMessages
    .slice(-maxMsgs)
    .map((m) => {
      const who = m.messageType === 'ai' ? 'AI' : (m.displayName ?? 'ユーザー');
      return `${who}: ${truncateChatContextBody(typeof m.body === 'string' ? m.body : '', maxBody)}`;
    })
    .join('\n');

  // 現在の曲に対する AI メッセージの本数から、おおまかな「観点」を決める
  // - 0本目: まだ解説していない → 基本コメント側（/commentary）が担当する想定なので、ここでは通常チャット扱い
  // - 1本目: 曲の補足情報（チャート/受賞歴/制作背景など）を優先
  // - 2本目: アーティストやライブでの扱い・文化的影響など別視点
  // - 3本目以降: 同じ曲については短い相槌中心にし、新しい長い解説は控える
  let topicHint = '';
  if (currentSong && currentSong.trim()) {
    const aiForCurrentSong = recentMessages.filter(
      (m) =>
        m.messageType === 'ai' &&
        typeof m.body === 'string' &&
        (m.body.includes(currentSong) || m.body.startsWith('[DB]') || m.body.startsWith('[NEW]')),
    );
    const count = aiForCurrentSong.length;
    if (count === 1) {
      topicHint =
        '・すでに1本、曲の基本コメントが出ています。今回の返答では「歌詞テーマの要点」「サウンド/メロディの特徴」「ライブでの扱い」など、基本コメントにない観点を1つに絞って短く補足してください。チャート順位・受賞名・制作期間（日数/速さ）・録音工程（ミックスまで等）の断定は避けること。\n';
    } else if (count === 2) {
      topicHint =
        '・すでに曲の基本コメントと補足コメントが2本あります。今回の返答では「ライブでの定番曲としての扱い」「同じアルバム／バンドの他の代表曲」「時代背景や文化的な影響」など、まだ触れていない観点から1つだけ選んで短く触れてください。リリース年・アルバム名・歌詞テーマの説明は繰り返さないこと。\n';
    } else if (count >= 3) {
      topicHint =
        '・この曲についてはすでに何本も解説と豆知識が出ています。今回の返答では新しい長い解説は避け、1〜2文の短い相槌や共感コメントにとどめてください。同じ事実やエピソードを繰り返さず、「この曲が好きな理由」「雰囲気の一言コメント」など軽いリアクションにしてください。\n';
    }
  }
  if (forceReply) {
    topicHint = '';
  }

  let songContext = '';
  if (currentSong && currentSong.trim()) {
    songContext = `\n【現在流れている曲】${currentSong}\n`;
    songContext +=
      '・曲が再生中のあいだは、話題の優先順位を守ること。次の順で、語れる内容がある限りこの順で話すこと。当たり障りのない洋楽全般の話（一般的な紹介程度）は最後の手段にする。\n';
    songContext +=
      '  1）当該曲に関する話 2）当該アルバムに関する話 3）当該アーティストに関する話 4）当該ジャンルと年代の話（例：80年代のニューウェイヴ） 5）メンバー・バンド・類似アーティストの話 6）その時代の音楽トレンド 7）上記で語れないときのみ洋楽全般の雑学。\n';
    songContext +=
      '・現在流れている曲のジャンルとかけ離れたアーティストを挙げないこと。話題は「この曲・このアルバム・このアーティスト・このジャンルと年代・サントラならその映画」を優先し、無関係な一般論（順位・受賞・制作期間の断定など）は出さないこと。\n';
    songContext +=
      '・ジャンルの話をするときは、その曲の年代も合わせること。同類のジャンルと同年代の両方を満たす話題を優先すること。\n';
    if (currentSongStyle && currentSongStyle.trim()) {
      songContext += `・現在の曲のジャンルは「${currentSongStyle.trim()}」です。このジャンルと無関係なジャンルのアーティスト名を出さないこと。\n`;
    }
    songContext +=
      forceReply
        ? '・曲やアーティストについての質問には、知っている範囲で答えてください。**代表的なアルバム名・シングルとアルバムの関係**など、広く知られたディスコグラフィーは述べてよい。各国チャートの**具体順位（何位）**だけは手元で照合できないため数字は避け、「大ヒット」「代表曲」程度にとどめてください。活動状況（解散・休止・ソロ・再結成など）を聞かれた場合は、知っている範囲で答えてください。\n'
        : '・曲やアーティストについての質問には、知っている範囲で事実に基づいて簡潔に答えてください。ただし**どのアルバムに収録か・チャート順位**などは手元で照合できないため断定しないこと。活動状況（解散・休止・ソロ・再結成など）を聞かれた場合は、知っている範囲で答えてください。\n';
    songContext +=
      '・カバー曲とはっきり分かる場合（タイトル・アーティストから明らかな場合）は、必ずオリジナルやネタ元の曲・アーティストの話を探して触れること。カバーであることを示したうえで、原曲や原作者の情報を優先して話すこと。\n';
    songContext +=
      '・カバー版と分かる場合は、原曲の概要には短く触れつつ、主役はカバーアーティストの紹介に置くこと（当時の活動フェーズ・編成・ゲスト参加など）。さらに原曲との差分（アレンジ・テンポ・歌い方/声質）を優先して述べること。企画趣旨（カバーアルバム、トリビュート、番組/ライブ企画等）が分かる場合は触れてよい。**カバー版の方が圧倒的に定着・ヒットしたケースでは、通常曲に近い扱いでカバー版を主軸に紹介し、原曲は短く添える**。原曲のメッセージや歌詞の細かな読解は優先度を下げ、情報が弱い場合は捏造しないこと。\n';
    songContext +=
      '・リミックス版（Remix/別ミックス）と分かる場合は、原曲の説明は短くし、リミックス版そのものを主軸に紹介すること。原曲との差分（テンポ・ビート・構成・歌の見え方）を優先して述べ、リミキサー/DJアーティストが分かる場合はできるだけ触れること。**リミックス版の方が圧倒的に定着・ヒットしたケースでは、通常曲に近い扱いでリミックス版を主役にしてよい**。情報が弱い場合は捏造せず、サウンド面の比較中心で述べること。\n';
    songContext +=
      '・LIVE版と分かる場合は、通常曲より「ライブ録音とスタジオ版の差（会場・テイク差・アレンジ差・観客反応）」「企画趣旨（何年のツアーか、番組収録、トリビュート/チャリティ、A COLORS SHOW や THE FIRST TAKE など）」「当時の体制（バンド編成・活動フェーズ・ゲスト参加）」を優先して触れること。ライブ固有情報が弱い場合は捏造せず、オリジナル曲に近い解説でよい。LIVE文脈ではチャートや社会的反響を主題にしない。\n';
    if (forceReply) {
      songContext +=
        '・（@ 質問）会話でユーザーが別の曲・別アーティストについて話しているときは、【現在流れている曲】よりその会話の話題を優先してかまいません。\n';
    }
  }

  const atMentionBlock = forceReply
    ? `・ユーザーは「@」であなたに直接話しかけています。外部の音楽アシスタントに近い**自然なキャッチボール**を心がけてください（**おおよそ2〜5文・120〜450字程度**まで）。感謝や誉め言葉には**必ず先に一言応じてから**補足や豆知識を続けてください。
・代表アルバム名・シングルとアルバムの関係・和訳タイトルが広く定着している場合の括弧書き・有名な楽器パートの話など、**広く知られたディスコグラフィー**は積極的に含めてよいです。各国チャートの**順位の数字**だけは手元で検証できないため避け、「大ヒット」「代表曲」程度に留めてください。
・「どのアルバムに入っているか」などの質問には、一般的なスタジオアルバム名を挙げて答えてよいです。自信がないときだけ控えめにしてください。
・（最優先）ユーザーが会話でアーティスト名・曲名を出しているときは、その話題に答えることを、下記の「再生中の曲のジャンルと無関係なアーティストは出さない」より優先してください。
・ユーザーが**年代・時期**を明示しているとき（例：2000年代半ば、〇〇年頃、中期・後半）は、その**当時の作品・シングル・活動・当時つけられていたレッテル**を中心に答え、**デビュー直後やファーストアルバムの話に安易に戻さない**こと。ユーザーがデビューや初期を話題にしていない限り、**例として『Let Go』や Complicated / Sk8er Boi を毎回繰り出さない**。中期なら2nd以降やその頃のヒットの話など**時期に即した内容**にし、年次や作品の対応が曖昧なら断定を弱めてよい。
・ジャンル名・レッテル（バブルガム・パンク等）の話では、ユーザーが置いた**年表上の位置**を尊重し、時期の食い違いに気づいたら整理してから述べる。確信が弱いときは「〜とも言われていました」「一説では」のように留める。
・検索用ブロックは**本文で主に述べた時代**に合わせる。中期の話をしているのに、初期アルバム・デビューシングルだけを貼り付けるのは避ける（その時代の代表アルバム／代表曲が主題ならそれを書く）。
・ユーザーの発言が**同意や賛同を求めていない**ときは、返答の冒頭を「そう思います」だけにしないでください（質問には直接答えてください）。
・**曲・シングル・アルバム・アーティストを紹介したり、曲名やアルバム名を答えたりする内容**のときは、本文のあとに**改行して「検索用ブロック」**を付けます（YouTube検索用・英語表記）。ラベルは**全角コロン「：」**、その直後に**半角スペース1つ**、続けて「Artist Name - 曲名またはアルバム名」。感謝だけなど検索用が不要なときは付けません。
・**デビュー曲・デビューシングル・初のシングル**について答えているときは、検索用ブロックを次のようにします。（1）**必ず1行目**に「参考アルバム： Artist - StudioAlbumTitle」（そのデビュー曲が収録されている代表的なスタジオ・アルバム。例：参考アルバム： Avril Lavigne - Let Go）。（2）**ファーストシングルが分かるときは必ず2行目**に「シングル： Avril Lavigne - SongTitle」（例：シングル： Avril Lavigne - Complicated）。（3）ファーストシングルがはっきり分からないが、代わりに代表的な楽曲を示せるときは2行目を「代表曲： Avril Lavigne - SongTitle」とする。（4）シングルも代表曲も特定できないときは、本文で分からない旨を述べ、検索用ブロックではアルバム行のみにするか、2行目を「シングル： 手元では特定できません」または「代表曲： 手元では特定できません」のいずれかにする。
・デビュー以外で**アルバム紹介が主**のときは「参考アルバム：」の1行のみ。**特定の1曲が主**でシングル名が明確なときは「シングル： Artist - Song」の1行。**アルバムより曲の提示が適切だが公式のファーストシングルまでは断定できない**ときは「代表曲： Artist - Song」の1行。旧形式の「参考：」だけの1行は使わない。
・ユーザーが「おっしゃる通り」「その通り」「そうですね」などと**直前のあなたの発言に同意・追認しているだけ**のときは、**短く共感して終えてよい**（おおよそ1〜2文）。**直近のあなたの発言ですでに書いた内容**（例：デビューアルバム『Let Go』の位置づけ、「Complicated」「Sk8er Boi」の列挙、スケート・パンクやポップパンクの話）を**繰り返し説明しない**こと。付け足すなら**別の観点**（他曲、ツアー、制作、当時の他アーティストとの違い、後年の作品など）に限定する。
・上記の同意返答では、**直前の自分のメッセージに付けた「参考アルバム：」「シングル：」「代表曲：」と同じ組み合わせの検索用ブロックを出し直さない**（新しい主題の曲・アルバムを本文で初めて推すときだけ検索用ブロックを付ける）。
`
    : '';

  const defaultLengthRule = forceReply
    ? ''
    : '・通常は相槌や短い感想を1〜2文で（40文字以上120文字以内）。\n';

  const albumVerificationRule = forceReply
    ? ''
    : '・**どのアルバムに収録か・デビュー作か・各国チャートの順位**などディスコグラフィーの細部を聞かれたとき、またはユーザーがその種の事実を述べて確認してきたときは、**検証できないまま「はい、そのとおりです」と肯定しない**こと。確認できない場合は「すみません、手元では照合できません。公式ディスコグラフィーや信頼できる音楽データベースでのご確認をおすすめします」のように案内する。\n';

  const prompt = `あなたは洋楽を聴きながら参加者とチャットしている「音楽仲間」のAIです。自分は「私」と呼んでください。性別を聞かれたら「性別はありません」と答えてください。
以下の直近の会話に対して返してください。${songContext}${personaInstructionBlock}${characterSelfGuardBlock}${userTasteBlock}
${atMentionBlock}${defaultLengthRule}
・同意するときは「はい、そうですね」ではなく「そう思います」を使うこと。
・PV・MV（ミュージックビデオ）・プロモーション映像の話題は**拒否や話題転換だけで済ませない**こと。**大物監督が手がけた演出、大物俳優や著名人の出演、映画・ドラマ・CM・ゲームなどとのタイアップで話題になった例**も含め、**監督・出演者・作品連携・撮影地や制作エピソード・当時の反響・よく語られるコンセプト**など、テキストとしても答えられる範囲では普通に答えてください。**日本の漫画家・アニメ作家がキャラクターや映像で関与した例**（例：Daft Punk『Discovery』期の映像とアニメ映画『インターステラ5555』で松本零士氏のキャラクター・美術面の関与が語られるケース）も同様に、知っている範囲で答える。
・**映像を実際に見ていないと断言しづらい細部**（特定カットの有無、秒単位の構成、色味の細かい描写など）が主題のときは、**先に分かる範囲で答えたうえで**、動画をその場で視聴して確認できない旨を**一言、柔らかい口調**（例：「こちらから動画を見られないので、細かい画面まではお約束できません」程度）で添え、断定は避け、分かる周辺（曲・制作・アーティストの話）に寄せてもよい。
・直近の曲（現在かかっている曲・さっき流れた曲）の話題は、同じ曲について2回までにすること。3回目以降は短い相槌に留めるか、別の話題に移ること。
・「今流れている」「今かかっている」などの同じフレーズを続けて使わないこと。言い換えの例：この曲は、このアーティストは、さっきの曲では、この楽曲は、など表現を変えること。
・今かかっている曲・アーティストの解説をするときは「豆知識ですが、」などの前フリは不要。アーティスト名や曲名から書き始めること。
・曲名を文中に出すとき、(Official Video)・(Lyric Video)・(Official Audio) など**公式動画・配信ラベル**は付けない。**Remix・Remaster が曲名に含まれる場合はそのまま**使うこと（別ミックス版としての意味を落とさない）。
・本題に入る前の前置きは、毎回同じにしないこと。次のような表現をローテーションして使う：「洋楽の話ですが」「知ってます？」「余談ですが」「ところで」「関連しますが」「聞いたことあるかもしれませんが」「同じ時代では…」「その頃の話ですが」など。直近の会話で使った前置きは避け、別の表現を選ぶこと。ただし上記のとおり、今かかっている曲の解説のときは「豆知識ですが、」は使わない。
・話の流れを大切にし、なるべく前の会話に出たアーティスト・ジャンル・時代に関連した話題にしてください。ただし曲再生中は上記のとおり「現在の曲・アーティスト・ジャンル・サントラの映画」に限定し、そのジャンルと無関係なアーティストは出さないこと。話が大きく飛ぶときは上記の前置きのどれかで関連付けを入れてください。
・ユーザーが「曲を紹介して」「おすすめのアーティストある？」など紹介・推薦を求めた場合は、必ず最初に「1つだけ紹介しますね。」と明示したうえで、候補は**1つだけ**出すこと。複数候補（2件以上）の列挙は禁止。
・曲の事実を聞かれたら（何年リリース？など）、**確信が持てる範囲だけ**簡潔に答える。曖昧なら「すみません、こちらでは確かめられません」と断る。
${albumVerificationRule}
・直前の AI 発言（曲解説・豆知識）の内容を、ユーザーが「本当？」と聞いたからといって、そのまま真実として繰り返さないこと。
・アーティストの現在の活動状況を聞かれたら、知っている範囲で事実に基づいて簡潔に答えてください。
・会話ログの話者ラベル（「AI:」「ユーザー:」など）をアーティスト名の一部とみなしたり、略称と結合して新しいアーティスト名（例：「AIZepp」）を捏造しないこと。
・（最優先・略称）「ZEPP」「zepp」「ツェッペリン」「レッド・ツェッペリン」「レッドツェッペリン」はいずれも **Led Zeppelin（レッド・ツェッペリン）** の通称。**別アーティストとして存じ上げない・表記違いではと言い切らない**。メンバー・作品などの質問は Led Zeppelin として答える（例：ロバート・プラント、ジミー・ペイジ、ジョン・ポール・ジョーンズ、ジョン・ボーナム［故人］など。逝去メンバーには現在形で「歌っている」と断定しない）。
・ファン・メディアで通じる略称・愛称のほかの例：**ピンフロ**＝Pink Floyd、**ストーンズ**＝The Rolling Stones、**レッチリ**＝Red Hot Chili Peppers、**ガンズ**＝Guns N' Roses、**ミスチル**＝Mr.Children、**殿下**＝Prince、**ボス／The Boss／boss**（文脈が音楽のとき）＝Bruce Springsteen、**オジー／Ozzy**＝Ozzy Osbourne、**ハノイ**＝HANOI Rocks、**モンちゃん**＝Michael Monroe、**マイコー／MJ**＝Michael Jackson、**マコ様**＝Madonna、**Macca**＝Paul McCartney（日本語「マカ」はアカデミー賞表記と重なるため略称は文脈で読み替え）、**J.Lo**＝Jennifer Lopez、**レガ**＝Liam Gallagher、**Tay／Taylor Swift**、**GAGA／ガガ**＝Lady Gaga、**RiRi**＝Rihanna、**Kanye／Ye**、**キング・オブ・ロックンロール**＝Elvis、**クイーン・オブ・ポップ**＝Madonna、**ピアノ・マン**＝Billy Joel、**スローハンド**＝Eric Clapton、**ヒッキー**＝宇多田ヒカル、**あゆ**＝浜崎あゆみ、**ARMY**＝BTSファン総称、**Blinks**＝BLACKPINKファン、**Swifties**＝Taylor Swiftファン、**Little Monsters**＝Lady Gagaファン、**BeyHive**＝Beyoncéファン、**Directioners**＝One Directionファン、**1D／ワンディー**＝One Direction、**5SOS**＝5 Seconds of Summer、**TVXQ**＝東方神起、**B'z**、**Twenty One Pilots**（「TOP」表記は文脈で）、**ラルク**＝L'Arc-en-Ciel、**ガゼ**＝the GazettE、**ドロス**＝Alexandros、**CCR／ELP／GFR／ELO／BTO／MSG**（MSG＝Michael Schenker Group、1960–70年代ロックの頭字略）、**聖子ちゃん／明菜ちゃん**、**新御三家**、**花の82年組**、**はっぴいえんど／キャロル／アリス**（バンド）、**ジュリー**＝沢田研二、**ショーケン**＝萩原健一、**ラン・ミキ・スー**＝キャンディーズ、**楽器・機材通称**（ギブソン／フェンダー／マーシャル／テレキャス／ストラト／ジャズコ／キューベース／Logic Pro／サンレコ、TR-808／909、DX7、Minimoog、SM58／57、MD421、NS-10M、MPC、トークボックス／ヴォコーダー、Auto-Tune／Melodyne／VariAudio、ワウ、**ボカロ／初音ミク／歌ってみた／プロセカ**、**音ゲー／IIDX／DDR／SDVX／チュウニ／maimai／ガルパ**、**ウッドストック／ライブエイド／コーチェラ／グラストン／フジロック／サマソニ／ラシュボ／ロキソニ** 等。一覧は artist-nickname-music-keywords.ts）も音楽制作・演奏の話題として扱う（クライアント側の略称リストと同期）。これらも **知らないアーティスト扱いにせず**、略称・愛称ならその正式名のアーティスト／バンド、**ファン総称なら指す相手のアーティスト／バンド** として答える。
・ユーザーがアーティスト名らしき言葉を言ったとき：表記ゆれ・略称で有名な洋楽アーティストに該当しそうなら、正しい名前で確認すること。例：「ブラ」→「Blur（ブラー）のことでしょうか？」「オアシス」→そのまま理解してよい。該当するアーティストが思いつく場合は必ず確認してから会話を続ける。**ただし直前2つの「略称・愛称」ルールに該当する語は、確認に留めずそのまま正規名として解答してよい**（「知らない」とは言わない）。
・ユーザーが言ったアーティスト名・バンド名が、**上記の略称・愛称ルールに当てはまらず**、思いつく洋楽アーティストのどれにも該当しそうにない場合に限り、知らないと正直に答えること。例：「〇〇っていうアーティストは私、知らないです…。別のアーティストだったら教えてもらえると嬉しいです！」のように、知らないと言いつつ相手を否定しない。
・「曲を貼って」「流して」と依頼されている場合は「お探しの曲が見つからなかったかもしれません…」など短く。機能がないとは言わないでください。
・主役は人間。しゃべりすぎず、親しみやすいトーンで。否定せず共感を中心に。日本語で、です・ます調で。
・ユーザーの発言を訂正・否定する場合（「いえ、〜ではないんです」など）は断定しないこと。「〜だと思います」「〜のようです」など、柔らかく伝えること。
・ユーザーがあなたの発言（豆知識やコメント）に反応している場合は、その内容を受け止めてキャッチボールすること。相槌だけでなく、会話が続くように返すこと。
・ユーザーがあなたのコメントを否定したり、間違いを訂正しようとしている場合は、素直に受け止めること。事実と異なる場合があることを認め、謝罪してから返すこと。例：「すみません、私の認識が違っていたかもしれません」「ご指摘ありがとうございます。事実と異なっていたかもしれません、失礼しました」など。
・選曲の**順番**や「次は誰の番か」への指摘・訂正には、責めず**冷静に**答えること。システム警告のような口調は使わない。手元で入室順を確定できないときは、並べ替えを断定せず「参加者表示の番号や NEXT をご確認ください」と案内すること。
・誰かが別の参加者に「〇〇さん < おかえり」のように歓迎の言葉を送っている場合は、返事は「おかえりなさい！」のひらがなだけにすること。余計な一文は付けない。
・直近の自分のメッセージも含めて、同じ曲について同じ事実やエピソード（例：「『Eye Of The Tiger』は『ロッキー3』のためにスタローンが依頼した」など）を何度も繰り返さないこと。言い換えも含めて、すでに1〜2回使ったネタは別のメッセージで再利用しない。
・特に「[DB]」「[NEW]」で始まる曲解説・豆知識メッセージに書いた内容と同じ趣旨（リリース年・アルバム名・代表曲であることなど）を、後続の自由コメントで言い直さないこと。自由コメントでは、基本コメントで触れていない新しい観点（ライブでの扱い・歌詞の背景・サウンドの特徴・文化的な文脈など）だけを選ぶこと。順位・受賞名・制作期間（日数/速さ）・録音工程の断定は避けること。
・重要：特定のボーカル名／メンバー名を「この動画で歌っている」と断定しないこと。動画タイトルや説明文、会話内に明記がある場合のみ言及してよい。そうでない場合は「ボーカル」「歌声」など中立表現にすること。
・重要：亡くなった可能性があるメンバーに触れる場合は、現在の歌唱者だと誤解される表現（「シャウトが炸裂」「〜の歌声が響く」などの現在形断定）を避けること。言及するなら「故〜」「当時の〜」「〜時代の」など慎重な言い回しにし、無理に名前を出さないこと。
・推奨：バンド名とリリース年（例：Linkin Park・2024年）をかけ合わせ、体制変更の特筆事項を知っている場合は簡潔に触れること。例：2017年のチェスター・ベニントンの逝去に伴う活動休止を経て、2024年9月にエミリー・アームストロング（新リードボーカル、元Dead Sara）を迎えた新体制、など。こうした一文を入れると、故人メンバーが「いま歌っている」と誤解されるのを防げる。
${topicHint || ''}

会話:
${lines || '(まだ発言なし)'}

上記への返事だけを出力してください。挨拶や説明は不要。`;

  try {
    let attempt = 0;
    let prompt2 = prompt;
    while (attempt < 2) {
      attempt += 1;
      const result = await model.generateContent(prompt2);
      logGeminiUsage('chat_reply', result.response);
      await persistGeminiUsageLog('chat_reply', result.response.usageMetadata, usageMeta);
      const text = readGeneratedText(result.response, 'chat_reply');
      const discographyPolicyOk = forceReply || !containsUnreliableCommentaryDiscographyClaim(text);
      if (text && !isRejectedChatOrTidbitOutput(text) && discographyPolicyOk) {
        return text;
      }
      if (attempt >= 2) return text || null;
      prompt2 =
        prompt +
        (forceReply
          ? '（追加指示）会話の流れと感謝への応答を維持し、チャートの具体順位の数字だけ削る。ユーザーが指定した年代から外れてデビュー話に戻さない。直前の自分の発言と同じアルバム・代表曲の説明は繰り返さない。同意だけのときは検索用ブロックを省略してよい。冒頭だけ「そう思います」にしない。'
          : '（追加指示）根拠がない断定、アルバム名・収録作・チャート順位の断定的な記述を避け、歌詞テーマの要点とサウンドの特徴（印象）だけで短く書いてください。');
    }
    return null;
  } catch (e) {
    console.error('[gemini] generateChatReply:', e);
    return null;
  }
}

/** API キーが設定されているか（サーバー専用） */
export function isGeminiConfigured(): boolean {
  return getApiKey() != null;
}

export interface SongSearchIntent {
  query: string;
  /** 確認メッセージ用「アーティスト名 - 曲名」 */
  confirmationText: string;
}

export interface CharacterSongPick {
  query: string;
  confirmationText: string;
  reason: string;
}

/**
 * 1行だけの「左 - 右」を曲指定とみなして検索クエリにする（例: Blur - The Universal）。
 * 送信だけでは再生しない運用のため、Gemini なしでも判定できるようにする。
 */
function parseArtistDashSongLine(text: string): SongSearchIntent | null {
  const t = text.trim();
  if (!t || /\n/.test(t)) return null;
  if (/youtube\.com|youtu\.be|https?:\/\//i.test(t)) return null;
  if (t.length > 120) return null;
  const m = t.match(/^(.+?)\s-\s(.+)$/);
  if (!m) return null;
  const left = m[1].trim();
  const right = m[2].trim();
  if (left.length < 2 || right.length < 2) return null;
  return {
    query: `${left} ${right}`,
    confirmationText: `${left} - ${right}`,
  };
}

/** ユーザー発言（と会話履歴）から「曲を聴きたい・貼って」系の検索クエリを1つ抽出。該当しなければ null */
export async function extractSongSearchQuery(
  userMessage: string,
  recentMessages?: { displayName?: string; body: string; messageType?: string }[],
  usageMeta?: GeminiUsageLogMeta
): Promise<SongSearchIntent | null> {
  const text = userMessage.trim();
  if (!text) return null;
  if (/^(はい|うん|ええ|お願い|そうです|お願いします|いいです|お願いね)[!?！？]*$/i.test(text)) return null;

  const dashOnly = parseArtistDashSongLine(text);
  if (dashOnly) return dashOnly;

  const model = getGeminiModel('extract_song_search');
  if (!model) return null;

  const contextLines =
    recentMessages && recentMessages.length > 0
      ? recentMessages
          .slice(-6)
          .map((m) => {
            const who = m.messageType === 'ai' ? 'AI' : (m.displayName ?? 'ユーザー');
            return `${who}: ${m.body}`;
          })
          .join('\n')
      : '';

  const contextBlock = contextLines
    ? `【直近の会話（曲名・アーティストの手がかりにしてください）】\n${contextLines}\n\n`
    : '';

  const prompt = `${contextBlock}【ユーザーの最新発言】${text}

【ルール】最新発言が「曲を貼って・流して・聴きたい・聞きたい」という依頼なら、2行で出力。そうでなければ null とだけ出力。
・1行目: YouTube検索用クエリ（アーティスト名 曲名）。2行目: 確認用表示（アーティスト名 - 曲名）。例: Oasis - The Masterplan
・依頼の例:「〇〇貼って」「〇〇が聴きたい/聞きたい」「その〇〇が聞きたいです」「その曲貼って」「ここでかけられますか」「〇〇かけて」。直前の会話で出た曲を「ここでかける」「かけられますか」と言った場合も依頼とみなす。
・「そのマスタープラン」「あの曲」など直前の会話で出た曲を指す言い方も依頼とみなす。
・例: ユーザー「そのマスタープランが聞きたいです」→ 1行目: Oasis The Masterplan、2行目: Oasis - The Masterplan
・例: ユーザー「Song 2聴きたいです」で会話にBlurとSong 2→ 1行目: Blur Song 2、2行目: Blur - Song 2
・出力は2行のみ（1行目=検索クエリ、2行目=確認表示）。説明・引用符は不要。`;

  try {
    const result = await model.generateContent(prompt);
    logGeminiUsage('extract_song_search', result.response);
    await persistGeminiUsageLog('extract_song_search', result.response.usageMetadata, usageMeta);
    const out = readGeneratedText(result.response, 'extract_song_search');
    if (!out || out.toLowerCase() === 'null') return null;
    const lines = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const query = lines[0] ?? '';
    if (!query) return null;
    const confirmationText = lines[1] ?? query.replace(/^(\S+)\s+(.+)$/, '$1 - $2');
    return { query, confirmationText };
  } catch (e) {
    console.error('[gemini] extractSongSearchQuery:', e);
    return null;
  }
}

/** キャラクターAI向け: 直近の会話の空気に合う1曲を提案（検索クエリ + 表示名 + 短い理由） */
export async function generateCharacterSongPick(
  recentMessages: { displayName?: string; body: string; messageType?: string }[],
  currentSong?: string | null,
  currentSongStyle?: string | null,
  usageMeta?: GeminiUsageLogMeta,
): Promise<CharacterSongPick | null> {
  const model = getGeminiModel('character_song_pick');
  if (!model) return null;

  const lines = recentMessages
    .slice(-12)
    .map((m) => {
      const who = m.messageType === 'ai' ? 'AI' : (m.displayName ?? 'ユーザー');
      return `${who}: ${truncateChatContextBody(typeof m.body === 'string' ? m.body : '', 220)}`;
    })
    .join('\n');
  const songHint = currentSong?.trim() ? `【現在の曲】${currentSong.trim()}\n` : '';
  const styleHint = currentSongStyle?.trim() ? `【現在の曲のジャンル】${currentSongStyle.trim()}\n` : '';

  const prompt = `あなたは洋楽に詳しいDJアシスタントです。この選曲ターンでは会話の空気に合う曲を1首だけ選びます。
・第2候補・別曲の列挙・「ほかにも」「次に○○も」など複数曲に触れる表現は禁止（1曲のみ）。
・選んだ1曲の検索用クエリと表示名と理由以外は書かない。
${songHint}${styleHint}【直近の会話】
${lines || '(会話なし)'}

【選曲の優先順位（重要）】
・**最優先は参加者（ユーザー側）の流れ**です。「〇〇さんの選曲です！」や参加者の発言・貼った曲から読み取れる**ジャンル・時代・ムード**に寄せてください。
・**AIキャラ自身が直前にかけた曲**や、**AI曲解説の話題だけ**に引きずって、参加者がかけている路線（例: US オルタナティブロック、90年代ロックなど）から大きく外れたジャンル（例: 盛り上がり目的だけのファンク／ディスコ連打）に飛ばさないでください。同じムードの中で次の一曲、または自然な横展開（同系統のアーティスト・同年代の近いサウンド）にしてください。
・上に【現在の曲】【現在の曲のジャンル】があるときは、**それに沿うか、会話で参加者が触れている系統に合わせる**ことを強く推奨します。ジャンルがロック／オルタナ系なのに、理由なくパーティー・ファンク中心だけを続けないでください。
・会話ログの「AI:」行は参考程度とし、**誰が選曲したか・何が流れているかは参加者の行と【現在の曲】を主**に判断してください。

【出力ルール】
・候補がある場合は必ず3行だけで出力（行を増やさない）:
1行目: YouTube検索用クエリ（Artist Song）
2行目: 表示名（Artist - Song）
3行目: 選曲理由（日本語で1文、20〜55文字、やさしい言葉。他曲名や別候補には触れない）
・会話から雰囲気が読みにくい場合でも、**必ず1曲を選んで3行で出力**する（nullは禁止）。
・迷ったら【現在の曲】やその周辺ジャンルに近い、定番の洋楽1曲を選ぶ。
・70年代〜現在の洋楽から選ぶ。
・難しい専門用語は使わない。`;

  try {
    const buildFallbackPick = (): CharacterSongPick => {
      const cur = (currentSong ?? '').trim();
      const m = /^(.+?)\s*-\s*(.+)$/.exec(cur);
      if (m) {
        const artist = m[1].trim();
        const song = m[2].trim();
        if (artist && song) {
          return {
            query: `${artist} ${song}`,
            confirmationText: `${artist} - ${song}`,
            reason: '流れを切らさないよう、この路線でつなげます。',
          };
        }
      }
      return {
        query: 'Earth Wind & Fire September',
        confirmationText: 'Earth, Wind & Fire - September',
        reason: '会話の流れに合わせて、定番の一曲でつなげます。',
      };
    };

    const result = await model.generateContent(prompt);
    logGeminiUsage('character_song_pick', result.response);
    await persistGeminiUsageLog('character_song_pick', result.response.usageMetadata, usageMeta);
    let out = readGeneratedText(result.response, 'character_song_pick');
    let outLines = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    let query = outLines[0] ?? '';
    if (!out || out.toLowerCase() === 'null' || !query) {
      const retryPrompt = `${prompt}\n\n（最終指示）nullは禁止。必ず3行で1曲だけ出力してください。`;
      const retry = await model.generateContent(retryPrompt);
      logGeminiUsage('character_song_pick', retry.response);
      await persistGeminiUsageLog('character_song_pick', retry.response.usageMetadata, usageMeta);
      out = readGeneratedText(retry.response, 'character_song_pick');
      outLines = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      query = outLines[0] ?? '';
    }
    if (!out || out.toLowerCase() === 'null' || !query) return buildFallbackPick();
    const confirmationText = outLines[1] ?? query.replace(/^(\S+)\s+(.+)$/, '$1 - $2');
    const reason = (outLines[2] ?? 'この流れに合う一曲だと思います。').slice(0, 80);
    return { query, confirmationText, reason };
  } catch (e) {
    console.error('[gemini] generateCharacterSongPick:', e);
    const cur = (currentSong ?? '').trim();
    const m = /^(.+?)\s*-\s*(.+)$/.exec(cur);
    if (m) {
      const artist = m[1].trim();
      const song = m[2].trim();
      if (artist && song) {
        return {
          query: `${artist} ${song}`,
          confirmationText: `${artist} - ${song}`,
          reason: '流れを切らさないよう、この路線でつなげます。',
        };
      }
    }
    return {
      query: 'Earth Wind & Fire September',
      confirmationText: 'Earth, Wind & Fire - September',
      reason: '会話の流れに合わせて、定番の一曲でつなげます。',
    };
  }
}

/** 30秒無発言時用：短い豆知識を1〜2文で生成。preferMainArtist 時は曲解説直後としてメインアーティストについて語る。preferGeneral 時は一般的な豆知識でよい */
export async function generateTidbit(
  currentSong?: string | null,
  preferGeneral?: boolean,
  preferMainArtist?: boolean,
  usageMeta?: GeminiUsageLogMeta
): Promise<string | null> {
  const model = getGeminiModel('tidbit');
  if (!model) return null;

  const hasSong = currentSong && currentSong.trim();
  const doMainArtist = Boolean(preferMainArtist && hasSong && !preferGeneral);

  const songHint = doMainArtist
    ? `曲解説を直前に表示したばかりです。今流れている（または直前に流れた）曲は「${currentSong}」です。`
    : preferGeneral || !hasSong
      ? '洋楽や音楽の豆知識・雑学を1つ。直前の曲に紐づけず、一般的な話題でよい。'
      : `直前に流れていた（または流れている）曲は「${currentSong}」です。`;

  const mainArtistInstruction = doMainArtist
    ? `・重要：この発言では洋楽全般の雑学は出さず、この曲のメインアーティストについてだけ1〜2文で語ること。社交辞令や漠然とした褒め言葉（「何十年も活躍」「時代を先取り」「素晴らしい」など）は避け、話題性のある具体的内容を選ぶこと。
・カバー曲とはっきり分かる場合は、必ずオリジナルやネタ元の話を探して触れること。カバーであることを示したうえで、原曲・原作者の情報を優先して語ること。
・カバー版と分かる場合は、原曲の概要は短く触れる程度にし、カバーアーティスト側の紹介（当時の活動フェーズ・編成・ゲスト）を主役にすること。原曲との差分（アレンジ・テンポ・歌い方/声質）を優先して述べ、企画趣旨（カバーアルバム、トリビュート、番組/ライブ企画等）が分かる範囲で添える。**カバー版の方が圧倒的に定着・ヒットしたケースでは、通常曲に近い扱いでカバー版を主軸にし、原曲説明は短く添える**。原曲の歌詞メッセージの詳細読解は優先しない。
・リミックス版（Remix/別ミックス）と分かる場合は、原曲説明は短くし、リミックス版のサウンド差分（テンポ・ビート・構成・歌の見え方）を主役にすること。リミキサー/DJアーティストが分かる場合はできるだけ触れる。**リミックス版の方が圧倒的に定着・ヒットしたケースでは、通常曲に近い扱いでリミックス版を主軸にする**。
・LIVE版と分かる場合は、通常曲よりライブ固有情報を優先すること。具体的には「ライブ録音とスタジオ版の差（会場・テイク差・アレンジ差・観客反応）」「企画趣旨（何年のツアーか、番組収録、トリビュート/チャリティ、A COLORS SHOW・THE FIRST TAKE など）」「当時の体制（バンド編成・活動フェーズ・ゲスト参加）」を優先して触れる。固有情報が弱い場合は捏造せず、オリジナル寄りの解説でよい。LIVE文脈ではチャートや社会的反響を主題にしない。
・優先する話題の例：この曲の歌詞テーマの要点／サウンドの特徴（メロディ・リズム・アレンジ）／ライブでの扱いのされ方（ただし順位・制作期間の断定は避ける）。盛り上がる話を1つに絞って簡潔に。
・歌詞や曲のメッセージがはっきりしている場合（反戦歌・社会的テーマ・失恋ソングなど）は、その要点を1フレーズで要約して触れてよい（例：「『Zombie』は北アイルランド紛争を背景にした強い反戦メッセージの曲です」のように）。歌詞全文の説明や長い意訳は避けること。
・「全英1位」「チャート上位」などの順位ネタは出さないこと。もし述べるなら、会話内に根拠がある場合に限って短く、断定しない形で。
・アルバム名・「○○に収録」・各国チャートの具体的順位（○位・トップ10・UK／イギリス／アイルランドのチャート等）の断定は書かないこと（曲解説と同様、取り違えが起きやすい）。
・プロデューサー・別アーティストとの制作関係（「〇〇が手がけた」等）は、タイトル・概要欄・会話に明示がない限り**断定しない**。有名バンド名を安易に結びつけないこと。
・過度に断定的な言い回し（例：「異例の速さ」「唯一無二」など）の繰り返しは禁止。毎回異なる切り口を短く選ぶこと。
・メインのボーカルやバンドメンバーがすでに亡くなっている場合は、可能であればその事実にさりげなく触れてよい（例：「カート・コバーンの早すぎる死は今も多くのファンに惜しまれています」のように、ファンの気持ちに寄り添う一言を添える）。ただしセンシティブな話題を煽らず、尊重のトーンで。
・「豆知識ですが、」は使わない。アーティスト名や具体的な事実から書き始めてよい。
・重要：特定のボーカル名／メンバー名を断定しないこと。タイトル・説明文・会話内に明記がある場合のみ。亡くなった可能性があるメンバーに触れる場合は、現在の歌唱者だと誤解される断定表現を避けること。
・推奨：バンド名とリリース年（例：Linkin Park・2024年）から体制変更の特筆事項（故メンバーの逝去・活動休止・新ボーカル加入など）を知っている場合は、簡潔にひと言触れること。誤解を防ぎつつ、新体制を伝えられる。
`
    : '';

  const generalInstruction = !doMainArtist
    ? `・話題の優先順位を守ること。次の順で選び、語れる内容がある限りその順で語ること。最後まで選べる話題がない場合のみ、当たり障りのない洋楽全般の話（一般的な紹介程度）にすること。
・特に「チャート」「制作期間（日数/速さ）」「録音工程（ミックスまで等）」は断定しないこと。必要なら「そう語られることがある」「〜の雰囲気がある」など控えめに。
  1）当該曲に関する話（この曲の制作背景・テーマ・サウンドの特徴など）
  2）当該アルバムに関する話（そのアルバムの位置づけ・収録曲・時代性など）
  3）当該アーティストに関する話（バンド・ソロ・エピソード・活動歴など）
  4）当該ジャンルと年代の話（例：80年代のニューウェイヴ、この曲のジャンルと時代に限定）
  5）メンバー・バンド・類似アーティストの話（同じ時代・同じジャンル周辺に留める）
  6）その時代の音楽トレンド（この曲の年代・ジャンルに直結する動き）
  7）上記のいずれでも語れないときのみ：洋楽全般の雑学（順位・制作期間の断定などは避け、上記1〜6で具体性のある話題を優先すること）
・同じ曲については、タイトルの由来やリリース年・アルバム名・代表曲であることなど「基本コメントで既に説明した情報」と同じ趣旨の豆知識を何度も繰り返さないこと。1度使った切り口は、その曲に関しては使いまわさず、2回目以降は別の視点（サウンド・歌詞・制作背景・ライブでの扱い・文化的影響・他アーティストによるカバーなど）を選ぶこと。
・曲名の由来やエピソードを語るときは、内容が矛盾しないように1つの説に統一すること。別説に触れる場合でも「諸説ありますが」のように断り、同じ曲について全く別の由来を別の発言で語らないこと。
・録音技術やアナログレコードの回転数など「音楽一般の技術的な話」をする場合は、必ずその曲または同じ時代・同じジャンルのアーティストに結びつけてから話すこと（例：「Nirvanaが活躍していた90年代のロックでは〜」「グランジの時代のレコーディングでは〜」のように、先にアーティストや時代背景・トレンドに触れてから技術の話をする）。
・上記のような技術ネタだけを単独で話すのではなく、「この曲／アーティスト／ジャンル／当時のシーン」に触れたうえで、その延長として短く添える程度にとどめること。
・「ロックの殿堂」「アルバムジャケット全般」「ライブ全般」などの完全な一般論だけを語ることは禁止。同じ情報を使う場合でも、必ず今の曲やアーティスト、あるいは同じ時代・同ジャンルの具体例に結びつけてから短く触れること（例：「90年代のオルタナ勢の中でもThe Cranberriesの『Zombie』は〜。ロックの殿堂級の名曲と並べても…」のように）。
・30秒豆知識では、話題の軸が「目の前の曲・アーティスト・アルバム・当該ジャンルと年代」から大きく外れないようにすること。「ところで〜」と切り出す場合でも、必ずその曲や時代の文脈に続く内容にすること。
・「洋楽でヒット曲といえば」等の断定的な一般論は出さないこと。話題は必ず上記1〜6のいずれかに紐づけること。
・ランキング・受賞・制作期間の断定ネタは乱発しないこと（出さないのが基本）。必要なら短く、断定しない形で。
・重要：話題は直前の曲のジャンル・年代に近い範囲に留めること。別ジャンル・別年代のアーティストを唐突に出さないこと。
・「豆知識ですが、」は使わない。キーワード冒頭（「この曲では」「このアルバムは」「〇〇で言うと」など）か「余談ですが」「ところで」などを前置きに使い、同じ表現の連続は避けること。
・カバー曲とはっきり分かる場合（タイトル・アーティストから明らかな場合）は、必ずオリジナルやネタ元の話を探して語ること。カバーであることを示し、原曲・原作者の情報やエピソードを優先して話題にすること。
・カバー版と分かる場合は、原曲情報を長く語りすぎず、カバーアーティスト側の紹介（当時の体制・編成・ゲスト）と原曲との差分（アレンジ・テンポ・歌い方/声質）を優先すること。企画趣旨（カバーアルバム、トリビュート、番組/ライブ企画）が分かれば添える。**カバー版の方が圧倒的に定着・ヒットしたケースでは、通常曲に近い扱いでカバー版を主軸にし、原曲説明は短く添える**。原曲の歌詞メッセージ読解は優先しない。
・リミックス版（Remix/別ミックス）と分かる場合は、原曲説明を長くしすぎず、リミックス版の聴きどころ（ビート/展開/空気感）と原曲との差分（テンポ・構成・歌の見え方）を優先すること。リミキサー/DJ名義が分かる場合はできるだけ触れる。**リミックス版の方が圧倒的に定着・ヒットしたケースでは、通常曲に近い扱いでリミックス版を主軸にする**。
・LIVE版と分かる場合は、通常曲の説明を繰り返さず、ライブ録音の差分（会場・テイク差・アレンジ差・観客反応）と企画趣旨（ツアー年、番組収録、トリビュート/チャリティ、A COLORS SHOW・THE FIRST TAKE など）を優先すること。当時のバンド編成・活動フェーズ・ゲスト参加も分かる範囲で添える。固有情報が弱い場合は捏造せず、オリジナル寄りの解説でよい。LIVE文脈ではチャートや社会的反響を主題にしない。
`
    : '';

  const prompt = `あなたは洋楽チャットの「音楽仲間」AIです。自分は「私」と呼んでください。性別を聞かれたら「性別はありません」と答えてください。${songHint}
30秒ほど誰も発言していないので、短く1〜2文で豆知識や一言を披露してください。
${mainArtistInstruction}${generalInstruction}・曲名・アーティスト名を文中に出すとき、(Official Video) 等の**公式動画・配信ラベル**は付けない。**Remix・Remaster が曲名に含まれる場合はそのまま**使うこと。
・「今流れている」を繰り返さない。
・押し付けがましくなく、さりげなく。日本語で、です・ます調。40文字以上100文字以内。本文だけ出力。`;

  try {
    let attempt = 0;
    let prompt2 = prompt;
    while (attempt < 2) {
      attempt += 1;
      const result = await model.generateContent(prompt2);
      logGeminiUsage('tidbit', result.response);
      await persistGeminiUsageLog('tidbit', result.response.usageMetadata, {
        ...usageMeta,
        videoId: usageMeta?.videoId ?? undefined,
      });
      const text = readGeneratedText(result.response, 'tidbit');
      if (
        text &&
        !isRejectedChatOrTidbitOutput(text) &&
        !containsUnreliableCommentaryDiscographyClaim(text)
      ) {
        return text;
      }
      if (attempt >= 2) return text || null;
      // 2回目：断定・根拠なしバズ/チャート/受賞/制作期間/録音工程・アルバム収録/順位を避ける
      prompt2 =
        prompt +
        '\n（追加指示）根拠がない「ブーム/拡散/チャート○位/受賞/制作期間/録音工程」や、アルバム名・「○○に収録」の断定を避け、歌詞テーマの要点とサウンドの特徴（印象）だけで短く書いてください。';
    }
    return null;
  } catch (e) {
    console.error('[gemini] generateTidbit:', e);
    return null;
  }
}

/** 曲貼り直後の最初の曲解説。基本情報を短く。新曲の場合は「〇〇の新曲ですかねえ」など */
export async function generateCommentary(
  title: string,
  authorName?: string,
  usageMeta?: GeminiUsageLogMeta,
): Promise<string | null> {
  if (usageMeta?.songIntroOnlyDiscography) {
    const song = (title ?? '').trim() || 'この曲';
    const artist = (authorName ?? '').trim() || 'このアーティスト';
    return buildSongIntroOnlyBaseComment(artist, song);
  }

  const model = getGeminiModel('commentary');
  if (!model) return null;

  const groundedFactsBlock = usageMeta?.groundedFactsBlock?.trim() ?? '';
  const hasMbFacts = groundedFactsBlock.length > 0;
  const music8FactsRaw = usageMeta?.music8FactsBlock?.trim() ?? '';
  const hasMusic8Facts = music8FactsRaw.length > 0;
  const hasReferenceFacts = hasMbFacts || hasMusic8Facts;

  const input =
    authorName && authorName !== title
      ? `アーティスト: ${authorName}\n曲名: ${title}`
      : `曲名（または動画タイトル）: ${title}`;

  /** 原文が「曲名 - アーティスト」でも、上記2行を唯一の正として文中の呼び方を固定する */
  const artistSongOrderLock =
    authorName && authorName !== title
      ? `・文中でアーティスト名と曲名を述べるときは、必ず「${authorName}の『${title}』」の語順にすること（YouTube 原文の語順やスペルと食い違っても、直前の「アーティスト:」「曲名:」の対応を優先）。\n・『』で囲むのは曲名のみ。アーティスト名（feat. や共演者を含む）を『』の内側に入れないこと。\n`
      : '';

  const rawTitle = usageMeta?.rawYouTubeTitle?.trim();
  const supergroupHint = usageMeta?.supergroupHintText?.trim() ?? '';
  const metaLock =
    rawTitle && rawTitle.length > 0
      ? `\nYouTube動画タイトル（原文）: ${rawTitle}\n・アーティスト名と曲名の上下関係を入れ替えたり、別作品として語らないこと。\n・曲名に含まれる英単語「With」はタイトルの一部であり、共演者名の区切りではない（例: Die With A Smile 全体が曲名）。曲名を勝手に短縮したり、With 以降を別アーティストとして扱わないこと。\n・タイトルと矛盾する架空のリリース年・アルバム名・未来の年号は書かない。不確実なら省くか弱い表現にとどめる。\n`
      : '';

  const currentYear = new Date().getFullYear();

  const mbFactsSection = hasMbFacts
    ? `\n【MusicBrainz から取得した事実（この範囲だけアルバム名・年・シングル／アルバム区分を述べてよい）】\n${groundedFactsBlock}\n`
    : '';
  const music8FactsSection = hasMusic8Facts ? `\n${music8FactsRaw}\n` : '';

  const discographyRules = hasReferenceFacts
    ? `・アルバム名・収録作・リリース年については、**直前の事実ブロック（MusicBrainz または Music8 参照事実）に書かれた内容に限って**触れてよい。それ以外の盤名・「デビュー／セカンド作」などの**補完・推測は禁止**。
・各国チャートの**具体順位**（○位・トップ10 等）は、事実ブロックに無い限り**禁止**。
`
    : `・リリース時期は**西暦1年だけ**書いてよいが、自信がなければ「1980年代」など幅のある表現にするか**年は省略**してよい。
・**検証済みディスコグラフィーがこのプロンプトに無い**ため、次を**禁止**：アルバム名（『○○』）の列挙、「デビューアルバム／セカンドアルバムに収録」「サントラ『○○』に収録」などの**収録作の断定**、各国チャートの**具体順位**。取り違えで虚偽になりやすい。
・代わりにジャンル上の位置づけ（ニューウェーブ等）、サウンドの印象、歌詞の雰囲気など**検証不要な観点**で書くこと。
`;

  const prompt = `選曲アナウンス（〇〇さんの選曲です！）の直後に表示する「曲の基本情報」を、80文字以上150文字以内で書いてください。現在は${currentYear}年です。自分を指すときは「私」を使ってください。
${input}${metaLock}
${artistSongOrderLock}
${supergroupHint ? `${supergroupHint}\n` : ''}
${mbFactsSection}${music8FactsSection}
・アーティスト名は必ず出すこと。
・アーティスト欄やタイトルに複数名（共演・feat. 等）が関わる場合は、**それぞれの役割や対比**（例：歌とラップの掛け合い）に一言触れてください。裏付けのない「出会いの経緯」は書かないこと。
${discographyRules}
・可能であれば、この曲のテーマや歌詞のメッセージを一言で要約して触れてよい（例：反戦歌、失恋ソング、社会問題を扱った曲など）。ただし歌詞全文の説明や長い意訳は避け、雰囲気が伝わる程度の短い説明にとどめること。
・「80年代といえば」「〇〇といえば」など年代・ジャンルの一般的な話題は出さないこと。あくまでこの曲とアーティストの基本情報だけを書くこと。
・アーティストが有名バンドのメンバーまたは元メンバーの場合は、必ずバンド名に触れること。例：Glenn Frey → Eaglesのメンバー、Steve Perry → Journeyの元ボーカル、など。
・カバー曲とはっきり分かる場合は、必ずオリジナルやネタ元（原曲のアーティスト・曲名・リリース年など）に触れること。カバーであることを示したうえで、原曲の話を入れること。
・カバー版と分かる場合は、原曲概要は短く、カバーアーティスト側の紹介（当時の体制・編成・ゲスト）を主役にすること。原曲との差分（アレンジ・テンポ・歌い方/声質）を優先し、企画趣旨（カバーアルバム、トリビュート、番組/ライブ企画）が分かれば触れること。**カバー版の方が圧倒的に定着・ヒットしたケースでは、通常曲に近い扱いでカバー版を主軸にし、原曲説明は短く添える**。原曲の歌詞メッセージ読解は優先しない。
・リミックス版（Remix/別ミックス）と分かる場合は、原曲説明は短く、リミックス版の解説を主軸にすること。原曲との差分（テンポ・ビート・構成・歌の見え方）を優先し、リミキサー/DJアーティストが分かる場合はできるだけ触れること。**リミックス版の方が圧倒的に定着・ヒットしたケースでは、通常曲に近い扱いでリミックス版を主軸にする**。
・LIVE版と分かる場合は、通常曲よりライブ固有の差分（会場・テイク差・アレンジ差・観客反応）と企画趣旨（ツアー年、番組収録、トリビュート/チャリティ、A COLORS SHOW・THE FIRST TAKE など）を優先し、当時の体制（編成・活動フェーズ・ゲスト参加）にも触れること。固有情報が弱い場合は捏造せず、オリジナル寄りの解説でよい。LIVE文脈ではチャートや社会的反響を主題にしない。
・リリースが直近1〜2年など新曲とはっきりわかる場合は、「〇〇の新曲ですかねえ」のような言い回しを自然に含めること。
・専門用語は少なめ。事実ベース＋一言感想。歌詞の全文や長い説明は禁止。
・曲名を文中に出すとき、(Official Video)・(Lyric Video)・(Official Audio) など**公式動画・配信ラベル**は付けない。**Remix・Remaster が曲名に含まれる場合はそのまま**使うこと。
・タイトルやクレジットから**別ミックス・リミックス版**と分かるときは、その版であることに一言触れてよい（オリジナルよりこのミックスの方が後から広く知られる、といった文脈も珍しくない）。根拠が薄いときは断定しないこと。
・「豆知識ですが、」の前フリは不要。アーティスト名や曲名から書き始めること。
・日本語で、です・ます調で。
解説文だけを出力してください。`;

  const regenHint = hasReferenceFacts
    ? '\n（追加指示）前回は事実ブロックに無いアルバム・チャート・収録の断定が混ざりました。**箇条書きの事実と、ジャンル・サウンド・雰囲気だけ**で80〜150字に書き直してください。'
    : '\n（追加指示）前回の案は検証不能なディスコグラフィー（アルバム名・収録作・チャート順位）を含んでいました。**アルバム名・収録アルバム・チャート順位は一切書かず**、アーティスト名＋年代感・ジャンル・サウンド・歌詞の雰囲気だけで80〜150字に書き直してください。';

  try {
    let attempt = 0;
    let promptUse = prompt;
    while (attempt < 2) {
      attempt += 1;
      const result = await model.generateContent(promptUse);
      logGeminiUsage('commentary', result.response);
      await persistGeminiUsageLog('commentary', result.response.usageMetadata, usageMeta);
      const text = readGeneratedText(result.response, 'commentary');
      if (!text) return null;
      if (hasReferenceFacts || !containsUnreliableCommentaryDiscographyClaim(text)) return text;
      if (attempt >= 2) return text;
      promptUse = prompt + regenHint;
    }
    return null;
  } catch (e) {
    console.error('[gemini] generateCommentary:', e);
    return null;
  }
}

/** 曲スタイル分類の選択肢。（）内のジャンルは今後増やす想定 */
export const SONG_STYLES = [
  'Pop',
  'Dance',
  'Electronica',
  'R&B',
  'Hip-hop',
  'Alternative rock',
  'Metal',
  'Rock',
  'Jazz',
  'Other',
] as const;

export type SongStyle = (typeof SONG_STYLES)[number];

/**
 * 曲タイトルとアーティスト名からスタイルを1つ返す。分からない場合は Other。
 * Pop: Pop, Folk, Country, Reggae / Dance: Dance, Disco, Funk / Electronica: House, Techno, Trance, D&B, Synthwave
 * R&B: R&B, Soul, Afrobeats / Hip-hop / Alternative rock / Metal: Metal, Hard rock / Rock: 上記以外のロック / Jazz / Other
 */
export async function getSongStyle(
  title: string,
  authorName?: string,
  usageMeta?: GeminiUsageLogMeta
): Promise<SongStyle> {
  const model = getGeminiModel('get_song_style');
  if (!model) return 'Other';

  const input =
    authorName && authorName.trim()
      ? `アーティスト: ${authorName.trim()}\n曲名: ${title.trim()}`
      : `曲名: ${title.trim()}`;

  const styleList = SONG_STYLES.join(' / ');
  const prompt = `以下の曲が洋楽のどのスタイルに最も近いか、次のリストのいずれか1つをそのままの表記で答えてください。分からない場合は Other。
スタイル一覧: ${styleList}

${input}

・Pop = Pop, Folk, Country, Reggae
・Dance = Dance, Disco, Funk
・Electronica = House, Techno, Trance, D&B, Synthwave
・R&B = R&B, Soul, Afrobeats
・Metal = Metal, Hard rock
・Alternative rock = オルタナティブ・ロック、ポストグランジ、インディー・ロック（Foo Fighters, Nirvana, Radiohead, Coldplay など）
・Rock = Alternative rock と Metal 以外のロック
上記以外のスタイルは使わないこと。リストの表記どおり出力（Alternative rock は2語で）。`;

  try {
    const result = await model.generateContent(prompt);
    logGeminiUsage('get_song_style', result.response);
    await persistGeminiUsageLog('get_song_style', result.response.usageMetadata, usageMeta);
    const text = readGeneratedText(result.response, 'get_song_style');
    // 全文がリストに含まれるか（Alternative rock など2語スタイル用）
    if (SONG_STYLES.includes(text as SongStyle)) return text as SongStyle;
    // 1語だけ返した場合
    const firstWord = text.split(/\s+/)[0]?.trim() ?? '';
    if (SONG_STYLES.includes(firstWord as SongStyle)) return firstWord as SongStyle;
    return 'Other';
  } catch (e) {
    console.error('[gemini] getSongStyle:', e);
    return 'Other';
  }
}

/** Gemma が前置きのあとにだけ正答ラベルを書く／文中に Pre-50s 等だけ含むときの抽出 */
export function extractSongEraOptionFromModelText(raw: string): SongEraOption | null {
  const text = raw.trim();
  if (!text) return null;
  if (SONG_ERA_OPTIONS.includes(text as SongEraOption)) return text as SongEraOption;
  const firstToken = text.split(/\s+/)[0]?.trim() ?? '';
  if (SONG_ERA_OPTIONS.includes(firstToken as SongEraOption)) return firstToken as SongEraOption;
  const ordered = [...SONG_ERA_OPTIONS].filter((o) => o !== 'Other').sort((a, b) => b.length - a.length);
  for (const opt of ordered) {
    const esc = opt.replace(/-/g, '\\-');
    const re = new RegExp(`(^|[^A-Za-z0-9])(${esc})([^A-Za-z0-9]|$)`, 'i');
    const m = re.exec(text);
    if (m) {
      const hit = m[2];
      const exact = SONG_ERA_OPTIONS.find((o) => o.toLowerCase() === hit.toLowerCase());
      if (exact) return exact;
    }
  }
  return null;
}

/**
 * 曲タイトル・アーティスト・任意の説明から、録音／ヒットの十年を1つ返す。分からない場合は Other。
 */
export async function getSongEra(
  title: string,
  artistName?: string,
  description?: string,
  usageMeta?: GeminiUsageLogMeta
): Promise<SongEraOption> {
  const model = getGeminiModel('get_song_era');
  if (!model) return 'Other';

  const parts: string[] = [];
  if (artistName?.trim()) parts.push(`アーティスト: ${artistName.trim()}`);
  parts.push(`曲名: ${title.trim()}`);
  if (description?.trim()) {
    parts.push(`補足: ${description.trim().slice(0, 2000)}`);
  }
  const input = parts.join('\n');

  const eraList = SONG_ERA_OPTIONS.join(' / ');
  const prompt = `以下の曲について、主に録音またはヒットしたと思われる年代（十年単位）を、次のリストのいずれか1つをそのままの表記で答えてください。分からない場合は Other。
年代一覧: ${eraList}

${input}

・Pre-50s = 1950年以前、50s = 1950年代、…、20s = 2020年代
上記以外のラベルは使わないこと。
・**出力はリストのラベル1語（例: 10s）のみ**。説明文・前置き・箇条書きは禁止。`;

  try {
    const result = await model.generateContent(prompt);
    logGeminiUsage('get_song_era', result.response);
    await persistGeminiUsageLog('get_song_era', result.response.usageMetadata, usageMeta);
    const text = readGeneratedText(result.response, 'get_song_era');
    return extractSongEraOptionFromModelText(text) ?? 'Other';
  } catch (e) {
    console.error('[gemini] getSongEra:', e);
    return 'Other';
  }
}

const USER_TASTE_AUTO_PROFILE_OUTPUT_MAX = 520;

/**
 * チャット・選曲履歴・お気に入り・マイリスト等の抜粋テキストから、洋楽趣向の短い要約を1本生成する。
 */
export async function generateUserTasteAutoProfile(
  signalsMarkdown: string,
  usageMeta?: GeminiUsageLogMeta,
): Promise<string | null> {
  const model = getGeminiModel('user_taste_auto_profile');
  if (!model) return null;
  const input = signalsMarkdown.trim().slice(0, 14_000);
  if (input.length < 40) return null;

  const prompt = `あなたは洋楽チャット利用者の「聴取趣向・関心の傾向」を短くまとめるアシスタントです。
以下は同一ユーザーの複数ソースから集めた抜粋です（個人を特定する記述は出力に含めないこと）。

【入力】
${input}

【出力】
- 日本語で、箇条書き3〜6行程度、合計${USER_TASTE_AUTO_PROFILE_OUTPUT_MAX}文字以内。
- 好むジャンル・時代・アーティスト傾向、チャットで繰り返し出る話題があれば簡潔に。
- 断定しすぎず「〜の傾向」「〜が多い」などにとどめる。
- マークダウン見出し・コードブロックは使わない。`;

  try {
    const tasteGen: GenerationConfig = {
      temperature: 0.2,
      maxOutputTokens: 512,
    };
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: tasteGen,
    });
    logGeminiUsage('user_taste_auto_profile', result.response);
    await persistGeminiUsageLog('user_taste_auto_profile', result.response.usageMetadata, {
      roomId: usageMeta?.roomId ?? null,
      videoId: usageMeta?.videoId ?? null,
    });
    let text = readGeneratedText(result.response, 'user_taste_auto_profile');
    if (!text) return null;
    text = text.replace(/\r\n/g, '\n');
    if (text.length > USER_TASTE_AUTO_PROFILE_OUTPUT_MAX) {
      text = text.slice(0, USER_TASTE_AUTO_PROFILE_OUTPUT_MAX - 1) + '…';
    }
    return text;
  } catch (e) {
    console.error('[gemini] generateUserTasteAutoProfile:', e);
    return null;
  }
}

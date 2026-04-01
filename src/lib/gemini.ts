/**
 * サーバー専用: Gemini API 呼び出し（API Routes から使用）
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  containsUnreliableCommentaryDiscographyClaim,
  isRejectedChatOrTidbitOutput,
} from '@/lib/ai-output-policy';
import { persistGeminiUsageLog } from '@/lib/gemini-usage-log';
import { SONG_ERA_OPTIONS, type SongEraOption } from '@/lib/song-era-options';

const MODEL = 'gemini-2.5-flash';

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
      model: MODEL,
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

export function getGeminiModel() {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: MODEL });
}

export type GeminiUsageLogMeta = {
  roomId?: string | null;
  videoId?: string | null;
  /** 曲解説で「タイトル原文」と解析済み名の整合を取らせる用 */
  rawYouTubeTitle?: string | null;
  /** MusicBrainz 検索で得た事実のみアルバム名・年を述べてよいときの箇条書き本文 */
  groundedFactsBlock?: string | null;
};

/** チャット文脈の上限（長い会話・長文貼り付けでのトークン膨張を抑える） */
const CHAT_CONTEXT_MAX_MESSAGES = 8;
const CHAT_CONTEXT_MAX_BODY_CHARS = 480;

function truncateChatContextBody(body: string): string {
  const t = body.replace(/\r\n/g, '\n');
  if (t.length <= CHAT_CONTEXT_MAX_BODY_CHARS) return t;
  return `${t.slice(0, CHAT_CONTEXT_MAX_BODY_CHARS - 1)}…`;
}

/** 直近のチャット履歴から AI の返答を生成（相槌・感想、または曲の事実質問への回答） */
export async function generateChatReply(
  recentMessages: { displayName?: string; body: string; messageType?: string }[],
  currentSong?: string | null,
  currentSongStyle?: string | null,
  usageMeta?: GeminiUsageLogMeta
): Promise<string | null> {
  const model = getGeminiModel();
  if (!model) return null;

  const lines = recentMessages
    .slice(-CHAT_CONTEXT_MAX_MESSAGES)
    .map((m) => {
      const who = m.messageType === 'ai' ? 'AI' : (m.displayName ?? 'ユーザー');
      return `${who}: ${truncateChatContextBody(typeof m.body === 'string' ? m.body : '')}`;
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
      '・曲やアーティストについての質問には、知っている範囲で事実に基づいて簡潔に答えてください。ただし**どのアルバムに収録か・チャート順位**などは手元で照合できないため断定しないこと。活動状況（解散・休止・ソロ・再結成など）を聞かれた場合は、知っている範囲で答えてください。\n';
    songContext +=
      '・カバー曲とはっきり分かる場合（タイトル・アーティストから明らかな場合）は、必ずオリジナルやネタ元の曲・アーティストの話を探して触れること。カバーであることを示したうえで、原曲や原作者の情報を優先して話すこと。\n';
  }

  const prompt = `あなたは洋楽を聴きながら参加者とチャットしている「音楽仲間」のAIです。自分は「私」と呼んでください。性別を聞かれたら「性別はありません」と答えてください。
以下の直近の会話に対して返してください。${songContext}
・通常は相槌や短い感想を1〜2文で（40文字以上120文字以内）。
・同意するときは「はい、そうですね」ではなく「そう思います」を使うこと。
・PV・ミュージックビデオ・映像の内容について言及されたときは、あなたは動画を見られないので「私はPVを見ることができません」と正直に伝えること。曲やアーティストの情報には触れてよい。
・直近の曲（現在かかっている曲・さっき流れた曲）の話題は、同じ曲について2回までにすること。3回目以降は短い相槌に留めるか、別の話題に移ること。
・「今流れている」「今かかっている」などの同じフレーズを続けて使わないこと。言い換えの例：この曲は、このアーティストは、さっきの曲では、この楽曲は、など表現を変えること。
・今かかっている曲・アーティストの解説をするときは「豆知識ですが、」などの前フリは不要。アーティスト名や曲名から書き始めること。
・曲名を文中に出すときは、(HD Remaster)・[4K Remaster]・[8K] などの画質・Remaster・公式動画向けの副題は付けず、曲名の本体だけを使うこと。
・本題に入る前の前置きは、毎回同じにしないこと。次のような表現をローテーションして使う：「洋楽の話ですが」「知ってます？」「余談ですが」「ところで」「関連しますが」「聞いたことあるかもしれませんが」「同じ時代では…」「その頃の話ですが」など。直近の会話で使った前置きは避け、別の表現を選ぶこと。ただし上記のとおり、今かかっている曲の解説のときは「豆知識ですが、」は使わない。
・話の流れを大切にし、なるべく前の会話に出たアーティスト・ジャンル・時代に関連した話題にしてください。ただし曲再生中は上記のとおり「現在の曲・アーティスト・ジャンル・サントラの映画」に限定し、そのジャンルと無関係なアーティストは出さないこと。話が大きく飛ぶときは上記の前置きのどれかで関連付けを入れてください。
・ユーザーが「曲を紹介して」「おすすめのアーティストある？」など紹介・推薦を求めた場合は、必ず最初に「1つだけ紹介しますね。」と明示したうえで、候補は**1つだけ**出すこと。複数候補（2件以上）の列挙は禁止。
・曲の事実を聞かれたら（何年リリース？など）、**確信が持てる範囲だけ**簡潔に答える。曖昧なら「すみません、こちらでは確かめられません」と断る。
・**どのアルバムに収録か・デビュー作か・各国チャートの順位**などディスコグラフィーの細部を聞かれたとき、またはユーザーがその種の事実を述べて確認してきたときは、**検証できないまま「はい、そのとおりです」と肯定しない**こと。確認できない場合は「すみません、手元では照合できません。公式ディスコグラフィーや信頼できる音楽データベースでのご確認をおすすめします」のように案内する。
・直前の AI 発言（曲解説・豆知識）の内容を、ユーザーが「本当？」と聞いたからといって、そのまま真実として繰り返さないこと。
・アーティストの現在の活動状況を聞かれたら、知っている範囲で事実に基づいて簡潔に答えてください。
・ユーザーがアーティスト名らしき言葉を言ったとき：表記ゆれ・略称で有名な洋楽アーティストに該当しそうなら、正しい名前で確認すること。例：「ブラ」→「Blur（ブラー）のことでしょうか？」「オアシス」→そのまま理解してよい。該当するアーティストが思いつく場合は必ず確認してから会話を続ける。
・ユーザーが言ったアーティスト名・バンド名が、思いつく洋楽アーティストのどれにも該当しない場合は、知らないと正直に答えること。例：「〇〇っていうアーティストは私、知らないです…。別のアーティストだったら教えてもらえると嬉しいです！」のように、知らないと言いつつ相手を否定しない。
・「曲を貼って」「流して」と依頼されている場合は「お探しの曲が見つからなかったかもしれません…」など短く。機能がないとは言わないでください。
・主役は人間。しゃべりすぎず、親しみやすいトーンで。否定せず共感を中心に。日本語で、です・ます調で。
・ユーザーの発言を訂正・否定する場合（「いえ、〜ではないんです」など）は断定しないこと。「〜だと思います」「〜のようです」など、柔らかく伝えること。
・ユーザーがあなたの発言（豆知識やコメント）に反応している場合は、その内容を受け止めてキャッチボールすること。相槌だけでなく、会話が続くように返すこと。
・ユーザーがあなたのコメントを否定したり、間違いを訂正しようとしている場合は、素直に受け止めること。事実と異なる場合があることを認め、謝罪してから返すこと。例：「すみません、私の認識が違っていたかもしれません」「ご指摘ありがとうございます。事実と異なっていたかもしれません、失礼しました」など。
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
      const text = result.response.text()?.trim() ?? '';
      if (
        text &&
        !isRejectedChatOrTidbitOutput(text) &&
        !containsUnreliableCommentaryDiscographyClaim(text)
      ) {
        return text;
      }
      if (attempt >= 2) return text || null;
      // 2回目：根拠なしのバズ/チャート/受賞/制作・アルバム収録/順位の断定を避ける
      prompt2 =
        prompt +
        '（追加指示）根拠がない断定、アルバム名・収録作・チャート順位の断定的な記述を避け、歌詞テーマの要点とサウンドの特徴（印象）だけで短く書いてください。';
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

  const model = getGeminiModel();
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
    const out = result.response.text()?.trim() ?? '';
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

/** 30秒無発言時用：短い豆知識を1〜2文で生成。preferMainArtist 時は曲解説直後としてメインアーティストについて語る。preferGeneral 時は一般的な豆知識でよい */
export async function generateTidbit(
  currentSong?: string | null,
  preferGeneral?: boolean,
  preferMainArtist?: boolean,
  usageMeta?: GeminiUsageLogMeta
): Promise<string | null> {
  const model = getGeminiModel();
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
`
    : '';

  const prompt = `あなたは洋楽チャットの「音楽仲間」AIです。自分は「私」と呼んでください。性別を聞かれたら「性別はありません」と答えてください。${songHint}
30秒ほど誰も発言していないので、短く1〜2文で豆知識や一言を披露してください。
${mainArtistInstruction}${generalInstruction}・曲名・アーティスト名を文中に出すとき、YouTube タイトル由来の (HD Remaster)・[4K Remaster]・Remaster などの副題は付けず、曲名の本体だけを使うこと。
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
      const text = result.response.text()?.trim() ?? '';
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
  const model = getGeminiModel();
  if (!model) return null;

  const groundedFactsBlock = usageMeta?.groundedFactsBlock?.trim() ?? '';
  const hasMbFacts = groundedFactsBlock.length > 0;

  const input =
    authorName && authorName !== title
      ? `アーティスト: ${authorName}\n曲名: ${title}`
      : `曲名（または動画タイトル）: ${title}`;

  /** 原文が「曲名 - アーティスト」でも、上記2行を唯一の正として文中の呼び方を固定する */
  const artistSongOrderLock =
    authorName && authorName !== title
      ? `・文中でアーティスト名と曲名を述べるときは、必ず「${authorName}の『${title}』」の語順にすること（YouTube 原文の語順やスペルと食い違っても、直前の「アーティスト:」「曲名:」の対応を優先）。\n`
      : '';

  const rawTitle = usageMeta?.rawYouTubeTitle?.trim();
  const metaLock =
    rawTitle && rawTitle.length > 0
      ? `\nYouTube動画タイトル（原文）: ${rawTitle}\n・アーティスト名と曲名の上下関係を入れ替えたり、別作品として語らないこと。\n・曲名に含まれる英単語「With」はタイトルの一部であり、共演者名の区切りではない（例: Die With A Smile 全体が曲名）。曲名を勝手に短縮したり、With 以降を別アーティストとして扱わないこと。\n・タイトルと矛盾する架空のリリース年・アルバム名・未来の年号は書かない。不確実なら省くか弱い表現にとどめる。\n`
      : '';

  const currentYear = new Date().getFullYear();

  const mbFactsSection = hasMbFacts
    ? `\n【MusicBrainz から取得した事実（この範囲だけアルバム名・年・シングル／アルバム区分を述べてよい）】\n${groundedFactsBlock}\n`
    : '';

  const discographyRules = hasMbFacts
    ? `・アルバム名・収録作・リリース年については、**直前の【MusicBrainz…】の箇条書きに書かれた内容に限って**触れてよい。それ以外の盤名・「デビュー／セカンド作」などの**補完・推測は禁止**。
・各国チャートの**具体順位**（○位・トップ10 等）は、事実ブロックに無い限り**禁止**（MusicBrainz の検索結果にチャートは含めていない）。
`
    : `・リリース時期は**西暦1年だけ**書いてよいが、自信がなければ「1980年代」など幅のある表現にするか**年は省略**してよい。
・**検証済みディスコグラフィーがこのプロンプトに無い**ため、次を**禁止**：アルバム名（『○○』）の列挙、「デビューアルバム／セカンドアルバムに収録」「サントラ『○○』に収録」などの**収録作の断定**、各国チャートの**具体順位**。取り違えで虚偽になりやすい。
・代わりにジャンル上の位置づけ（ニューウェーブ等）、サウンドの印象、歌詞の雰囲気など**検証不要な観点**で書くこと。
`;

  const prompt = `選曲アナウンス（〇〇さんの選曲です！）の直後に表示する「曲の基本情報」を、80文字以上150文字以内で書いてください。現在は${currentYear}年です。自分を指すときは「私」を使ってください。
${input}${metaLock}
${artistSongOrderLock}
${mbFactsSection}
・アーティスト名は必ず出すこと。
・アーティスト欄やタイトルに複数名（共演・feat. 等）が関わる場合は、**それぞれの役割や対比**（例：歌とラップの掛け合い）に一言触れてください。裏付けのない「出会いの経緯」は書かないこと。
${discographyRules}
・可能であれば、この曲のテーマや歌詞のメッセージを一言で要約して触れてよい（例：反戦歌、失恋ソング、社会問題を扱った曲など）。ただし歌詞全文の説明や長い意訳は避け、雰囲気が伝わる程度の短い説明にとどめること。
・「80年代といえば」「〇〇といえば」など年代・ジャンルの一般的な話題は出さないこと。あくまでこの曲とアーティストの基本情報だけを書くこと。
・アーティストが有名バンドのメンバーまたは元メンバーの場合は、必ずバンド名に触れること。例：Glenn Frey → Eaglesのメンバー、Steve Perry → Journeyの元ボーカル、など。
・カバー曲とはっきり分かる場合は、必ずオリジナルやネタ元（原曲のアーティスト・曲名・リリース年など）に触れること。カバーであることを示したうえで、原曲の話を入れること。
・リリースが直近1〜2年など新曲とはっきりわかる場合は、「〇〇の新曲ですかねえ」のような言い回しを自然に含めること。
・専門用語は少なめ。事実ベース＋一言感想。歌詞の全文や長い説明は禁止。
・曲名を文中に出すときは、YouTube タイトルに付く (HD Remaster)・[4K Remaster]・Remaster・公式動画向けの副題は付けず、曲名の本体だけを使うこと。
・「豆知識ですが、」の前フリは不要。アーティスト名や曲名から書き始めること。
・日本語で、です・ます調で。
解説文だけを出力してください。`;

  const regenHint = hasMbFacts
    ? '\n（追加指示）前回は【MusicBrainz】に無いアルバム・チャート・収録の断定が混ざりました。**箇条書きの事実と、ジャンル・サウンド・雰囲気だけ**で80〜150字に書き直してください。'
    : '\n（追加指示）前回の案は検証不能なディスコグラフィー（アルバム名・収録作・チャート順位）を含んでいました。**アルバム名・収録アルバム・チャート順位は一切書かず**、アーティスト名＋年代感・ジャンル・サウンド・歌詞の雰囲気だけで80〜150字に書き直してください。';

  try {
    let attempt = 0;
    let promptUse = prompt;
    while (attempt < 2) {
      attempt += 1;
      const result = await model.generateContent(promptUse);
      logGeminiUsage('commentary', result.response);
      await persistGeminiUsageLog('commentary', result.response.usageMetadata, usageMeta);
      const text = result.response.text()?.trim() ?? '';
      if (!text) return null;
      if (hasMbFacts || !containsUnreliableCommentaryDiscographyClaim(text)) return text;
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
  const model = getGeminiModel();
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
    const text = result.response.text()?.trim() ?? '';
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

/**
 * 曲タイトル・アーティスト・任意の説明から、録音／ヒットの十年を1つ返す。分からない場合は Other。
 */
export async function getSongEra(
  title: string,
  artistName?: string,
  description?: string,
  usageMeta?: GeminiUsageLogMeta
): Promise<SongEraOption> {
  const model = getGeminiModel();
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
上記以外のラベルは使わないこと。`;

  try {
    const result = await model.generateContent(prompt);
    logGeminiUsage('get_song_era', result.response);
    await persistGeminiUsageLog('get_song_era', result.response.usageMetadata, usageMeta);
    const text = result.response.text()?.trim() ?? '';
    if (SONG_ERA_OPTIONS.includes(text as SongEraOption)) return text as SongEraOption;
    const firstToken = text.split(/\s+/)[0]?.trim() ?? '';
    if (SONG_ERA_OPTIONS.includes(firstToken as SongEraOption)) {
      return firstToken as SongEraOption;
    }
    return 'Other';
  } catch (e) {
    console.error('[gemini] getSongEra:', e);
    return 'Other';
  }
}

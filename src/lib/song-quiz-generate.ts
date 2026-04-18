/**
 * 曲解説テキストから 3 択クイズを生成（サーバー専用）
 */
import { extractTextFromGenerateContentResponse } from '@/lib/gemini-gemma-host';
import { getGeminiModel, logGeminiUsage } from '@/lib/gemini';
import { resolveGenerationModelId } from '@/lib/gemini-model-routing';
import { persistGeminiUsageLog } from '@/lib/gemini-usage-log';
import { shuffleQuizChoicesDeterministic } from '@/lib/song-quiz-choice-shuffle';
import {
  isValidSongQuizPayload,
  isValidSongQuizTheme,
  type SongQuizPayload,
  type SongQuizTheme,
} from '@/lib/song-quiz-types';

const SONG_QUIZ_THEME_IDS: readonly SongQuizTheme[] = ['sound', 'artist', 'reception', 'relations'];

const THEME_PROMPT_JA: Record<SongQuizTheme, string> = {
  sound: 'サウンド・編曲・演奏表現（聴き取れる質感や展開）',
  artist: 'アーティスト本人の経歴・人物像・制作の意図や背景（参考テキストに書かれている範囲）',
  reception:
    '社会的・文化的な受け止め・論争・世代やシーンとのズレ・映像・パフォーマンス文脈（「ヒットしたか」だけの広さ比較にしない。チャート順位・売上・受賞の具体数値は出さない）',
  relations: 'コラボ・カバー・サンプル・言及された他アーティストや同世代・シーンとの比較文脈',
};

function hashSongQuizThemeSeed(videoId: string, roomId: string, commentaryPrefix: string): number {
  const s = `${videoId}\0${roomId}\0${commentaryPrefix.slice(0, 160)}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 同一曲解説でも再生ごとに観点の優先順が変わるよう、決定的にシャッフルする */
function shuffledThemePriorityOrder(seed: number): SongQuizTheme[] {
  const order: SongQuizTheme[] = [...SONG_QUIZ_THEME_IDS];
  let x = seed;
  for (let i = order.length - 1; i > 0; i--) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    const j = x % (i + 1);
    const t = order[i];
    order[i] = order[j]!;
    order[j] = t!;
  }
  return order;
}

/** モデルが theme に想定外の語を返したときでも他フィールドは活かす */
function normalizeSongQuizJson(x: unknown): unknown {
  if (!x || typeof x !== 'object') return x;
  const o = x as Record<string, unknown>;
  if (o.theme !== undefined && !isValidSongQuizTheme(o.theme)) {
    const { theme: _drop, ...rest } = o;
    return rest;
  }
  return x;
}

function extractJsonObject(raw: string): unknown | null {
  const t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t);
  const body = fence ? fence[1].trim() : t;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

const MIN_CONTEXT_CHARS = 60;

export type SongQuizGenerateMeta = {
  roomId?: string | null;
  videoId?: string | null;
};

/**
 * 曲解説（複数本を連結したテキスト）のみを根拠に 3 択を 1 問生成する。
 */
export async function generateSongQuizFromCommentary(
  commentaryContext: string,
  meta?: SongQuizGenerateMeta,
): Promise<SongQuizPayload | null> {
  const ctx = commentaryContext.trim();
  if (ctx.length < MIN_CONTEXT_CHARS) return null;

  const model = getGeminiModel('song_quiz');
  if (!model) return null;

  const seed = hashSongQuizThemeSeed(
    (meta?.videoId ?? '').trim(),
    (meta?.roomId ?? '').trim(),
    ctx,
  );
  const themePriority = shuffledThemePriorityOrder(seed);
  const priorityHuman = themePriority.map((id) => THEME_PROMPT_JA[id]).join(' → ');

  const prompt = `あなたは洋楽チャットのクイズ作成者です。次の【曲解説テキスト】に**書かれている内容だけ**を根拠に、**三択クイズを 1 問**作ってください。

【出題の観点（テーマ）】次の 4 分類があります。曲解説に**十分な根拠があるものだけ**から選び、**1 問につき 1 テーマに絞る**こと。
・sound — ${THEME_PROMPT_JA.sound}
・artist — ${THEME_PROMPT_JA.artist}
・reception — ${THEME_PROMPT_JA.reception}
・relations — ${THEME_PROMPT_JA.relations}

【バランス（重要）】サウンド（sound）だけに偏らないこと。**曲解説に根拠があるテーマが複数あるときは、可能な限り sound 以外を選ぶ**。sound 以外に根拠が乏しく、サウンド面だけが明確なときに限り sound を選んでよい。

【歌詞の扱い（重要）】洋楽では歌詞の字面・意味にまで聴き手が深入りしないことが多い前提に立つ。**歌詞の語句解釈・比喩・物語・メッセージ性だけを主題にした出題は、上記 4 観点のなかでも優先度を下げる**。曲解説に歌詞の話が多くても、可能なら**音色・編曲・リズム・時代・文化・アーティストや他曲との関係**など、歌詞以外の角度で成立する問題を先に検討する。歌詞に踏み込むのは、それらで十分な問題が取れない場合に限る。

【面白さ・ひねり（重要）】**「当たり前の三択」に聞こえる問題は避ける**。次のような出題は退屈になりやすいので**原則避ける**（曲解説にその対比しか無い場合のみやむなし）:
・**浸透度・ヒットの規模だけを弱・中・強で並べた三択**（例: マニアのみ／米中心／世界中）。読み手に「ひねり」や発見がなく、テスト問題の印象になる。
・「受け止め方をされましたか」に対し、**一般論のパラフレーズだけ**が三肢に並ぶパターン。

代わりに優先する例:
・曲解説の**一文を突く**（意外な事実・対比・「なぜそう言えるか」）。
・**サウンド・編曲・関係者・他曲との関係・当時の論点**など、耳や文脈に寄せた**具体的な食い違い**を三択にする。
・reception を使うなら「ヒット幅」ではなく、**論争・世代反応・カバーとしての位置づけ・映像やパフォーマンスが生んだ空気**など、テキストに書かれた**くせ**を問う。

出題前に自問: **この三択は雑談で出しても一瞬で答えが想像できるか？** 想像だけで決まるなら、問いの立て方かテーマを変える。

【今回の優先探索順】曲解説を読み、**次の順に「根拠が十分か」を検討し、最初に成立するテーマ**を採用する（成立しないものは飛ばす）。ただし**そのテーマで作ると歌詞偏重になりそうなら、次の候補に進み**歌詞以外の観点を優先する。
${priorityHuman}

【厳守】
・正解・誤答の根拠はすべて【曲解説テキスト】の**中に明示または強く示唆されている**ものに限定する。テキストに無い事実・数値・固有名は出さない。
・誤答肢は、テキストと**明らかに矛盾する**か、**別の曲っぽい聴き方**になるようにし、当て推量で細かい数値を作らない。
・チャート順位・売上・受賞の具体数字は出さない。
・問題文は 120 文字以内、各選択肢は 70 文字以内。日本語、です・ます調。
・**正解が常に 1 番目の選択肢になるような並べ方は避ける**こと。正解肢は 3 つのうちどの位置にも置きうる想定で、**correctIndex は 0・1・2 を偏りなく**選ぶ（連続した出題で同じ位置ばかりにしない）。

【問題文のトーン（厳守・プレイヤー向け）】
・question には「曲解説」「この説明」「この解説」「上のテキスト」「上記の文章」「テキストでは」「解説では」「書かれていること」「記載されているとおり」など、**資料を読ませる・当て付けが強い誘導**を書かない。あくまで**この曲・このアーティストについて、一緒に聴いている場で自然に聞けそうな一問**にする。
・根拠の取り方は内部では【曲解説テキスト】に限定してよいが、**問題文ではその資料の存在に触れない**（まるで教科書の抜き読みのような印象を避ける）。
・explanation では曲解説の内容に言及してよい（正解理由として）。

【出力形式】JSON オブジェクトのみ（前後に説明文や Markdown 禁止）。キーは次の通り:
question (string), choices (string の配列で**ちょうど 3 要素**), correctIndex (0, 1, 2 のいずれか), explanation (string: 正解の理由を 1〜2 文), theme (string: 採用した観点を **sound / artist / reception / relations のいずれか 1 語**)

【曲解説テキスト】
${ctx}`;

  const modelId = resolveGenerationModelId('song_quiz');
  const result = await model.generateContent(prompt);
  logGeminiUsage('song_quiz', result.response);
  await persistGeminiUsageLog('song_quiz', result.response.usageMetadata, {
    roomId: meta?.roomId?.trim() || null,
    videoId: meta?.videoId?.trim() || null,
  });

  const text = extractTextFromGenerateContentResponse(result.response, modelId).trim();
  const raw = extractJsonObject(text);
  const parsed = normalizeSongQuizJson(raw);
  if (!isValidSongQuizPayload(parsed)) return null;

  const choicesTrimmed: [string, string, string] = [
    String(parsed.choices[0]).trim(),
    String(parsed.choices[1]).trim(),
    String(parsed.choices[2]).trim(),
  ];
  const { choices, correctIndex } = shuffleQuizChoicesDeterministic(
    choicesTrimmed,
    parsed.correctIndex,
    seed,
  );
  const theme = parsed.theme !== undefined && isValidSongQuizTheme(parsed.theme) ? parsed.theme : undefined;

  return {
    question: parsed.question.trim(),
    choices,
    correctIndex,
    explanation: parsed.explanation.trim(),
    ...(theme ? { theme } : {}),
  };
}

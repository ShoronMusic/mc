/**
 * 「@Fooについて（詳しく）教えて」「@Fooの概要教えて」系はキーワード一覧に固有名が無く落ちやすい。
 * 直近が曲解説・YouTube 等の洋楽チャット文脈なら、Gemini 判定前に通す。
 * 固有名のカタカナ網羅はしない。カタカナ（3文字以上）または英字名＋「活動」「アルバム」等の強い音楽語で拾う。
 */

export type AboutDetailRecentMessage = {
  body?: string;
  messageType?: string;
};

/** 主題がこれに完全一致、または先頭トークンが一致なら「について教えて」でも通さない */
const OFF_TOPIC_SUBJECT_EXACT = new Set(
  [
    '政治',
    '天気',
    '気象',
    '株',
    '株価',
    '株式',
    '投資',
    '為替',
    'ニュース',
    '料理',
    'レシピ',
    'プログラミング',
    'プログラム',
    'javascript',
    'typescript',
    'python',
    'ruby',
    'java',
    '宿題',
    '健康',
    '病気',
    '投資信託',
    'ビットコイン',
    '仮想通貨',
    '政治経済',
    'politics',
    'weather',
    'bitcoin',
    'stocks',
    'investing',
    'programming',
    'homework',
  ].map((s) => s.toLowerCase())
);

const OFF_TOPIC_SUBJECT_SUBSTR = ['天気予報', '株式市場', '為替レート', 'プログラミング言語'];

/** 主題文中に含まれたらオフトピック（英語の weather 等は誤爆しやすいので入れない） */
const OFF_TOPIC_JA_CONTAINS = [
  '政治',
  '天気',
  '株式',
  '投資',
  '為替',
  'ビットコイン',
  '仮想通貨',
  'プログラミング',
  'ニュース番組',
];

function normalizeSubjectKey(s: string): string {
  return s
    .trim()
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function firstToken(subject: string): string {
  const t = subject.trim().normalize('NFKC');
  const m = t.match(/^([^\s　]+)/u);
  return (m?.[1] ?? t).toLowerCase();
}

export function isOffTopicAboutSubject(subjectRaw: string): boolean {
  const subject = normalizeSubjectKey(subjectRaw);
  if (subject.length < 2 || subject.length > 100) return true;
  if (/^[\d\s.,\-_:／/\\]+$/u.test(subject)) return true;

  if (OFF_TOPIC_SUBJECT_EXACT.has(subject)) return true;
  const tok = firstToken(subjectRaw);
  if (OFF_TOPIC_SUBJECT_EXACT.has(tok)) return true;

  const rawN = subjectRaw.normalize('NFKC');
  for (const w of OFF_TOPIC_JA_CONTAINS) {
    if (rawN.includes(w)) return true;
  }

  for (const frag of OFF_TOPIC_SUBJECT_SUBSTR) {
    if (subject.includes(frag.toLowerCase())) return true;
  }
  return false;
}

/**
 * 直近ログに、洋楽チャットの続きとみなせる手掛かりがあるか（緩い判定）。
 */
export function recentMessagesSuggestMusicRoomContext(
  recent: readonly AboutDetailRecentMessage[]
): boolean {
  const slice = recent.slice(-12);
  for (const m of slice) {
    if (m.messageType === 'ai') return true;
    const body = typeof m.body === 'string' ? m.body : '';
    const low = body.toLowerCase();
    if (low.includes('youtube.com/') || low.includes('youtu.be/')) return true;
    if (body.includes('[DB]') || body.includes('[NEW]')) return true;
  }
  return false;
}

/**
 * 「主題 + について + （詳しく）+ 教えて（ください）」形式か。
 */
export function parseAboutDetailQuestionSubject(question: string): string | null {
  const q = question.trim().replace(/\r\n/g, '\n').normalize('NFKC');
  if (!q || q.includes('\n')) return null;

  const m = q.match(
    /^([\s\S]{2,100}?)\s*について(?:ついて)?(?:[\s\u3000]*詳しく)?[\s\u3000]*教えて(?:ください)?\s*[?？]*\s*$/u
  );
  if (!m?.[1]) return null;
  const subject = m[1].trim();
  if (subject.length < 2) return null;
  return subject;
}

export function isAboutDetailMusicFollowupQuestion(
  question: string,
  recent: readonly AboutDetailRecentMessage[]
): boolean {
  const subject = parseAboutDetailQuestionSubject(question);
  if (!subject) return false;
  if (isOffTopicAboutSubject(subject)) return false;
  if (!recentMessagesSuggestMusicRoomContext(recent)) return false;
  return true;
}

/**
 * 「主題 + の +（概要｜メンバー｜現在…）+（を）+（教えて｜知りたい…）」形式、
 * 「主題 + の + 現在／近況… +（？）」、
 * 「主語 + は + 今／まだ + 活動／活躍 + …（？）」（例: ホワイトスネイクは今、活動しているの？）、
 * 「…のダンス（のスタイル）は？」（楽曲・MV に紐づく振付・ダンス）。
 */
const ARTIST_PROFILE_TOPIC_NOUN = [
  // バイオ・ディスコグラフィ
  '概要',
  '詳細',
  '構成',
  '内訳',
  '遍歴',
  '歴史',
  '活動',
  '現状',
  '現在',
  '実績',
  '活躍',
  '経歴',
  '来歴',
  'プロフィール',
  'メンバー',
  '代表作',
  '編成',
  '音楽性',
  '受賞歴',
  'ディスコグラフィー?',
  '楽曲一覧',
  'ヒット曲',
  '代表曲',
  // 健康・休止・復帰（「〇〇のリハビリ教えて」等）
  'リハビリ',
  'リハビリテーション',
  '怪我',
  '病気',
  '治療',
  '手術',
  '入院',
  '復活',
  '引退',
  '休止',
  '静養',
  '休養',
  '咽頭',
  '喉',
  '喉頭',
  '声帯',
  '発声',
  'ボイトレ',
  'ダンス',
  '振付',
  '振り付け',
  '振付け',
  // 編成・パート（長い表記を先に）
  'メインボーカル',
  'サブボーカル',
  'リードギター',
  'リズムギター',
  'ボーカリスト',
  'ギタリスト',
  'ベーシスト',
  'ドラマー',
  'フロントマン',
  'プロデューサー',
  'ボーカル',
  'ギター',
  'ベース',
  'ドラム',
  'ピアノ',
  '鍵盤',
  'キーボード',
  'サックス',
  'トランペット',
  'バイオリン',
  'コーラス',
  'ラップ',
  'パート',
  'リーダー',
  '作詞',
  '作曲',
  'ディージェイ',
  'DJ',
  // 英語表記（主題は日本語・英字混在のため i）
  String.raw`\bvocals?\b`,
  String.raw`\bvocalists?\b`,
  String.raw`\bguitars?\b`,
  String.raw`\bguitarists?\b`,
  String.raw`\bbassists?\b`,
  String.raw`\bdrummers?\b`,
  String.raw`\bkeyboards?\b`,
  String.raw`\bdrums?\b`,
  String.raw`\bfront\s*men\b`,
  String.raw`\bfrontman\b`,
].join('|');

const ARTIST_PROFILE_ASK_TAIL =
  '(?:教えて(?:ください)?|聞かせて(?:ください)?|知りたい|聞きたい)';

/** 「の現在は？」「の近況は？」など、動詞なしの短い近況質問 */
const ARTIST_STATUS_TOPIC =
  '(?:現在|近況|最近|その後|今)\\s*(?:は|どう|どうなって(?:いる)?)?';

export function parseOutlineTeachSubject(question: string): string | null {
  const q = question.trim().replace(/\r\n/g, '\n').normalize('NFKC');
  if (!q || q.includes('\n')) return null;

  const mVerb = q.match(
    new RegExp(
      `^([\\s\\S]{2,100}?)\\s*の\\s*(?:${ARTIST_PROFILE_TOPIC_NOUN})\\s*(?:を\\s*)?${ARTIST_PROFILE_ASK_TAIL}\\s*[?？]*\\s*$`,
      'iu'
    )
  );
  if (mVerb?.[1]) {
    const subject = mVerb[1].trim();
    if (subject.length >= 2) return subject;
  }

  const mStatus = q.match(
    new RegExp(
      `^([\\s\\S]{2,100}?)\\s*の\\s*${ARTIST_STATUS_TOPIC}\\s*[?？]*\\s*$`,
      'iu'
    )
  );
  if (mStatus?.[1]) {
    const subject2 = mStatus[1].trim();
    if (subject2.length >= 2) return subject2;
  }

  /** 「Fooは今、活動しているの？」「Barはまだ活躍中？」など */
  const mNowActive = q.match(
    new RegExp(
      String.raw`^([\s\S]{2,100}?)\s*は\s*(?:今[、,]?\s*|今も\s*|まだ\s*)(?:活動|活躍)(?:している|してる|してます|中)?(?:の)?\s*[?？!！]*\s*$`,
      'iu'
    )
  );
  if (mNowActive?.[1]) {
    const s3 = mNowActive[1].trim();
    if (s3.length >= 2) return s3;
  }

  /** 「〇〇のHung Upのダンスのスタイルは？」等（教えてなし・曲／MV に紐づくダンス） */
  const mDanceTopic = q.match(
    new RegExp(
      String.raw`^([\s\S]{2,120}?)\s*のダンス(?:のスタイル)?\s*(?:は|を)?\s*(?:どう|何)?\s*[?？!！]*\s*$`,
      'iu'
    )
  );
  if (mDanceTopic?.[1]) {
    const s4 = mDanceTopic[1].trim();
    if (s4.length >= 2) return s4;
  }

  return null;
}

export function isOutlineTeachMusicFollowupQuestion(
  question: string,
  recent: readonly AboutDetailRecentMessage[]
): boolean {
  const subject = parseOutlineTeachSubject(question);
  if (!subject) return false;
  if (isOffTopicAboutSubject(subject)) return false;
  if (!recentMessagesSuggestMusicRoomContext(recent)) return false;
  return true;
}

/**
 * 直前に AI 曲解説等があるときだけ: 「出身地です」「生まれは？」のような主語省略の短いフォロー。
 */
const SHORT_BIO_FOLLOWUP_RE = new RegExp(
  String.raw`^(?:出身地|出生地|出身|生まれ|誕生日|生年月日|年齢|何歳|いくつ|本名|兄弟|家族|家族構成|デビュー|いつデビュー|そのとき|続き|もっと詳しく|もう少し詳しく)(?:です|だ|は)?\s*[?？]*\s*$`,
  'iu'
);

export function isShortMusicBiographyFollowupQuestion(
  question: string,
  recent: readonly AboutDetailRecentMessage[]
): boolean {
  const q = question.trim().normalize('NFKC');
  if (!q || q.includes('\n')) return false;
  if (q.length > 48) return false;
  if (!recentMessagesSuggestMusicRoomContext(recent)) return false;
  if (/^(?:天気|株価|政治|投資|為替|ニュース|仕事|会社)/u.test(q)) return false;
  return SHORT_BIO_FOLLOWUP_RE.test(q);
}

/** 「について教えて」単体は通さない（経済記事等の誤爆防止） */
const FREE_STRONG_MUSIC_ANCHOR_RE = new RegExp(
  [
    '活動',
    '活躍',
    'アルバム',
    'シングル',
    'メンバー',
    'ボーカル',
    'ギター',
    'ベース',
    'ドラム',
    'ライブ',
    'ツアー',
    '歌詞',
    'デビュー',
    '解散',
    '再結成',
    '現在',
    '近況',
    '代表曲',
    'ヒット',
    'チャート',
    '概要',
    '詳細',
    '\\bMV\\b',
    'ミュージックビデオ',
    'フォーメーション',
    '編成',
    'カバー',
    'オリジナル',
    '\\bofficial\\b',
    '\\balbum\\b',
    '\\btour\\b',
    'リハビリ',
    'リハビリテーション',
    '怪我',
    '病気',
    '治療',
    '手術',
    '入院',
    '復活',
    '引退',
    '休止',
    '静養',
    '休養',
    '咽頭',
    '喉',
    '喉頭',
    '声帯',
    '発声',
    'ボイトレ',
    '闘病',
    '療養',
    'ダンス',
    '振付',
    '振り付け',
    '振付け',
    'choreo',
    'choreography',
    String.raw`\bdance\b`,
  ].join('|'),
  'iu'
);

const KATA_NAME_LIKE = /[\u30A1-\u30FF\uFF66-\uFF9Fー]{3,}/u;

const LATIN_NAME_LIKE = /\b[A-Za-z][A-Za-z0-9 .,'&-]{3,}\b/;

/**
 * アーティスト名を一覧に書かなくても、カタカナ連続 or 英字名と強い音楽語があれば通す。
 * 直近が洋楽文脈のときのみ（単独「について」等ではヒットしない）。
 */
export function isMusicLikelyKatakanaOrLatinWithStrongAnchors(
  question: string,
  recent: readonly AboutDetailRecentMessage[]
): boolean {
  if (!recentMessagesSuggestMusicRoomContext(recent)) return false;
  const t = question.trim().normalize('NFKC').replace(/\r\n/g, '\n');
  if (!t || t.includes('\n')) return false;
  const len = t.length;
  if (len < 6 || len > 160) return false;
  if (/(政治|株価|株式|投資信託|為替レート|天気予報|選挙|国会|予算案|円安|円高)/iu.test(t)) return false;
  if (!FREE_STRONG_MUSIC_ANCHOR_RE.test(t)) return false;
  return KATA_NAME_LIKE.test(t) || LATIN_NAME_LIKE.test(t);
}

/**
 * 「@」本文が曲検索（resolve-song-request）向きでなく、説明系の定型なら true。
 * クライアント・API で Gemini の曲意図抽出をスキップし /api/ai/chat に直行する。
 * @param recent 省略時は短いフォロー判定を行わない（後方互換）。
 */
export function shouldShortCircuitSongRequestForAtPrompt(
  message: string,
  recent?: readonly AboutDetailRecentMessage[]
): boolean {
  const q = message.trim();
  if (!q) return false;
  if (parseAboutDetailQuestionSubject(q) != null) return true;
  if (parseOutlineTeachSubject(q) != null) return true;
  if (recent && recent.length > 0 && isShortMusicBiographyFollowupQuestion(q, recent)) return true;
  if (recent && recent.length > 0 && isMusicLikelyKatakanaOrLatinWithStrongAnchors(q, recent)) return true;
  return false;
}

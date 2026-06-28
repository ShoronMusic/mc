/**
 * 「洋楽AIチャットの楽しみ方」ページ用の機能一覧。
 * 基本構成は docs/洋楽AIチャットの楽しみ方01.txt に準拠。
 */

export type GuideEnjoyFeatureBadge = 'beta' | 'login' | 'optional';

export type GuideEnjoyIllustration = {
  src: string;
  alt: string;
  width: number;
  height: number;
  caption?: string;
};

export type GuideEnjoyFeature = {
  title: string;
  description: string;
  /** 複数段落で表示する説明（指定時は description より優先） */
  descriptionParagraphs?: readonly string[];
  href?: string;
  hrefLabel?: string;
  badge?: GuideEnjoyFeatureBadge;
  image?: GuideEnjoyIllustration;
  /** 枠内を白背景にする（暗いページ上でイラストが見やすいカード用） */
  cardTone?: 'light';
};

export type GuideEnjoyCategory = {
  id: string;
  title: string;
  tabLabel?: string;
  lead: string;
  features: GuideEnjoyFeature[];
  /** 機能カードの列数（2 で縦2×横2など） */
  featureGridCols?: 1 | 2;
};

export type GuideEnjoyStep = {
  step: number;
  title: string;
  description: string;
  href?: string;
  hrefLabel?: string;
  imageSrc: string;
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
  /** 枠内を白背景にする（暗いページ上でイラストが見やすいカード用） */
  cardTone?: 'light';
};

export type GuideEnjoyUsageHighlight = {
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
  /** 枠内を白背景にする（暗いページ上でイラストが見やすいカード用） */
  cardTone?: 'light';
};

export const GUIDE_ENJOY_INTRO = {
  title: '洋楽AIチャットの楽しみ方',
  subtitle: 'Music AI Chat',
  lead:
    'YouTubeの洋楽を、チャットルームで同時に聴きながら交流できるサービスです。まずは3ステップで始められます。',
  note:
    '本サービスは β版のため、機能の追加・変更・一時停止がある場合があります。バッジはログインが必要な機能や試験提供中の機能を示します。',
};

/** リード直下の楽しみ方ハイライト（2パターン） */
export const GUIDE_ENJOY_USAGE_HIGHLIGHTS: readonly GuideEnjoyUsageHighlight[] = [
  {
    title: 'みんなでワイワイ',
    description:
      '友達や初対面の参加者と同じ部屋に入り、URL やライブラリで順番に選曲。曲解説をきっかけに感想を交わし、クイズやお題で盛り上がる。',
    imageSrc: '/images/point_illust_01r4.png',
    imageAlt: '複数の参加者が Music AI Chat でつながり、一緒に楽しむイラスト',
    imageWidth: 390,
    imageHeight: 221,
    cardTone: 'light',
  },
  {
    title: 'ひとりでじっくり',
    description:
      '自分で会を立てて一人入室。好きな曲を流し、AI 解説を読みながら @ で深掘り質問。お気に入りやマイリストに残して次回につなげる。',
    imageSrc: '/images/point_illust_02r3.png',
    imageAlt: 'ヘッドフォンをつけて一人で曲を聴き、タブレットで楽しむイラスト',
    imageWidth: 290,
    imageHeight: 214,
    cardTone: 'light',
  },
] as const;

/** 使い方は簡単！3ステップ */
export const GUIDE_ENJOY_THREE_STEPS: GuideEnjoyStep[] = [
  {
    step: 1,
    title: 'チャットルームを選んで入室',
    description:
      'トップページから開催中の部屋に入るか、ログインして自分で会を立ち上げます。ゲストでも参加できます。',
    imageSrc: '/images/point_illust_03_1r.png',
    imageAlt: 'チャットルームに入室するイラスト',
    imageWidth: 214,
    imageHeight: 168,
    cardTone: 'light',
  },
  {
    step: 2,
    title: '聴きたい曲を選曲',
    description:
      'YouTube の URL を発言欄に貼って送信するのが基本です。ライブラリから曲を選ぶ方法もあります。',
    imageSrc: '/images/point_illust_03_2r.png',
    imageAlt: 'YouTube URL を貼って選曲するイラスト',
    imageWidth: 224,
    imageHeight: 113,
    cardTone: 'light',
  },
  {
    step: 3,
    title: '曲の動画（PV 等）を視聴',
    description:
      '部屋の参加者みんなで同じタイミングに再生されます。視聴しながらチャットで感想を伝え合えます。',
    imageSrc: '/images/point_illust_03_3r.png',
    imageAlt: 'みんなで同時に動画を視聴するイラスト',
    imageWidth: 209,
    imageHeight: 166,
    cardTone: 'light',
  },
];

/** 3ステップの直後：選曲の基本操作と楽しみ方 */
export type GuideEnjoySelectionMethod = {
  step: number;
  title: string;
  /** タブボタン用の短いラベル */
  tabLabel: string;
  description: string;
  /** 複数段落で表示する説明（指定時は description より優先） */
  descriptionParagraphs?: readonly string[];
  href?: string;
  hrefLabel?: string;
  badge?: GuideEnjoyFeatureBadge;
  images?: readonly GuideEnjoyIllustration[];
  /** 枠内を白背景にする（暗いページ上でイラストが見やすいカード用） */
  cardTone?: 'light';
};

export const GUIDE_ENJOY_SONG_SELECTION = {
  title: '選曲方法',
  lead:
    '順番に曲を流していく——みんなで回す DJ ブースを再現できるのが、洋楽AIチャットの大きな魅力です。次の3つが選曲の基本。ほかにも、番が回るまでの準備や、流れを意識した楽しみ方があります。',
  methods: [
    {
      step: 1,
      tabLabel: 'YouTube URL',
      title: 'YouTube で URL をコピーしてスタンバイ',
      description:
        'PC版YouTubeではアドレス欄のURLをコピー、または共有ボタン→コピー。スマホYouTubeアプリでは共有ボタン→コピーで曲のURLをコピーできます。自分の番になったら発言欄に貼って送信するのが基本です。',
      descriptionParagraphs: [
        'PC版YouTubeではアドレス欄のURLをコピー、または共有ボタン→コピー。',
        'スマホYouTubeアプリでは共有ボタン→コピーで曲のURLをコピーできます。',
        '自分の番になったら発言欄に貼って送信するのが基本です。',
      ],
      href: '/guide/first-song',
      hrefLabel: '選曲のしかた（PC）',
      cardTone: 'light',
      images: [
        {
          src: '/images/point_illust_04_1r.png',
          alt: 'YouTube で URL をコピーして選曲するイラスト',
          width: 352,
          height: 272,
          caption: 'PC版YouTube',
        },
        {
          src: '/images/point_illust_04_2r.png',
          alt: '発言欄に URL を貼って送信するイラスト',
          width: 160,
          height: 272,
          caption: 'スマホYouTubeアプリ',
        },
      ],
    },
    {
      step: 2,
      tabLabel: 'ライブラリ',
      title: 'ライブラリから「選曲」ボタンで一発選曲',
      description:
        'チャット画面の右下の「ライブラリ」ボタンをクリックでライブラリが開きます。A 検索欄にキーワードを入れるか、B A–Z 索引で頭文字を選んで探します。C アーティスト一覧→D アーティスト詳細→E 曲一覧→F 曲詳細の順に進み、F の「この曲を選曲」で部屋に流せます。YouTube を行き来せず、アプリ内で完結します。',
      descriptionParagraphs: [
        'チャット画面の右下の「ライブラリ」ボタンをクリックでライブラリが開きます。',
        'A 検索欄にアーティスト名・曲名を入れるか、B A–Z 索引から頭文字を選んで探します。',
        'C アーティスト一覧でアーティストを選ぶと、D アーティスト詳細が表示されます。',
        'E 曲一覧で曲を選ぶと、F 曲詳細にプレビュー動画と曲情報が出ます。',
        'F の「この曲を選曲」を押すと、部屋にそのまま流せます。YouTube を行き来せず、アプリ内で完結します。',
      ],
      cardTone: 'light',
      images: [
        {
          src: '/images/point_illust_04_3r.png',
          alt: 'ライブラリから選曲ボタンで曲を選ぶイラスト',
          width: 163,
          height: 252,
        },
      ],
    },
    {
      step: 3,
      tabLabel: 'マイリスト',
      title: 'マイリスト・お気に入りに候補曲をストック',
      description:
        'マイページのマイリストやお気に入りに、あらかじめ次に流したい曲を登録しておけます。チャット画面のマイページボタンをクリックでマイページが開きます。マイリストから曲を選び「再生」→「この曲を選曲」を押す。または一覧の「選曲」を押すと、部屋にそのまま流せます。YouTube を行き来せず、アプリ内で完結します。',
      descriptionParagraphs: [
        'マイページのマイリストやお気に入りに、あらかじめ次に流したい曲を登録しておけます。',
        'チャット画面のマイページボタンをクリックでマイページが開きます。',
        'マイリストから曲を選び「再生」→「この曲を選曲」を押す。または一覧の「選曲」を押しても選べます。',
        '部屋にそのまま流せます。YouTube を行き来せず、アプリ内で完結します。',
      ],
      badge: 'login',
      cardTone: 'light',
      images: [
        {
          src: '/images/point_illust_04_4r.png',
          alt: 'マイリストやお気に入りに曲をストックするイラスト',
          width: 403,
          height: 252,
        },
      ],
    },
  ] satisfies GuideEnjoySelectionMethod[],
  basics: [
    {
      title: '自分の選曲が終わってから、次の番までに次曲をセット',
      description:
        '順番制のため、流れている曲を聴きながら次の一曲を決めておけます。候補リストに次曲を溜めておく方法も使えます。自分の番が来る前に選曲すると「予約済み」と表示されます。',
      cardTone: 'light',
      image: {
        src: '/images/point_illust_05_1r.png',
        alt: '次の番までに次曲をセットするイラスト',
        width: 328,
        height: 58,
      },
    },
    {
      title: '選曲者と部屋オーナーは、再生中の曲をスキップできる',
      description:
        '自分が選んだ曲の再生中は、スキップで次の曲へ進められます。部屋オーナーも、必要に応じて再生中の曲をスキップできます。長尺のライブ映像など、途中で次に進めたいときに使います。',
      cardTone: 'light',
      image: {
        src: '/images/point_illust_05_2r.png',
        alt: '再生中の曲をスキップするイラスト',
        width: 323,
        height: 58,
      },
    },
  ] satisfies GuideEnjoyFeature[],
  charmText:
    '他の参加者の選曲にインスパイアされることも多く、部屋の流れを意識した選曲を楽しむのも醍醐味です。次の自分の番までに曲を探す緊張感とワクワク感も、音楽チャットならではの魅力のひとつ。お題プレイリスト・ミッションがあるときは、テーマに合う曲を予習して用意しておくのも、事前の楽しみ方のひとつです。',
  charmImage: {
    src: '/images/point_illust_06_1r.png',
    alt: '部屋の流れを意識した選曲を楽しむイラスト',
    width: 647,
    height: 360,
  },
};

/** タブより上に常時表示するセクション（txt の「チャットルームならでは」「マルチデバイス」） */
export const GUIDE_ENJOY_CORE_SECTIONS: GuideEnjoyCategory[] = [
  {
    id: 'room-unique',
    title: 'チャットルームならでは楽しみ方',
    lead: '同時視聴とチャットが一体になっているのが、このサービスのいちばんの特徴です。',
    featureGridCols: 2,
    features: [
      {
        title: '選曲は順番制で、再生中は参加者同時視聴',
        description:
          '流れている曲は全員が同じタイミングで聴きます。次の曲は順番に選んでいく使い方が基本です。',
        cardTone: 'light',
        image: {
          src: '/images/point_illust_07_1r.png',
          alt: '順番制で参加者全員が同時に視聴するイラスト',
          width: 247,
          height: 250,
        },
      },
      {
        title: '視聴しながらテキスト入力で会話',
        description:
          '再生中の曲への感想や雑談を、その場でやり取りできます。',
        cardTone: 'light',
        image: {
          src: '/images/point_illust_07_2r.png',
          alt: '視聴しながらテキスト入力で会話するイラスト',
          width: 305,
          height: 250,
        },
      },
      {
        title: '趣向や年代の異なるユーザーとの出会い',
        description:
          '参加者それぞれの選曲が会話のきっかけになり、普段触れないジャンルや年代の洋楽にも自然に出会えます。',
      },
      {
        title: '選曲せず、視聴と会話だけの参加も可能',
        description:
          '聴き専で様子を見たり、感想だけ書いたりする入り方もできます。慣れてから選曲に参加しても大丈夫です。',
      },
    ],
  },
  {
    id: 'device-auth',
    title: 'マルチデバイスとユーザー登録',
    lead: '使う端末やログインのしかたを選べます。',
    features: [
      {
        title: 'PC・タブレット・スマホで利用可能',
        description:
          'ブラウザから利用できます。スマホでは YouTube の共有から URL をコピーして選曲する流れも用意しています。',
        href: '/guide/first-song-mobile',
        hrefLabel: 'スマホでの選曲',
        cardTone: 'light',
        image: {
          src: '/images/point_illust_10r.png',
          alt: 'PC・タブレット・スマホで利用できるイラスト',
          width: 301,
          height: 150,
        },
      },
      {
        title: 'メールアドレス、または Google 認証でユーザー登録',
        description:
          '登録するとお気に入り・選曲履歴・マイリストなどが残り、次回以降も引き継げます。',
        badge: 'login',
        cardTone: 'light',
        image: {
          src: '/images/point_illust_11r.png',
          alt: 'メールまたは Google でユーザー登録するイラスト',
          width: 403,
          height: 200,
        },
      },
      {
        title: 'ユーザー登録しないでゲスト参加も可能',
        description:
          'ログインしなくても部屋に入ってチャット・視聴できます。',
        badge: 'optional',
        cardTone: 'light',
        image: {
          src: '/images/point_illust_12r.png',
          alt: 'ゲスト参加で部屋に入るイラスト（ハンドルネーム入力）',
          width: 194,
          height: 100,
        },
      },
    ],
  },
];

/** 「もっと楽しむ」タブの直前：2種類のオリジナル AI の役割概要 */
export type GuideEnjoyOriginalAiRole = {
  id: string;
  title: string;
  tagline: string;
  description: string;
  relatedTabId: GuideEnjoyCategory['id'];
  badge?: GuideEnjoyFeatureBadge;
};

export const GUIDE_ENJOY_ORIGINAL_AIS = {
  title: '2つのオリジナル AI がサポート',
  lead:
    '洋楽AIチャットには、役割の異なる2種類のオリジナル AI があります。どちらも部屋の体験を豊かにします。',
  roles: [
    {
      id: 'ai-curator',
      title: 'AI キュレーター',
      tagline: '選曲の進行をナビゲートし、解説・質問・おススメ曲を提案する AI',
      description:
        'システム側の AI が、選曲の順番や進行を案内します。曲が流れるたびに短い曲解説を出し、@ 付きの質問に答え、次に聴く候補（おススメ曲）を提案することもあります。場の流れをつくる「司会・解説役」です。',
      relatedTabId: 'ai-support',
    },
    {
      id: 'ai-agent',
      title: 'AI エージェント',
      tagline: 'ユーザーと同じ立場で選曲に参加し、会話で場を盛り上げる AI',
      description:
        '人間の参加者と同じように、順番が回ってきたら曲を選ぶこともあります。会話に合いの手を入れたり、参加者が少ないときの相棒として、部屋の空気をやわらげます。キャラクター性のある「一緒に楽しむ仲間」です。',
      relatedTabId: 'ai-agent',
      badge: 'beta',
    },
  ] satisfies GuideEnjoyOriginalAiRole[],
} as const;

/** txt の後半セクション（タブ切り替え） */
export const GUIDE_ENJOY_TAB_CATEGORIES: GuideEnjoyCategory[] = [
  {
    id: 'ai-support',
    title: 'AI キュレーター（便利な AI サポート）',
    tabLabel: 'AI',
    lead: '選曲の進行ナビ、曲解説、@ 質問、おススメ曲提案など、AI キュレーターがサポートします。',
    features: [
      {
        title: '選曲の順番は AI が先導',
        description:
          '曲が切り替わるたびに AI が進行を補助し、場が止まりにくい流れをつくります。候補リストで次の曲を溜めておくこともできます。',
      },
      {
        title: '曲の解説を AI が短いコメントで紹介',
        description:
          '選曲後に背景や聴きどころを短く紹介します。会話のきっかけや、知らない曲との出会いに役立ちます。',
        href: '/guide/ai',
        hrefLabel: 'AI について',
      },
      {
        title: '発言の先頭に @ を付けると AI に質問できる',
        description:
          '洋楽に関する質問に AI が答えます。おすすめの曲やアーティストのことなど、音楽の話題を広げられます。',
        href: '/guide/ai',
        hrefLabel: '質問のしかた',
      },
      {
        title: 'いま流れた曲をもとに、次に聴く候補を AI が提案',
        description:
          '曲の流れに合わせて、次に聴く候補を AI が提案します。ひとりで新しい曲を開拓したいときにも向いています。',
        badge: 'beta',
      },
    ],
  },
  {
    id: 'ai-agent',
    title: 'AI エージェント（愉快な参加型 AI）',
    tabLabel: 'エージェント',
    lead: 'ユーザーと同じ立場で選曲に参加し、会話に入って場を盛り上げる AI エージェントです。',
    features: [
      {
        title: 'ユーザーに交じり AI エージェントも選曲参加',
        description:
          '会の流れに合わせて、AI エージェントが次の曲候補を提案することがあります。',
        badge: 'beta',
      },
      {
        title: '時々ユーザーの会話に AI エージェントも入る',
        description:
          '会話の合いの手や補足として、AI エージェントが発言することがあります。',
        badge: 'beta',
      },
      {
        title: 'ユーザーが一人のときに相棒として楽しめる',
        description:
          '参加者が少ない部屋でも、AI エージェントがいると一人で聴く時間が味わいやすくなります。',
        badge: 'beta',
      },
    ],
  },
  {
    id: 'while-watching',
    title: '曲を視聴しながら楽しめる機能',
    tabLabel: '視聴中',
    lead: '聴いている最中や直後に、クイズや曲情報を楽しめます。',
    features: [
      {
        title: '曲解説のあと、同じ曲の文脈で三択クイズが出題',
        description:
          '条件を満たす曲では、曲解説のあと三択クイズが出ることがあります。みんなで答えて正解発表を待つ参加型の楽しみ方です。',
        badge: 'beta',
      },
      {
        title: '曲とアーティストの基本情報を表示',
        description:
          '再生中の曲やライブラリから、アーティスト・曲名・年代・スタイルなどの情報を参照できます。',
      },
      {
        title: '視聴履歴と年代・スタイル分布で選曲の流れが分かる',
        description:
          '途中参加でも、部屋の視聴履歴や分布表示からこれまでの流れを把握しやすくなります。',
      },
    ],
  },
  {
    id: 'collaborative',
    title: 'ユーザー同士で共同作業',
    tabLabel: '共同',
    lead: 'テーマに沿って、みんなでプレイリストを育てる楽しみ方です。',
    features: [
      {
        title: 'お題（クリスマス等）プレイリスト・ミッション',
        description:
          'マイページでお題を選び、曲を登録していくミッションです。部屋で「お題曲送信」すると、お題向けの AI 講評も出ます。',
        badge: 'beta',
      },
    ],
  },
  {
    id: 'library',
    title: '豊富な曲ライブラリ',
    tabLabel: 'ライブラリ',
    lead: '洋楽の曲データベースを、部屋内からそのまま探して選曲できます。',
    features: [
      {
        title: 'キーワードで曲やアーティストを検索',
        description:
          'ライブラリの検索欄から、登録済みの曲やアーティストを探せます。',
      },
      {
        title: 'アーティスト別の曲一覧から選べる',
        description:
          'アルファベット索引（A–Z）でアーティストを選び、曲一覧から次の一曲を決められます。',
      },
      {
        title: '選んだ曲をそのまま再生して選曲できる',
        description:
          '一覧から曲を選ぶと、部屋の同期再生がその曲に切り替わります。YouTube を行き来せず、アプリ内で完結します。',
      },
    ],
  },
  {
    id: 'mypage',
    title: '自分用に記録できるマイページ',
    tabLabel: 'マイページ',
    lead: 'ログインすると、聴いた曲や好みを自分用に残せます。',
    features: [
      {
        title: '選曲した曲の履歴保存',
        description: '部屋で貼った・流した曲の記録を、あとから振り返れます。',
        badge: 'login',
      },
      {
        title: 'お気に入りやマイリストへの曲登録',
        description:
          '気に入った曲をお気に入りやマイリストに保存し、整理・書き出しができます。',
        badge: 'login',
      },
      {
        title: '公開プロフィールで自己紹介',
        description: '一言コメントや好きなアーティストなどを登録できます。',
        badge: 'login',
      },
    ],
  },
  {
    id: 'owner',
    title: 'その他オーナー機能',
    tabLabel: 'オーナー',
    lead: '部屋の主催者・オーナー向けの運営機能です。',
    features: [
      {
        title: '主催部屋の名前・PR 文の掲載',
        description:
          '部屋のタイトルや一言紹介を設定できます。トップの開催一覧にも反映されます。',
        badge: 'login',
      },
      {
        title: '部屋に鍵をかけて新規参加を制限',
        description:
          '開催中の会で新規参加を締め切る設定ができます。常連だけで続けたいときなどに使えます。',
        badge: 'login',
      },
      {
        title: '迷惑ユーザーの強制退出',
        description:
          'チャットオーナーは、マナー違反などの参加者を部屋から退出させることができます。',
        badge: 'login',
      },
      {
        title: '登録ユーザーは一人 2 部屋まで開催可能',
        description:
          '同時に主催できる会は、1 アカウントあたり最大 2 部屋までです。',
        href: '/guide/service',
        hrefLabel: '主催の上限など',
        badge: 'login',
      },
    ],
  },
];

export const GUIDE_ENJOY_BADGE_LABELS: Record<GuideEnjoyFeatureBadge, string> = {
  beta: 'β版',
  login: 'ログイン',
  optional: '任意',
};

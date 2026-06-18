/**
 * 「洋楽AIチャットの楽しみ方」ページ用の機能一覧。
 * 基本構成は docs/洋楽AIチャットの楽しみ方01.txt に準拠。
 */

export type GuideEnjoyFeatureBadge = 'beta' | 'login' | 'optional';

export type GuideEnjoyFeature = {
  title: string;
  description: string;
  href?: string;
  hrefLabel?: string;
  badge?: GuideEnjoyFeatureBadge;
};

export type GuideEnjoyCategory = {
  id: string;
  title: string;
  tabLabel?: string;
  lead: string;
  features: GuideEnjoyFeature[];
};

export type GuideEnjoyStep = {
  step: number;
  title: string;
  description: string;
  href?: string;
  hrefLabel?: string;
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
export const GUIDE_ENJOY_USAGE_HIGHLIGHTS = [
  {
    title: 'みんなでワイワイ',
    description:
      '友達や初対面の参加者と同じ部屋に入り、URL やライブラリで順番に選曲。曲解説をきっかけに感想を交わし、クイズやお題で盛り上がる。',
  },
  {
    title: 'ひとりでじっくり',
    description:
      '自分で会を立てて一人入室。好きな曲を流し、AI 解説を読みながら @ で深掘り質問。お気に入りやマイリストに残して次回につなげる。',
  },
] as const;

/** 使い方は簡単！3ステップ */
export const GUIDE_ENJOY_THREE_STEPS: GuideEnjoyStep[] = [
  {
    step: 1,
    title: 'チャットルームを選んで入室',
    description:
      'トップページから開催中の部屋に入るか、ログインして自分で会を立ち上げます。ゲストでも参加できます。',
  },
  {
    step: 2,
    title: '聴きたい曲を選曲',
    description:
      'YouTube の URL を発言欄に貼って送信するのが基本です。ライブラリから曲を選ぶ方法もあります。',
    href: '/guide/first-song',
    hrefLabel: '選曲のしかた',
  },
  {
    step: 3,
    title: '曲の動画（PV 等）を視聴',
    description:
      '部屋の参加者みんなで同じタイミングに再生されます。視聴しながらチャットで感想を伝え合えます。',
  },
];

/** タブより上に常時表示するセクション（txt の「チャットルームならでは」「マルチデバイス」） */
export const GUIDE_ENJOY_CORE_SECTIONS: GuideEnjoyCategory[] = [
  {
    id: 'room-unique',
    title: 'チャットルームならでは楽しみ方',
    lead: '同時視聴とチャットが一体になっているのが、このサービスのいちばんの特徴です。',
    features: [
      {
        title: '選曲は順番制で、再生中は参加者同時視聴',
        description:
          '流れている曲は全員が同じタイミングで聴きます。次の曲は順番に選んでいく使い方が基本です。',
      },
      {
        title: '視聴しながらテキスト入力で会話',
        description:
          '再生中の曲への感想や雑談を、その場でやり取りできます。',
        href: '/guide/chat',
        hrefLabel: 'チャットのマナー',
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
      },
      {
        title: 'メールアドレス、または Google 認証でユーザー登録',
        description:
          '登録するとお気に入り・選曲履歴・マイリストなどが残り、次回以降も引き継げます。',
        badge: 'login',
      },
      {
        title: 'ユーザー登録しないでゲスト参加も可能',
        description:
          'ログインしなくても部屋に入ってチャット・視聴できます。',
        badge: 'optional',
      },
    ],
  },
];

/** txt の後半セクション（タブ切り替え） */
export const GUIDE_ENJOY_TAB_CATEGORIES: GuideEnjoyCategory[] = [
  {
    id: 'ai-support',
    title: '便利な AI サポート機能',
    tabLabel: 'AI',
    lead: '選曲の進行や解説、質問対応を AI がサポートします。',
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
    ],
  },
  {
    id: 'ai-agent',
    title: '愉快な AI エージェントも参加',
    tabLabel: 'エージェント',
    lead: '人間の参加者に加え、キャラクター性のある AI エージェントも部屋に加わることがあります。',
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
    lead: '聴いている最中や直後に、クイズやおすすめ、曲情報を楽しめます。',
    features: [
      {
        title: '曲解説のあと、同じ曲の文脈で三択クイズが出題',
        description:
          '条件を満たす曲では、曲解説のあと三択クイズが出ることがあります。みんなで答えて正解発表を待つ参加型の楽しみ方です。',
        badge: 'beta',
      },
      {
        title: 'いま流れた曲をもとに、次に聴く候補を AI が提案',
        description:
          '曲の流れに合わせて、次に聴く候補を AI が提案します。ひとりで新しい曲を開拓したいときにも向いています。',
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

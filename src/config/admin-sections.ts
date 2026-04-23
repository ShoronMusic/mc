/**
 * 管理画面のメニュー定義（ダッシュボード・共通ナビで共有）
 */
export type AdminSection = {
  href: string;
  title: string;
  description: string;
  /** このパスで始まるときも「現在地」として強調（曲詳細など子ルート用） */
  activePathPrefix?: string;
};

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    href: '/admin/gemini-usage',
    title: 'Gemini 利用ログ',
    description: 'API 呼び出し回数・トークン消費の集計と、直近の呼び出し明細',
  },
  {
    href: '/admin/youtube-api-usage',
    title: 'YouTube API 利用ログ',
    description: 'search.list / videos.list の呼び出し回数・成功失敗・source別集計',
  },
  {
    href: '/admin/ai-comment-origin',
    title: 'AI NEW / DB 分析',
    description:
      'チャット保存ログ上の [NEW]/[DB] 発言数と DB 比率。曲解説・comment-pack の Gemini API 回数・トークン（経費の目安）',
  },
  {
    href: '/admin/ai-commentary-unavailable',
    title: 'AI 曲解説不可リスト',
    description:
      '参照データ不足で曲紹介のみとなった選曲の記録（日時・アーティスト・タイトル・URL）。対応済み ON/OFF',
  },
  {
    href: '/admin/site-feedback',
    title: 'サイトご意見',
    description: '部屋画面から送信されたサイト評価（-2〜2）と自由コメントの一覧',
  },
  {
    href: '/admin/monetization-simulation',
    title: '収支シミュレーション（案）',
    description:
      'シナリオA・月1,000円・300曲上限の諸条件と5〜10月の想定表（docs/monetization-options.md と同一前提）',
  },
  {
    href: '/admin/next-song-recommendations',
    title: 'おすすめ曲ストック',
    description:
      '次に聴くなら（試験）の当該曲ごとのストック（最大9件）、理由、評価件数、削除操作',
  },
  {
    href: '/admin/artist-title-parse-reports',
    title: '曲名表記スナップショット',
    description:
      'STYLE_ADMIN がチャットから保存した YouTube メタ＋アーティスト／曲名解析結果（スワップ検証用）',
  },
  {
    href: '/admin/ai-question-guard-objections',
    title: 'AI質問ガード異議',
    description:
      '「@」質問の音楽関連チェック警告に対する異議申立て一覧（会話スナップショット・理由・運営メモ）',
  },
  {
    href: '/admin/ai-chat-tuning-reports',
    title: 'AIチャットチューニング報告',
    description:
      'AI_TIDBIT_MODERATOR がチャットから送った会話スナップショット・メモ（プロンプト調整用）',
  },
  {
    href: '/admin/room-chat-log',
    title: '部屋の会話ログ',
    description:
      '日付（JST）×部屋別の保存件数、テキスト・DL・＠Q&A（@と直後のAIをペア表示、異議付記）へのリンク',
  },
  {
    href: '/admin/room-access-log',
    title: '部屋入室アクセス',
    description:
      '日付（JST）×部屋別の入室数（ゲスト・会員内訳）。部屋を開いた記録（発言なしも可）の集計と明細',
    activePathPrefix: '/admin/room-access-log',
  },
  {
    href: '/admin/room-music-summary',
    title: '部屋音楽サマリー',
    description: '直近1〜2時間の再生履歴＋会話傾向を集計してDB保存し、管理画面で確認',
  },
  {
    href: '/admin/room-daily-summary',
    title: '部屋日次サマリー',
    description: '日付×部屋単位で利用時間・参加者・選曲数・時代/スタイル分布・Gemini使用量を保存',
  },
  {
    href: '/admin/room-playback-global-summary',
    title: '選曲全集計（横断）',
    description: '日別/月別/年別・アーティスト別選曲数・時代/スタイル分布・人気曲を部屋横断で集計',
  },
  {
    href: '/admin/theme-playlist-completed',
    title: 'お題実施一覧（完了）',
    description: '完了したお題ミッションの日時・部屋名・オーナー・参加者・曲（選曲者）を確認',
  },
  {
    href: '/admin/songs',
    title: '曲ダッシュボード',
    description: '曲の検索、詳細ページ（動画・コメント・豆知識・フィードバック）',
    activePathPrefix: '/admin/songs',
  },
];

export function isAdminSectionActive(pathname: string, section: AdminSection): boolean {
  if (pathname === section.href) return true;
  if (section.activePathPrefix && pathname.startsWith(section.activePathPrefix)) return true;
  return false;
}

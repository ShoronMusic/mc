/**
 * 管理画面のメニュー定義（ダッシュボード・共通ナビで共有）
 */

export type AdminCategoryId = 'billing' | 'ai' | 'room' | 'library' | 'other';

export type AdminCategory = {
  id: AdminCategoryId;
  label: string;
  description: string;
};

export const ADMIN_CATEGORIES: readonly AdminCategory[] = [
  {
    id: 'billing',
    label: '課金・原価',
    description: 'Gemini / YouTube API の利用量・課金帰属・収支試算',
  },
  {
    id: 'ai',
    label: 'AI 運用',
    description: 'AI 品質・チューニング・実験機能のログと分析',
  },
  {
    id: 'room',
    label: '部屋・開催',
    description: 'チャット・入室・サマリー・お題など部屋単位の履歴',
  },
  {
    id: 'library',
    label: '曲・DB',
    description: '曲マスタ・選曲登録・Music8 / Spotify 連携',
  },
  {
    id: 'other',
    label: 'その他',
    description: 'サイトフィードバックなど',
  },
] as const;

export type AdminSection = {
  href: string;
  title: string;
  description: string;
  category: AdminCategoryId;
  /** このパスで始まるときも「現在地」として強調（曲詳細など子ルート用） */
  activePathPrefix?: string;
};

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    href: '/admin/gemini-usage',
    title: 'Gemini 利用ログ',
    description: 'API 呼び出し回数・トークン消費の集計と、直近の呼び出し明細',
    category: 'billing',
  },
  {
    href: '/admin/user-billing-usage',
    title: 'ユーザー別 AI 利用（課金帰属）',
    description:
      'billing_user_id ベースの Gemini・選曲・YouTube API（主催部屋）集計。期間横断・スロット内訳',
    category: 'billing',
  },
  {
    href: '/admin/room-cost-summary',
    title: '部屋原価サマリー',
    description:
      '部屋・主催者別の Gemini 試算・YouTube API・選曲。YouTube は room_gatherings 主催者に帰属',
    category: 'billing',
  },
  {
    href: '/admin/gathering-history',
    title: '開催履歴（12h スロット）',
    description:
      '部屋 × 06–18 / 18–06 スロットの選曲・Gemini 原価試算・参加者別内訳。会終了不要',
    category: 'billing',
  },
  {
    href: '/admin/youtube-api-usage',
    title: 'YouTube API 利用ログ',
    description: 'search.list / videos.list の呼び出し回数・成功失敗・source別集計',
    category: 'billing',
  },
  {
    href: '/admin/monetization-simulation',
    title: '収支シミュレーション（案）',
    description:
      'Vercel Pro 移行後の固定費ティア・料金候補・改訂シナリオA\'。お試し10曲は docs/00-ai-trial-and-billing-implementation.md',
    category: 'billing',
  },
  {
    href: '/admin/ai-engine-phase-readiness',
    title: 'AIエンジン段階判定',
    description:
      'フェーズ1のKPI観測値・Go/No-Go判定と、フェーズ3（独自LLM）開始判定をまとめて確認',
    category: 'ai',
  },
  {
    href: '/admin/ai-comment-origin',
    title: 'AI NEW / DB 分析',
    description:
      'チャット保存ログ上の [NEW]/[DB] 発言数と DB 比率。曲解説・comment-pack の Gemini API 回数・トークン（経費の目安）',
    category: 'ai',
  },
  {
    href: '/admin/ai-commentary-unavailable',
    title: 'AI 曲解説不可リスト',
    description:
      '参照データ不足で曲紹介のみとなった選曲の記録（日時・アーティスト・タイトル・URL）。対応済み ON/OFF',
    category: 'ai',
  },
  {
    href: '/admin/ai-character-song-picks',
    title: 'AIキャラ選曲ログ',
    description:
      'AIキャラの参加日時・部屋名・選曲（アーティスト/タイトル）・投入コメントの保存と集計',
    category: 'ai',
  },
  {
    href: '/admin/next-song-recommendations',
    title: 'おすすめ曲ストック',
    description:
      '次に聴くなら（試験）の当該曲ごとのストック（最大9件）、理由、評価件数、削除操作',
    category: 'ai',
  },
  {
    href: '/admin/artist-title-parse-reports',
    title: '曲名表記スナップショット',
    description:
      'STYLE_ADMIN がチャットから保存した YouTube メタ＋アーティスト／曲名解析結果（スワップ検証用）',
    category: 'ai',
  },
  {
    href: '/admin/ai-question-guard-objections',
    title: 'AI質問ガード異議',
    description:
      '「@」質問の音楽関連チェック警告に対する異議申立て一覧（会話スナップショット・理由・運営メモ）',
    category: 'ai',
  },
  {
    href: '/admin/ai-chat-tuning-reports',
    title: 'AIチャットチューニング報告',
    description:
      'AI_TIDBIT_MODERATOR がチャットから送った会話スナップショット・メモ（プロンプト調整用）',
    category: 'ai',
  },
  {
    href: '/admin/room-chat-log',
    title: '部屋の会話ログ',
    description:
      '日付（JST）×部屋別の保存件数、テキスト・DL・＠Q&A（@と直後のAIをペア表示、異議付記）へのリンク',
    category: 'room',
  },
  {
    href: '/admin/room-access-log',
    title: '部屋入室アクセス',
    description:
      '日付（JST）×部屋別の入室数（ゲスト・会員内訳）。部屋を開いた記録（発言なしも可）の集計と明細',
    category: 'room',
    activePathPrefix: '/admin/room-access-log',
  },
  {
    href: '/admin/room-music-summary',
    title: '部屋音楽サマリー',
    description: '直近1〜2時間の再生履歴＋会話傾向を集計してDB保存し、管理画面で確認',
    category: 'room',
  },
  {
    href: '/admin/room-daily-summary',
    title: '部屋日次サマリー',
    description: '日付×部屋単位で利用時間・参加者・選曲数・時代/スタイル分布・Gemini使用量を保存',
    category: 'room',
  },
  {
    href: '/admin/room-playback-global-summary',
    title: '選曲全集計（横断）',
    description: '日別/月別/年別・アーティスト別選曲数・時代/スタイル分布・人気曲を部屋横断で集計',
    category: 'room',
  },
  {
    href: '/admin/theme-playlist-completed',
    title: 'お題実施一覧（完了）',
    description: '完了したお題ミッションの日時・部屋名・オーナー・参加者・曲（選曲者）を確認',
    category: 'room',
  },
  {
    href: '/admin/library',
    title: 'ライブラリ',
    description:
      '曲マスタをアーティスト索引・検索で参照。公開年・スタイル・再生数・YouTube リンク・詳細（DB）',
    category: 'library',
    activePathPrefix: '/admin/library/',
  },
  {
    href: '/admin/library-music8-pending',
    title: 'Music8未連携選曲',
    description:
      '視聴履歴ベースで、DB に曲があっても Music8 スナップショット未取得の video を JST 日別に一覧（手動登録のたたき台）',
    category: 'library',
  },
  {
    href: '/admin/youtube-playlist-import',
    title: 'YouTubeプレイリスト取込',
    description:
      'YouTube playlist URL から artist/title/videoId を抽出し、既存 videoId を除外して曲マスタへ取り込み。結果を全件表示',
    category: 'library',
  },
  {
    href: '/admin/songs-newly-registered',
    title: '選曲・DB登録（日別）',
    description:
      'room_playback_history を JST 日別に一覧。新規 insert と既存曲の再選曲を区別（部屋名・選曲者付き）',
    category: 'library',
  },
  {
    href: '/admin/artists-newly-registered',
    title: '選曲登録アーティスト（日別）',
    description: '選曲で新規 insert された artists（m8 未照会）。slug で WP JSON 照会用',
    category: 'library',
  },
  {
    href: '/admin/spotify-review-queue',
    title: 'Spotify 要確認（日別）',
    description: '選曲時 Spotify 自動照合で確定できなかった曲（候補 track ID 付き）',
    category: 'library',
  },
  {
    href: '/admin/songs',
    title: '曲ダッシュボード',
    description: '曲の検索、詳細ページ（動画・コメント・豆知識・フィードバック）',
    category: 'library',
    activePathPrefix: '/admin/songs',
  },
  {
    href: '/admin/song-lookup',
    title: '曲引き',
    description:
      'アーティスト・タイトル・URL・DB解説・選曲履歴（部屋名・選曲者）・song_quiz_logs のクイズ一式・おすすめ（バッチ最大3）・@Q&A を日付順で TEXT 可',
    category: 'library',
  },
  {
    href: '/admin/song-quiz-logs',
    title: 'クイズログ',
    description: '曲解説に紐づく song_quiz_logs を確認（質問・三択・正解・解説）。曲引き画面へ遷移',
    category: 'library',
  },
  {
    href: '/admin/site-feedback',
    title: 'サイトご意見',
    description: '部屋画面から送信されたサイト評価（-2〜2）と自由コメントの一覧',
    category: 'other',
  },
];

export function isAdminSectionActive(pathname: string, section: AdminSection): boolean {
  if (pathname === section.href) return true;
  if (section.activePathPrefix && pathname.startsWith(section.activePathPrefix)) return true;
  return false;
}

export function getAdminCategoryMeta(id: AdminCategoryId): AdminCategory {
  return ADMIN_CATEGORIES.find((c) => c.id === id) ?? ADMIN_CATEGORIES[0];
}

export function getAdminSectionsByCategory(category: AdminCategoryId): AdminSection[] {
  return ADMIN_SECTIONS.filter((s) => s.category === category);
}

export function getAdminCategoryForPathname(pathname: string): AdminCategoryId {
  for (const section of ADMIN_SECTIONS) {
    if (isAdminSectionActive(pathname, section)) return section.category;
  }
  return 'billing';
}

export function isAdminCategoryId(value: string): value is AdminCategoryId {
  return ADMIN_CATEGORIES.some((c) => c.id === value);
}

export function countAdminSectionsByCategory(): Record<AdminCategoryId, number> {
  const counts: Record<AdminCategoryId, number> = {
    billing: 0,
    ai: 0,
    room: 0,
    library: 0,
    other: 0,
  };
  for (const s of ADMIN_SECTIONS) counts[s.category] += 1;
  return counts;
}

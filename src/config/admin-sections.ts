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
    href: '/admin/ai-comment-origin',
    title: 'AI NEW / DB 分析',
    description:
      'チャット保存ログ上の [NEW]/[DB] 発言数と DB 比率。曲解説・comment-pack の Gemini API 回数・トークン（経費の目安）',
  },
  {
    href: '/admin/room-chat-log',
    title: 'ルーム会話ログ',
    description: '日付（JST）×ルーム別の保存件数、テキスト表示・ダウンロードへのリンク',
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

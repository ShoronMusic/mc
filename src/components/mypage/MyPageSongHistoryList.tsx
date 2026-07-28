'use client';

import { BookOpenIcon } from '@heroicons/react/24/outline';
import {
  IS_MC_PRODUCT,
  librarySecondaryBtnClass,
  mypageActiveRowClass,
  mypageDateGroupClass,
  mypageMetaBadgeClass,
  mypagePickSongBtnClass,
  mypagePlayBtnClass,
  showRoomStyleUi,
} from '@/lib/product-branding';

export type MyPageSongHistoryRow = {
  id: string;
  room_id: string;
  video_id: string;
  url: string;
  title: string | null;
  artist: string | null;
  posted_at: string;
  selection_round?: number | null;
  style?: string | null;
  era?: string | null;
  /** ライブラリに AI 曲解説基本が保存済み */
  has_ai_commentary?: boolean;
};

const STYLE_TEXT_COLORS: Record<string, string> = {
  Rock: '#6246ea',
  Pop: '#f25042',
  Dance: '#f39800',
  'Alternative rock': '#448aca',
  Electronica: '#ffd803',
  'R&B': '#8c7851',
  'Hip-hop': '#078080',
  Metal: '#9646ea',
  Other: '#BDBDBD',
  Others: '#BDBDBD',
  Jazz: '#BDBDBD',
};

const ERA_TEXT_COLORS: Record<string, string> = {
  'Pre-50s': '#9e9e9e',
  '50s': '#a1887f',
  '60s': '#90caf9',
  '70s': '#81c784',
  '80s': '#ffab91',
  '90s': '#ce93d8',
  '00s': '#fff176',
  '10s': '#80deea',
  '20s': '#aed581',
  Other: '#9e9e9e',
};

function styleColor(style: string | null | undefined): string | undefined {
  if (!style?.trim()) return undefined;
  return STYLE_TEXT_COLORS[style] ?? STYLE_TEXT_COLORS[style.trim()];
}

function eraColor(era: string | null | undefined): string | undefined {
  if (!era?.trim()) return '#b0bec5';
  return ERA_TEXT_COLORS[era] ?? ERA_TEXT_COLORS[era.trim()];
}

type MyPageSongHistoryListProps = {
  rows: MyPageSongHistoryRow[];
  /** 日付見出しでグループ化（選曲リストタブと同じ） */
  groupByDate?: boolean;
  activePreviewVideoId?: string | null;
  onPlayPreview: (row: MyPageSongHistoryRow) => void;
  /** プレビューを開き、保存済み AI 曲解説を表示 */
  onViewCommentary?: (row: MyPageSongHistoryRow) => void;
  onPickSong: (url: string) => void;
  onAddToMyList: (row: MyPageSongHistoryRow) => void;
  emptyMessage?: string;
  className?: string;
};

function SongHistoryEntry({
  row,
  activePreviewVideoId,
  onPlayPreview,
  onViewCommentary,
  onPickSong,
  onAddToMyList,
}: {
  row: MyPageSongHistoryRow;
  activePreviewVideoId?: string | null;
  onPlayPreview: (row: MyPageSongHistoryRow) => void;
  onViewCommentary?: (row: MyPageSongHistoryRow) => void;
  onPickSong: (url: string) => void;
  onAddToMyList: (row: MyPageSongHistoryRow) => void;
}) {
  const at = new Date(row.posted_at);
  const timeStr = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const roundSuffix =
    typeof row.selection_round === 'number' &&
    Number.isFinite(row.selection_round) &&
    row.selection_round >= 1
      ? ` R${Math.floor(row.selection_round)}`
      : '';
  const title = row.title || row.video_id;
  const artist = row.artist ? `（${row.artist}）` : '';
  const active = activePreviewVideoId === row.video_id;

  return (
    <li
      className={`border-b pb-2 last:border-0 last:pb-0 ${
        IS_MC_PRODUCT ? 'border-gray-200' : 'border-gray-700/50'
      } ${active ? mypageActiveRowClass() : ''}`}
    >
      <p className="text-xs text-gray-500">
        部屋 {row.room_id || '—'} · {timeStr}
        {roundSuffix}
      </p>
      <div className="flex items-start justify-between gap-2">
        <p className={`min-w-0 text-sm ${IS_MC_PRODUCT ? 'text-gray-900' : 'text-gray-200'}`}>
          {title}
          {artist}
        </p>
        {row.has_ai_commentary ? (
          <span
            className="mt-0.5 flex shrink-0 items-center"
            title="AI曲解説が保存済み"
            aria-label="AI曲解説あり"
          >
            <BookOpenIcon className="h-4 w-4 text-sky-400/95" aria-hidden />
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
        {showRoomStyleUi() && row.style?.trim() ? (
          <span
            className={mypageMetaBadgeClass()}
            style={{ color: styleColor(row.style) }}
            title={`スタイル: ${row.style}`}
          >
            {row.style}
          </span>
        ) : null}
        {row.era?.trim() ? (
          <span
            className={mypageMetaBadgeClass()}
            style={{ color: eraColor(row.era) }}
            title={`年代: ${row.era}`}
          >
            {row.era}
          </span>
        ) : null}
        {(showRoomStyleUi() ? !row.style?.trim() : true) && !row.era?.trim() ? (
          <span className="text-gray-500">—</span>
        ) : null}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onPlayPreview(row)}
          className={mypagePlayBtnClass(active)}
          title="プレイヤーで再生"
        >
          再生
        </button>
        {row.has_ai_commentary && onViewCommentary ? (
          <button
            type="button"
            onClick={() => onViewCommentary(row)}
            className={librarySecondaryBtnClass('px-2 py-1 text-xs')}
            title="保存済みの AI 曲解説を表示（クレジット消費なし）"
          >
            解説
          </button>
        ) : null}
        <a
          href={row.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`break-all text-xs hover:underline ${IS_MC_PRODUCT ? 'text-blue-600' : 'text-blue-400'}`}
        >
          {row.url}
        </a>
        <button
          type="button"
          onClick={() => onPickSong(row.url)}
          className={mypagePickSongBtnClass()}
          title="この曲を選曲欄にセット"
        >
          選曲
        </button>
        <button
          type="button"
          onClick={() => onAddToMyList(row)}
          className={librarySecondaryBtnClass('px-2 py-1 text-xs')}
          title="自分のライブラリ（マイリスト）に追加"
        >
          マイリストに追加
        </button>
      </div>
    </li>
  );
}

export function MyPageSongHistoryList({
  rows,
  groupByDate = true,
  activePreviewVideoId,
  onPlayPreview,
  onViewCommentary,
  onPickSong,
  onAddToMyList,
  emptyMessage = 'この期間の選曲はありません。',
  className = '',
}: MyPageSongHistoryListProps) {
  if (rows.length === 0) {
    return <p className={`text-sm text-gray-500 ${className}`}>{emptyMessage}</p>;
  }

  if (!groupByDate) {
    const sorted = [...rows].sort(
      (a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime(),
    );
    return (
      <ul className={`space-y-2 ${className}`}>
        {sorted.map((row) => (
          <SongHistoryEntry
            key={row.id}
            row={row}
            activePreviewVideoId={activePreviewVideoId}
            onPlayPreview={onPlayPreview}
            onViewCommentary={onViewCommentary}
            onPickSong={onPickSong}
            onAddToMyList={onAddToMyList}
          />
        ))}
      </ul>
    );
  }

  const byDate = new Map<string, MyPageSongHistoryRow[]>();
  for (const row of rows) {
    const d = new Date(row.posted_at);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey)!.push(row);
  }
  const sortedDates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));
  for (const dayRows of byDate.values()) {
    dayRows.sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime());
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {sortedDates.map((dateKey) => {
        const [y, m, d] = dateKey.split('-');
        const label = `${y}年${m}月${d}日`;
        const dayRows = byDate.get(dateKey)!;
        return (
          <div key={dateKey} className={mypageDateGroupClass()}>
            <p className={`mb-2 text-xs font-medium ${IS_MC_PRODUCT ? 'text-gray-600' : 'text-gray-400'}`}>
              {label}
            </p>
            <ul className="space-y-2">
              {dayRows.map((row) => (
                <SongHistoryEntry
                  key={row.id}
                  row={row}
                  activePreviewVideoId={activePreviewVideoId}
                  onPlayPreview={onPlayPreview}
                  onViewCommentary={onViewCommentary}
                  onPickSong={onPickSong}
                  onAddToMyList={onAddToMyList}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

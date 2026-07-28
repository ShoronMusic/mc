'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  HostedGatheringPlaybackRow,
  HostedGatheringPlaybackSummary,
} from '@/app/api/user/hosted-gathering-playback/route';
import { HostedGatheringPlaybackModal } from '@/components/mypage/HostedGatheringPlaybackModal';
import {
  MyPageMusicPreviewPanel,
  type MyPageMusicPreviewSelection,
} from '@/components/mypage/MyPageMusicPreviewPanel';
import type { MyPageSongHistoryRow } from '@/components/mypage/MyPageSongHistoryList';

type HostedGatheringPlaybackSectionProps = {
  enabled: boolean;
  musicPreview: MyPageMusicPreviewSelection | null;
  onPlayPreview: (row: MyPageSongHistoryRow) => void;
  onViewCommentary?: (row: MyPageSongHistoryRow) => void;
  onPickSong: (url: string) => void;
  onAddToMyList: (row: MyPageSongHistoryRow) => void;
  onAddToMyListFromPreview: (payload: {
    videoId: string;
    url: string;
    title: string | null;
    artist: string | null;
  }) => void | Promise<unknown>;
  myListAddBusy?: boolean;
  focusAiCommentary?: boolean;
  onFocusAiCommentaryHandled?: () => void;
  onClearPreview: () => void;
};

function mapSnapshotRow(row: HostedGatheringPlaybackRow, roomId: string): MyPageSongHistoryRow {
  const title = row.title?.trim() || null;
  const artist = row.artist_name?.trim() || null;
  return {
    id: row.id,
    room_id: roomId,
    video_id: row.video_id,
    url: `https://www.youtube.com/watch?v=${row.video_id}`,
    title,
    artist,
    posted_at: row.played_at,
    selection_round: row.selection_round,
    style: row.style,
    era: row.era,
  };
}

function formatEndedAt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HostedGatheringPlaybackSection({
  enabled,
  musicPreview,
  onPlayPreview,
  onViewCommentary,
  onPickSong,
  onAddToMyList,
  onAddToMyListFromPreview,
  myListAddBusy = false,
  focusAiCommentary = false,
  onFocusAiCommentaryHandled,
  onClearPreview,
}: HostedGatheringPlaybackSectionProps) {
  const [items, setItems] = useState<HostedGatheringPlaybackSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [activeGathering, setActiveGathering] = useState<HostedGatheringPlaybackSummary | null>(null);
  const [detailSongs, setDetailSongs] = useState<MyPageSongHistoryRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setListError(null);
    void fetch('/api/user/hosted-gathering-playback', { credentials: 'include' })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as {
          items?: HostedGatheringPlaybackSummary[];
          error?: string;
        };
        if (!r.ok) throw new Error(data.error ?? '読み込みに失敗しました');
        return data.items ?? [];
      })
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setItems([]);
          setListError(e instanceof Error ? e.message : '読み込みに失敗しました');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const openDetail = useCallback(
    (gathering: HostedGatheringPlaybackSummary) => {
      onClearPreview();
      setActiveGathering(gathering);
      setDetailSongs([]);
      setDetailError(null);
      setDetailLoading(true);
      void fetch(
        `/api/user/hosted-gathering-playback?gatheringId=${encodeURIComponent(gathering.gatheringId)}`,
        { credentials: 'include' },
      )
        .then(async (r) => {
          const data = (await r.json().catch(() => ({}))) as {
            items?: HostedGatheringPlaybackRow[];
            error?: string;
          };
          if (!r.ok) throw new Error(data.error ?? '視聴履歴の取得に失敗しました');
          return (data.items ?? []).map((row) => mapSnapshotRow(row, gathering.roomId));
        })
        .then(async (rows) => {
          const videoIds = Array.from(new Set(rows.map((r) => r.video_id).filter(Boolean)));
          const present = new Set<string>();
          const CHUNK = 80;
          for (let i = 0; i < videoIds.length; i += CHUNK) {
            const chunk = videoIds.slice(i, i + CHUNK);
            try {
              const presenceRes = await fetch(
                `/api/library/ai-commentary?presence=1&videoIds=${chunk
                  .map((id) => encodeURIComponent(id))
                  .join(',')}`,
                { credentials: 'include' },
              );
              if (!presenceRes.ok) continue;
              const presenceData = (await presenceRes.json().catch(() => null)) as {
                presentVideoIds?: string[];
              } | null;
              for (const vid of presenceData?.presentVideoIds ?? []) {
                if (typeof vid === 'string' && vid.trim()) present.add(vid.trim());
              }
            } catch {
              /* optional */
            }
          }
          setDetailSongs(
            rows.map((row) => ({
              ...row,
              has_ai_commentary: present.has(row.video_id),
            })),
          );
        })
        .catch((e: unknown) => {
          setDetailSongs([]);
          setDetailError(e instanceof Error ? e.message : '視聴履歴の取得に失敗しました');
        })
        .finally(() => setDetailLoading(false));
    },
    [onClearPreview],
  );

  if (!enabled) return null;

  return (
    <>
      <section className="mb-6 rounded border border-sky-800/40 bg-sky-950/20 p-3">
        <h3 className="text-sm font-semibold text-sky-100">主催した会の視聴履歴</h3>
        <p className="mt-1 text-xs leading-relaxed text-gray-400">
          開催を終了したとき、その会で流れた曲リストを自動保存します。部屋番号が別の主催者に割り当てられても、ここから確認できます。
        </p>
        {loading ? (
          <p className="mt-3 text-xs text-gray-500">読み込み中…</p>
        ) : listError ? (
          <p className="mt-3 text-xs text-amber-200/90">{listError}</p>
        ) : items.length === 0 ? (
          <p className="mt-3 text-xs text-gray-500">
            終了済みの主催会はまだありません。トップの主催者メニューから「開催を終了」すると、次回からここに表示されます。
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {items.map((row) => (
              <li
                key={row.gatheringId}
                className="rounded border border-gray-700/80 bg-gray-900/50 px-3 py-2"
              >
                <p className="text-sm font-medium text-gray-100">{row.gatheringTitle}</p>
                <p className="text-xs text-gray-500">
                  部屋 {row.roomId}
                  {row.roomDisplayTitle ? ` · ${row.roomDisplayTitle}` : ''}
                </p>
                <p className="text-xs text-gray-500">終了: {formatEndedAt(row.endedAt)}</p>
                <button
                  type="button"
                  onClick={() => openDetail(row)}
                  className="mt-2 rounded border border-sky-700/60 bg-sky-900/30 px-2.5 py-1 text-xs font-medium text-sky-200 hover:bg-sky-900/50"
                >
                  視聴履歴（{row.songCount} 曲）
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {activeGathering ? (
        <HostedGatheringPlaybackModal
          gathering={activeGathering}
          songs={detailSongs}
          loading={detailLoading}
          error={detailError}
          musicPreview={musicPreview}
          onPlayPreview={onPlayPreview}
          onViewCommentary={onViewCommentary}
          onPickSong={onPickSong}
          onAddToMyList={onAddToMyList}
          onAddToMyListFromPreview={onAddToMyListFromPreview}
          myListAddBusy={myListAddBusy}
          focusAiCommentary={focusAiCommentary}
          onFocusAiCommentaryHandled={onFocusAiCommentaryHandled}
          onClose={() => {
            setActiveGathering(null);
            onClearPreview();
          }}
        />
      ) : null}
    </>
  );
}

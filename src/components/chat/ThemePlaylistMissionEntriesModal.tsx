'use client';

/**
 * お題ミッション「実施中」から開く一覧。視聴履歴と同じ列構成（読み取り専用）。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RoomPlaybackHistoryRow } from '@/app/api/room-playback-history/route';
import { getArtistAndSong, repairQuotedSongArtistPackInversion } from '@/lib/format-song-display';

const COL_PARTICIPANT = '参加者名';
const COL_TIME = '時間';
const COL_ARTIST_TITLE = 'アーティスト - タイトル';
const COL_STYLE = 'スタイル';
const COL_ERA = '年代';
const COL_LINK = 'リンク';
const COL_FAV = '♡';

const COL_WIDTH_PARTICIPANT = 68;
const COL_WIDTH_TIME = 72;
const COL_MIN_WIDTH_ARTIST_TITLE = 80;
const COL_WIDTH_STYLE = 56;
const COL_WIDTH_ERA = 48;
const COL_WIDTH_LINK = 56;
const COL_WIDTH_FAV = 36;

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

const GUEST_DISPLAY_SUFFIX = ' (G)';

function getEraTextColor(era: string | null | undefined): string | undefined {
  if (!era || !era.trim()) return undefined;
  return ERA_TEXT_COLORS[era] ?? '#b0bec5';
}

function getStyleTextColor(style: string | null | undefined): string | undefined {
  if (!style || !style.trim()) return undefined;
  return STYLE_TEXT_COLORS[style] ?? STYLE_TEXT_COLORS[style.trim()];
}

function formatPlayedAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

function formatPlayedAtWithRound(iso: string, selectionRound: number | null | undefined): string {
  const t = formatPlayedAt(iso);
  if (typeof selectionRound === 'number' && Number.isFinite(selectionRound) && selectionRound >= 1) {
    return `${t} R${Math.floor(selectionRound)}`;
  }
  return t;
}

function playbackHistoryNameLookupKey(displayNameStored: string): string {
  const raw = displayNameStored.trim();
  if (!raw) return '';
  if (raw.endsWith(GUEST_DISPLAY_SUFFIX)) {
    return raw.slice(0, -GUEST_DISPLAY_SUFFIX.length).trim();
  }
  return raw;
}

type MissionEntryApi = {
  id: string;
  video_id: string;
  url: string;
  title: string | null;
  artist: string | null;
  selector_display_name: string | null;
  created_at: string;
  slot_index: number;
};

export type ThemePlaylistMissionEntriesModalRoomProps = {
  roomId?: string;
  roomClientId?: string;
  isGuest?: boolean;
  favoritedVideoIds?: string[];
  onFavoriteClick?: (
    row: {
      video_id: string;
      display_name: string;
      played_at: string;
      title: string | null;
      artist_name: string | null;
    },
    isFavorited: boolean,
  ) => void | Promise<void>;
  participantsWithColor?: { displayName: string; textColor?: string }[];
  currentVideoId?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  themeId: string;
  themeLabel: string;
  room?: ThemePlaylistMissionEntriesModalRoomProps;
};

type PlaybackEnrich = {
  era: string | null;
  style: string | null;
  selection_round: number | null;
  played_at: string | null;
};

function buildPlaybackEnrichmentByVideoId(rows: RoomPlaybackHistoryRow[]): Map<string, PlaybackEnrich> {
  const byVideo = new Map<string, RoomPlaybackHistoryRow[]>();
  for (const r of rows) {
    const vid = (r.video_id ?? '').trim();
    if (!vid) continue;
    const arr = byVideo.get(vid) ?? [];
    arr.push(r);
    byVideo.set(vid, arr);
  }
  const out = new Map<string, PlaybackEnrich>();
  for (const [vid, list] of byVideo) {
    const sorted = [...list].sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime());
    const pick = sorted.find((row) => (row.era?.trim()) || (row.style?.trim())) ?? sorted[0];
    if (!pick) continue;
    out.set(vid, {
      era: pick.era ?? null,
      style: pick.style ?? null,
      selection_round: pick.selection_round ?? null,
      played_at: pick.played_at ?? null,
    });
  }
  return out;
}

function entryArtistTitle(entry: MissionEntryApi): string {
  const t = entry.title?.trim();
  if (!t) return entry.video_id.trim() || '—';
  const r0 = getArtistAndSong(t, entry.artist ?? null);
  const r = repairQuotedSongArtistPackInversion(r0);
  if (r.artistDisplay && r.song) return `${r.artistDisplay} - ${r.song}`;
  return t;
}

export default function ThemePlaylistMissionEntriesModal({ open, onClose, themeId, themeLabel, room }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<MissionEntryApi[]>([]);
  const [enrichByVideoId, setEnrichByVideoId] = useState<Map<string, PlaybackEnrich>>(() => new Map());
  const [guestMessage, setGuestMessage] = useState(false);

  const isGuest = room?.isGuest ?? true;
  const favoritedVideoIds = room?.favoritedVideoIds ?? [];
  const onFavoriteClick = room?.onFavoriteClick;
  const currentVideoId = room?.currentVideoId ?? null;
  const roomId = (room?.roomId ?? '').trim();
  const roomClientId = typeof room?.roomClientId === 'string' ? room.roomClientId.trim() : '';

  const participantColorByDisplayName = useMemo(() => {
    const m = new Map<string, string>();
    for (const { displayName, textColor } of room?.participantsWithColor ?? []) {
      const key = displayName.trim();
      if (!key || !textColor?.trim()) continue;
      if (!m.has(key)) m.set(key, textColor);
    }
    return m;
  }, [room?.participantsWithColor]);

  const participantNameColor = useCallback(
    (displayNameStored: string) => {
      const key = playbackHistoryNameLookupKey(displayNameStored);
      if (!key) return undefined;
      return participantColorByDisplayName.get(key);
    },
    [participantColorByDisplayName],
  );

  useEffect(() => {
    if (!open) {
      setError(null);
      setEntries([]);
      setEnrichByVideoId(new Map());
      setLoading(false);
      return;
    }

    const tid = themeId.trim();
    if (!tid) {
      setError('お題が見つかりません。');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const missionRes = await fetch('/api/user/theme-playlist-mission', { credentials: 'include' });
        const missionJson = (await missionRes.json().catch(() => null)) as {
          missions?: Array<{
            theme_id?: string;
            status?: string;
            entries?: MissionEntryApi[];
          }>;
          error?: string;
        } | null;
        if (!missionRes.ok) {
          const msg =
            typeof missionJson?.error === 'string' && missionJson.error.trim()
              ? missionJson.error.trim()
              : '一覧の取得に失敗しました。';
          if (!cancelled) {
            setError(msg);
            setEntries([]);
          }
          return;
        }
        const missions = Array.isArray(missionJson?.missions) ? missionJson!.missions! : [];
        const active = missions.find((m) => m.status === 'active' && (m.theme_id ?? '').trim() === tid);
        const list = Array.isArray(active?.entries) ? active!.entries! : [];
        if (!cancelled) setEntries(list);

        let enrich = new Map<string, PlaybackEnrich>();
        if (roomId) {
          const qs = new URLSearchParams({ roomId });
          if (roomClientId) qs.set('clientId', roomClientId);
          const histRes = await fetch(`/api/room-playback-history?${qs.toString()}`, { credentials: 'include' });
          const histJson = (await histRes.json().catch(() => null)) as { items?: RoomPlaybackHistoryRow[] } | null;
          const raw = Array.isArray(histJson?.items) ? histJson!.items! : [];
          enrich = buildPlaybackEnrichmentByVideoId(raw);
        }
        if (!cancelled) setEnrichByVideoId(enrich);
      } catch {
        if (!cancelled) {
          setError('一覧の取得に失敗しました。');
          setEntries([]);
          setEnrichByVideoId(new Map());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, themeId, roomId, roomClientId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleHeart = useCallback(
    (entry: MissionEntryApi) => {
      if (isGuest) {
        setGuestMessage(true);
        setTimeout(() => setGuestMessage(false), 3000);
        return;
      }
      const displayName = (entry.selector_display_name ?? '').trim() || '—';
      const enrich = enrichByVideoId.get(entry.video_id.trim());
      const playedAt = enrich?.played_at ?? entry.created_at;
      const row = {
        video_id: entry.video_id.trim(),
        display_name: displayName,
        played_at: playedAt,
        title: entry.title,
        artist_name: entry.artist,
      };
      const isFav = favoritedVideoIds.includes(row.video_id);
      void onFavoriteClick?.(row, isFav);
    },
    [isGuest, enrichByVideoId, favoritedVideoIds, onFavoriteClick],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-3"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-amber-800/50 bg-gray-900 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-mission-entries-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-amber-900/40 bg-amber-950/40 px-3 py-2">
          <div className="min-w-0">
            <h2 id="theme-mission-entries-title" className="text-sm font-semibold text-amber-100">
              お題の登録一覧
            </h2>
            <p className="mt-0.5 truncate text-xs text-amber-200/90" title={themeLabel}>
              {themeLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-gray-200 hover:bg-gray-700"
          >
            閉じる
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-2">
          {error ? (
            <p className="py-6 text-center text-sm text-red-300">{error}</p>
          ) : (
            <div className="overflow-x-auto rounded border border-gray-700/80 bg-gray-950/40">
              <table className="w-full table-fixed border-collapse text-left text-[11px] text-gray-200">
                <thead>
                  <tr>
                    <th
                      className="border-b border-gray-600 py-1 pr-1 font-medium text-gray-400"
                      style={{
                        width: COL_WIDTH_PARTICIPANT,
                        minWidth: COL_WIDTH_PARTICIPANT,
                        maxWidth: COL_WIDTH_PARTICIPANT,
                      }}
                      scope="col"
                    >
                      <span className="block truncate">{COL_PARTICIPANT}</span>
                    </th>
                    <th
                      className="border-b border-gray-600 py-1 pr-1 font-medium text-gray-400"
                      style={{ width: COL_WIDTH_TIME, minWidth: COL_WIDTH_TIME, maxWidth: COL_WIDTH_TIME }}
                      scope="col"
                    >
                      <span className="block truncate">{COL_TIME}</span>
                    </th>
                    <th
                      className="border-b border-gray-600 py-1 pr-1 font-medium text-gray-400"
                      style={{ width: COL_WIDTH_ERA, minWidth: COL_WIDTH_ERA, maxWidth: COL_WIDTH_ERA }}
                      scope="col"
                    >
                      <span className="block truncate">{COL_ERA}</span>
                    </th>
                    <th
                      className="border-b border-gray-600 py-1 pr-1 font-medium text-gray-400"
                      style={{ width: COL_WIDTH_STYLE, minWidth: COL_WIDTH_STYLE, maxWidth: COL_WIDTH_STYLE }}
                      scope="col"
                    >
                      <span className="block truncate">{COL_STYLE}</span>
                    </th>
                    <th
                      className="border-b border-gray-600 py-1 pr-1 font-medium text-gray-400"
                      style={{ minWidth: COL_MIN_WIDTH_ARTIST_TITLE }}
                      scope="col"
                    >
                      <span className="block truncate">{COL_ARTIST_TITLE}</span>
                    </th>
                    <th
                      className="border-b border-gray-600 py-1 pr-1 font-medium text-gray-400"
                      style={{ width: COL_WIDTH_LINK, minWidth: COL_WIDTH_LINK, maxWidth: COL_WIDTH_LINK }}
                      scope="col"
                    >
                      <span className="block truncate">{COL_LINK}</span>
                    </th>
                    <th
                      className="border-b border-gray-600 py-1 pr-1 font-medium text-gray-400"
                      style={{ width: COL_WIDTH_FAV, minWidth: COL_WIDTH_FAV, maxWidth: COL_WIDTH_FAV }}
                      scope="col"
                    >
                      <span className="block truncate">{COL_FAV}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading && entries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-gray-500">
                        読み込み中...
                      </td>
                    </tr>
                  ) : entries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-gray-500">
                        まだ登録された曲がありません
                      </td>
                    </tr>
                  ) : (
                    entries.map((entry) => {
                      const vid = entry.video_id.trim();
                      const enrich = enrichByVideoId.get(vid);
                      const displayName = (entry.selector_display_name ?? '').trim() || '—';
                      const timeIso = enrich?.played_at ?? entry.created_at;
                      const round = enrich?.selection_round ?? null;
                      const era = enrich?.era?.trim() ? enrich.era : null;
                      const style = enrich?.style?.trim() ? enrich.style : null;
                      const ytUrl =
                        (entry.url ?? '').trim() ||
                        (vid ? `https://www.youtube.com/watch?v=${encodeURIComponent(vid)}` : '#');
                      const isActive = currentVideoId !== null && vid === currentVideoId;
                      const isFavorited = favoritedVideoIds.includes(vid);
                      const artistTitle = entryArtistTitle(entry);

                      return (
                        <tr key={entry.id} className={isActive ? 'bg-blue-900/30' : ''}>
                          <td
                            className="truncate border-b border-gray-700/80 py-0.5 pr-1"
                            style={{
                              width: COL_WIDTH_PARTICIPANT,
                              minWidth: COL_WIDTH_PARTICIPANT,
                              maxWidth: COL_WIDTH_PARTICIPANT,
                              color: participantNameColor(displayName) ?? '#e5e7eb',
                            }}
                            title={displayName}
                          >
                            {displayName}
                          </td>
                          <td
                            className="truncate border-b border-gray-700/80 py-0.5 pr-1 text-gray-400"
                            style={{ width: COL_WIDTH_TIME, minWidth: COL_WIDTH_TIME, maxWidth: COL_WIDTH_TIME }}
                          >
                            <span title={round != null ? `ラウンド ${round}` : undefined}>
                              {formatPlayedAtWithRound(timeIso, round)}
                            </span>
                          </td>
                          <td
                            className="truncate border-b border-gray-700/80 py-0.5 pr-1 text-gray-400"
                            style={{
                              width: COL_WIDTH_ERA,
                              minWidth: COL_WIDTH_ERA,
                              maxWidth: COL_WIDTH_ERA,
                              color: getEraTextColor(era),
                            }}
                            title={era ? `年代: ${era}` : '視聴履歴にないか、年代未設定'}
                          >
                            {era ?? '—'}
                          </td>
                          <td
                            className="truncate border-b border-gray-700/80 py-0.5 pr-1 text-gray-400"
                            style={{
                              width: COL_WIDTH_STYLE,
                              minWidth: COL_WIDTH_STYLE,
                              maxWidth: COL_WIDTH_STYLE,
                              color: getStyleTextColor(style),
                            }}
                            title={style ?? '視聴履歴にないか、スタイル未設定'}
                          >
                            {style ?? '—'}
                          </td>
                          <td
                            className="truncate border-b border-gray-700/80 py-0.5 pr-1 text-gray-200"
                            style={{ minWidth: COL_MIN_WIDTH_ARTIST_TITLE }}
                            title={artistTitle}
                          >
                            {artistTitle}
                          </td>
                          <td
                            className="border-b border-gray-700/80 py-0.5 pr-1"
                            style={{ width: COL_WIDTH_LINK, minWidth: COL_WIDTH_LINK, maxWidth: COL_WIDTH_LINK }}
                          >
                            {vid ? (
                              <a
                                href={ytUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate text-red-400 hover:underline"
                                title="YouTubeで開く"
                              >
                                YT
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td
                            className="border-b border-gray-700/80 py-0.5 pr-1"
                            style={{ width: COL_WIDTH_FAV, minWidth: COL_WIDTH_FAV, maxWidth: COL_WIDTH_FAV }}
                          >
                            <button
                              type="button"
                              onClick={() => handleHeart(entry)}
                              className="rounded p-0.5 text-lg leading-none transition hover:scale-110"
                              title={
                                isGuest
                                  ? 'お気に入り（登録で利用可）'
                                  : isFavorited
                                    ? 'お気に入り解除'
                                    : 'お気に入りに追加'
                              }
                              aria-label={isFavorited ? 'お気に入り解除' : 'お気に入りに追加'}
                            >
                              {isFavorited ? (
                                <span className="text-red-500" aria-hidden>
                                  ♥
                                </span>
                              ) : (
                                <span className="text-gray-500 hover:text-red-400" aria-hidden>
                                  ♡
                                </span>
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {guestMessage && (
          <p className="border-t border-gray-700 bg-amber-900/20 px-2 py-1.5 text-center text-xs text-amber-200">
            ユーザー登録で利用できます
          </p>
        )}
      </div>
    </div>
  );
}

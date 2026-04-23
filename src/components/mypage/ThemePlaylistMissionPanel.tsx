'use client';

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { THEME_PLAYLIST_SLOT_TARGET } from '@/lib/theme-playlist-definitions';
import { THEME_PLAYLIST_MISSION_CLIENT_CHANGED_EVENT } from '@/lib/theme-playlist-mission-client-events';

type ThemeRow = {
  id: string;
  label: string;
  description: string;
  is_custom?: boolean;
  base_id?: string;
  /** ISO。オリジナルお題のみ API で返す */
  created_at?: string;
};

type EntryApi = {
  id: string;
  mission_id: string;
  slot_index: number;
  video_id: string;
  url?: string;
  title: string | null;
  artist: string | null;
  ai_comment: string;
  selector_display_name?: string | null;
  created_at: string;
};

type MissionApi = {
  id: string;
  theme_id: string;
  theme_label: string;
  status: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  entries: EntryApi[];
  entry_count: number;
};

type Props = {
  isGuest: boolean;
  /**
   * 収録曲1件の削除。未指定なら `!isGuest`。
   * 部屋内マイページでは `!isGuest && (!roomId || isChatOwner)` のように渡す想定（チャットオーナーのみ）。
   */
  canDeleteRecordedEntries?: boolean;
};
type ThemeListTab = 'preset' | 'create' | 'completed';

function notifyThemePlaylistMissionChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(THEME_PLAYLIST_MISSION_CLIENT_CHANGED_EVENT));
  }
}

function formatThemeCreatedDate(iso: string | undefined): string {
  if (!iso?.trim()) return '';
  try {
    return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return '';
  }
}

function displayMissionForTheme(themeId: string, missions: MissionApi[]): MissionApi | null {
  const list = missions.filter((m) => m.theme_id === themeId);
  if (!list.length) return null;
  const active = list.find((m) => m.status === 'active');
  if (active) return active;
  const paused = list
    .filter((m) => m.status === 'paused')
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  if (paused[0]) return paused[0];
  const done = list
    .filter((m) => m.status === 'completed')
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  return done[0] ?? null;
}

function nextMissionLabelForTheme(themeId: string, baseLabel: string, missions: MissionApi[]): string {
  const count = missions.filter((m) => m.theme_id === themeId).length;
  const nextVol = count + 1;
  return nextVol >= 2 ? `${baseLabel} Vol.${nextVol}` : baseLabel;
}

export default function ThemePlaylistMissionPanel({ isGuest, canDeleteRecordedEntries }: Props) {
  const allowRecordedDelete = canDeleteRecordedEntries ?? !isGuest;
  const [presetThemes, setPresetThemes] = useState<ThemeRow[]>([]);
  const [customThemes, setCustomThemes] = useState<ThemeRow[]>([]);
  const [missions, setMissions] = useState<MissionApi[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
  const [themeTab, setThemeTab] = useState<ThemeListTab>('preset');
  const [newThemeTitle, setNewThemeTitle] = useState('');
  const [newThemeDescription, setNewThemeDescription] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [toggleConfirmModal, setToggleConfirmModal] = useState<{
    open: boolean;
    themeId: string;
    themeLabel: string;
    action: 'start' | 'pause';
    otherActiveThemeLabel?: string | null;
  }>({
    open: false,
    themeId: '',
    themeLabel: '',
    action: 'start',
    otherActiveThemeLabel: null,
  });
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    theme: ThemeRow | null;
    entryCount: number;
  }>({ open: false, theme: null, entryCount: 0 });
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<MissionApi[] | null> => {
    if (isGuest) return null;
    setLoadError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/user/theme-playlist-mission', { credentials: 'include' });
      const data = (await res.json().catch(() => null)) as {
        themes?: ThemeRow[];
        presetThemes?: ThemeRow[];
        customThemes?: ThemeRow[];
        missions?: MissionApi[];
        error?: string;
      } | null;
      if (!res.ok) {
        setLoadError(typeof data?.error === 'string' ? data.error : '読み込みに失敗しました。');
        setPresetThemes([]);
        setCustomThemes([]);
        setMissions([]);
        return null;
      }
      const presets = Array.isArray(data?.presetThemes)
        ? data.presetThemes
        : Array.isArray(data?.themes)
          ? data.themes.filter((t) => !String(t.id).startsWith('custom:'))
          : [];
      const customs = Array.isArray(data?.customThemes)
        ? data.customThemes
        : Array.isArray(data?.themes)
          ? data.themes.filter((t) => String(t.id).startsWith('custom:'))
          : [];
      setPresetThemes(presets);
      setCustomThemes(customs);
      const ms = Array.isArray(data?.missions) ? data.missions : [];
      setMissions(ms);
      const firstActive = ms.find((m) => m.status === 'active');
      setSelectedMissionId((prev) => {
        if (firstActive) return firstActive.id;
        if (prev && ms.some((m) => m.id === prev)) return prev;
        const paused = [...ms]
          .filter((m) => m.status === 'paused')
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        return paused[0]?.id ?? null;
      });
      return ms;
    } catch {
      setLoadError('読み込みに失敗しました。');
      return null;
    } finally {
      setBusy(false);
    }
  }, [isGuest]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedMission = useMemo(
    () => missions.find((m) => m.id === selectedMissionId) ?? null,
    [missions, selectedMissionId],
  );

  /** 一覧の定義から、選択中ミッションのお題行（カスタムなら作成日・オリジナル表示用） */
  const selectedThemeMetaForDetail = useMemo(() => {
    if (!selectedMission) return { row: null as ThemeRow | null, descriptionFull: '' };
    const row = [...customThemes, ...presetThemes].find((t) => t.id === selectedMission.theme_id) ?? null;
    return { row, descriptionFull: (row?.description ?? '').trim() };
  }, [selectedMission, customThemes, presetThemes]);

  /** 未完了（進行中・一時解除）で曲が入っているほど上に。完了のみ／未開始は後方 */
  const themeListRowsSorted = useMemo(() => {
    const list = [...customThemes, ...presetThemes];
    const progressSortKey = (themeId: string): number => {
      const dm = displayMissionForTheme(themeId, missions);
      if (!dm || dm.status === 'completed') return -1;
      return dm.entry_count;
    };
    list.sort((a, b) => {
      const ka = progressSortKey(a.id);
      const kb = progressSortKey(b.id);
      if (kb !== ka) return kb - ka;
      const aCustom = customThemes.some((t) => t.id === a.id);
      const bCustom = customThemes.some((t) => t.id === b.id);
      if (aCustom !== bCustom) return aCustom ? -1 : 1;
      return a.label.localeCompare(b.label, 'ja');
    });
    return list;
  }, [customThemes, presetThemes, missions]);

  const pauseMissionById = async (missionId: string) => {
    setActionMessage(null);
    setBusy(true);
    try {
      const res = await fetch('/api/user/theme-playlist-mission', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause', missionId }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setActionMessage(typeof data?.error === 'string' ? data.error : '一旦解除に失敗しました。');
        return false;
      }
      await load();
      notifyThemePlaylistMissionChanged();
      return true;
    } catch {
      setActionMessage('一旦解除に失敗しました。');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const startMission = async (themeId: string, missionsSnapshot?: MissionApi[]) => {
    setActionMessage(null);
    const ms = missionsSnapshot ?? missions;
    const otherActive = ms.find((m) => m.status === 'active' && m.theme_id !== themeId);
    if (otherActive) {
      const okPause = await pauseMissionById(otherActive.id);
      if (!okPause) return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/user/theme-playlist-mission', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ themeId }),
      });
      const data = (await res.json().catch(() => null)) as {
        mission?: { id: string };
        error?: string;
        resumed?: boolean;
        resumedFromPaused?: boolean;
      } | null;
      if (!res.ok) {
        setActionMessage(typeof data?.error === 'string' ? data.error : '開始に失敗しました。');
        return;
      }
      if (data?.mission?.id) {
        setSelectedMissionId(data.mission.id);
        setActionMessage(
          data.resumedFromPaused
            ? '一旦解除したミッションを再開しました。'
            : data.resumed
              ? '続きのミッションを開きました。'
              : 'ミッションを開始しました。',
        );
      }
      await load();
      notifyThemePlaylistMissionChanged();
    } catch {
      setActionMessage('開始に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const createCustomTheme = async () => {
    if (!newThemeTitle.trim()) return;
    setActionMessage(null);
    setBusy(true);
    try {
      const res = await fetch('/api/user/theme-playlist-mission', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_theme',
          title: newThemeTitle.trim(),
          description: newThemeDescription.trim(),
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        customTheme?: { id: string; label: string };
        error?: string;
      } | null;
      if (!res.ok) {
        setActionMessage(typeof data?.error === 'string' ? data.error : '新規作成に失敗しました。');
        return;
      }
      setNewThemeTitle('');
      setNewThemeDescription('');
      setThemeTab('preset');
      setActionMessage('オリジナルお題を登録しました。');
      const msAfter = await load();
      if (data?.customTheme?.id) {
        await startMission(data.customTheme.id, msAfter ?? undefined);
      }
      notifyThemePlaylistMissionChanged();
    } catch {
      setActionMessage('新規作成に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  /** お題行クリック: 進行中なら一旦解除（OFF）、それ以外は開始/再開（ON）。他テーマの進行は startMission 側で解除 */
  const toggleThemeRow = async (themeId: string) => {
    if (busy) return;
    const targetTheme = [...customThemes, ...presetThemes].find((t) => t.id === themeId);
    const baseThemeLabel = targetTheme?.label ?? 'このお題';
    const dm = displayMissionForTheme(themeId, missions);
    const startThemeLabel =
      dm?.status === 'completed'
        ? nextMissionLabelForTheme(themeId, baseThemeLabel, missions)
        : baseThemeLabel;
    if (dm?.status === 'active') {
      setToggleConfirmModal({
        open: true,
        themeId,
        themeLabel: baseThemeLabel,
        action: 'pause',
        otherActiveThemeLabel: null,
      });
      return;
    }
    const otherActive = missions.find((m) => m.status === 'active' && m.theme_id !== themeId);
    setToggleConfirmModal({
      open: true,
      themeId,
        themeLabel: startThemeLabel,
      action: 'start',
      otherActiveThemeLabel: otherActive?.theme_label ?? null,
    });
  };

  const confirmToggleThemeRow = async () => {
    if (busy || !toggleConfirmModal.open) return;
    const { themeId, action } = toggleConfirmModal;
    setToggleConfirmModal((prev) => ({ ...prev, open: false }));
    if (action === 'pause') {
      const dm = displayMissionForTheme(themeId, missions);
      if (!dm || dm.status !== 'active') return;
      setActionMessage(null);
      const ok = await pauseMissionById(dm.id);
      if (ok) {
        setSelectedMissionId(dm.id);
        setActionMessage('ミッションを一旦解除しました。同じお題の行をもう一度クリックすると再開できます。');
      }
      return;
    }
    await startMission(themeId);
  };

  const executeDeleteCustomTheme = async (themeId: string) => {
    setActionMessage(null);
    setBusy(true);
    try {
      const res = await fetch('/api/user/theme-playlist-mission', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_custom_theme', themeId }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setActionMessage(typeof data?.error === 'string' ? data.error : '削除に失敗しました。');
        return;
      }
      setDeleteModal({ open: false, theme: null, entryCount: 0 });
      setActionMessage('オリジナルお題を削除しました。');
      await load();
      notifyThemePlaylistMissionChanged();
    } catch {
      setActionMessage('削除に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const requestDeleteCustomTheme = (t: ThemeRow, e?: MouseEvent<HTMLButtonElement>) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (busy || !t.is_custom) return;
    const dm = displayMissionForTheme(t.id, missions);
    const n = dm?.entry_count ?? 0;
    if (n >= 1) {
      setDeleteModal({ open: true, theme: t, entryCount: n });
      return;
    }
    if (typeof window !== 'undefined' && window.confirm(`「${t.label}」\nこのオリジナルお題を削除しますか？`)) {
      void executeDeleteCustomTheme(t.id);
    }
  };

  const deleteRecordedEntry = async (entryId: string) => {
    if (!allowRecordedDelete || busy || !entryId.trim()) return;
    if (typeof window !== 'undefined' && !window.confirm('この曲を収録から外しますか？')) return;
    setActionMessage(null);
    setDeletingEntryId(entryId);
    try {
      const res = await fetch(
        `/api/user/theme-playlist-mission/entry?entryId=${encodeURIComponent(entryId)}`,
        { method: 'DELETE', credentials: 'include' },
      );
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setActionMessage(typeof data?.error === 'string' ? data.error : '曲の削除に失敗しました。');
        return;
      }
      await load();
      notifyThemePlaylistMissionChanged();
    } catch {
      setActionMessage('曲の削除に失敗しました。');
    } finally {
      setDeletingEntryId(null);
    }
  };

  if (isGuest) {
    return (
      <p className="text-sm text-gray-400">
        お題プレイリストは<strong className="text-gray-300">ログインユーザー</strong>のみ利用できます。
      </p>
    );
  }

  const progress = selectedMission?.entries?.length ?? 0;
  const isActive = selectedMission?.status === 'active';
  const isPaused = selectedMission?.status === 'paused';
  const isComplete =
    selectedMission?.status === 'completed' || progress >= THEME_PLAYLIST_SLOT_TARGET;
  const completedMissions = missions.filter((m) => m.status === 'completed');

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        <strong className="text-gray-400">部屋</strong>
        では、下の表でお題ミッションを開始したあと、発言欄に YouTube URL を貼り、
        <strong className="text-gray-400">「お題曲送信（β）」</strong>
        ボタン（送信の上に出ます）で選曲すると、通常の AI 曲解説のあとにお題講評が付き、ここと同じリストに曲が積み上がります（最大{' '}
        {THEME_PLAYLIST_SLOT_TARGET} 本）。通常の「送信」ではお題には紐づきません。
      </p>
      {loadError ? (
        <p className="rounded border border-amber-800/50 bg-amber-900/20 px-2 py-1.5 text-xs text-amber-100">
          {loadError}
        </p>
      ) : null}
      {actionMessage ? (
        <p className="rounded border border-sky-800/50 bg-sky-900/20 px-2 py-1.5 text-xs text-sky-100">
          {actionMessage}
        </p>
      ) : null}

      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-200">お題一覧</h3>
        <p className="mb-2 text-[11px] text-gray-500">
          行をクリックして進行の ON/OFF を切り替えます（進行中の行だけがハイライト）。別のお題を ON にすると、進行中だったお題は自動で一旦解除されます。
        </p>
        <div className="mb-2 flex flex-wrap gap-1 text-xs">
          {([
            ['preset', 'お題例'],
            ['create', '新規作成'],
            ['completed', '完了分'],
          ] as Array<[ThemeListTab, string]>).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setThemeTab(id)}
              className={`rounded px-2 py-1 ${
                themeTab === id ? 'bg-violet-700 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {themeTab === 'create' ? (
          <div className="rounded border border-gray-700 bg-gray-900/30 p-3">
            <div className="mb-2 grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-gray-300">
                タイトル
                <input
                  type="text"
                  value={newThemeTitle}
                  onChange={(e) => setNewThemeTitle(e.target.value)}
                  maxLength={80}
                  className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-sm text-white"
                />
              </label>
              <label className="text-xs text-gray-300">
                説明
                <input
                  type="text"
                  value={newThemeDescription}
                  onChange={(e) => setNewThemeDescription(e.target.value)}
                  maxLength={200}
                  className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-sm text-white"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={busy || !newThemeTitle.trim()}
              onClick={() => void createCustomTheme()}
              className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              オリジナルお題を登録
            </button>
          </div>
        ) : themeTab === 'completed' ? (
          <div className="max-h-[40vh] overflow-auto rounded border border-gray-700">
            <table className="w-full border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-950/90 text-[11px] text-gray-400">
                  <th className="px-2 py-1.5 font-medium">お題</th>
                  <th className="w-20 px-2 py-1.5 font-medium">進捗</th>
                  <th className="w-24 px-2 py-1.5 font-medium">完了日</th>
                </tr>
              </thead>
              <tbody>
                {completedMissions.map((m) => (
                  <tr key={`done-${m.id}`} className="border-b border-gray-800/90">
                    <td className="px-2 py-1.5 text-gray-100">{m.theme_label}</td>
                    <td className="px-2 py-1.5 text-gray-300">{m.entry_count}/{THEME_PLAYLIST_SLOT_TARGET}</td>
                    <td className="px-2 py-1.5 text-gray-400">
                      {m.completed_at
                        ? new Date(m.completed_at).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="max-h-[50vh] overflow-auto rounded border border-gray-700">
            <table className="w-full table-fixed border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-950/90 text-[11px] text-gray-400">
                  <th className="w-[5.25rem] px-2 py-1.5 font-medium">進捗</th>
                  <th className="min-w-0 px-2 py-1.5 font-medium">お題・説明</th>
                </tr>
              </thead>
              <tbody>
                {themeListRowsSorted.map((t) => {
                  const dm = displayMissionForTheme(t.id, missions);
                  const isRowActive = dm?.status === 'active';
                  const count = dm?.entry_count ?? 0;
                  const statusLabel =
                    dm?.status === 'completed'
                      ? '完了'
                      : dm?.status === 'paused'
                        ? '一時解除'
                        : dm
                          ? '進行中'
                          : '—';
                  return (
                    <tr
                      key={t.id}
                      tabIndex={0}
                      role="button"
                      aria-pressed={isRowActive}
                      aria-label={`お題 ${t.label}。${isRowActive ? '進行中。クリックで一旦解除' : 'クリックで開始または再開'}`}
                      onClick={() => void toggleThemeRow(t.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          void toggleThemeRow(t.id);
                        }
                      }}
                      className={`cursor-pointer border-b border-gray-800/90 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-400/80 ${
                        isRowActive
                          ? 'bg-violet-950/45 ring-1 ring-inset ring-violet-500/40'
                          : 'hover:bg-gray-800/55'
                      } ${busy ? 'pointer-events-none opacity-50' : ''}`}
                    >
                      <td className="px-2 py-1.5 align-middle text-gray-200">
                        <div className="flex flex-col items-center gap-1">
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              isRowActive
                                ? 'bg-violet-600 text-white'
                                : dm?.status === 'paused'
                                  ? 'bg-gray-800 text-gray-300'
                                  : dm?.status === 'completed'
                                    ? 'bg-gray-800 text-lime-200/90'
                                    : 'bg-gray-800 text-gray-500'
                            }`}
                          >
                            {statusLabel}
                          </span>
                          <span className="font-mono tabular-nums text-[11px] text-gray-100 sm:text-xs">
                            {count}/{THEME_PLAYLIST_SLOT_TARGET}
                          </span>
                        </div>
                      </td>
                      <td className="min-w-0 px-2 py-1.5">
                        <div className="min-w-0">
                          {t.is_custom ? (
                            <div className="mb-1 flex w-full min-w-0 flex-wrap items-center gap-1.5">
                              <span className="shrink-0 rounded border border-amber-700/50 bg-amber-950/40 px-1.5 py-0.5 text-[10px] font-semibold text-amber-100">
                                オリジナル
                              </span>
                              {formatThemeCreatedDate(t.created_at) ? (
                                <span className="text-[10px] text-gray-500 tabular-nums">
                                  作成 {formatThemeCreatedDate(t.created_at)}
                                </span>
                              ) : null}
                              <button
                                type="button"
                                disabled={busy}
                                onClick={(e) => requestDeleteCustomTheme(t, e)}
                                className="ml-auto shrink-0 rounded border border-red-900/60 bg-red-950/35 px-1.5 py-0.5 text-[10px] font-medium text-red-200 hover:bg-red-900/50 disabled:opacity-40"
                              >
                                削除
                              </button>
                            </div>
                          ) : null}
                          <div className="truncate font-medium text-white" title={t.label}>
                            {t.label}
                          </div>
                          {t.description?.trim() ? (
                            <div
                              className="mt-0.5 truncate text-[11px] leading-snug text-gray-500"
                              title={t.description}
                            >
                              {t.description}
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedMission && (
        <div className="rounded border border-gray-700 bg-gray-900/30 p-3">
          <div className="mb-2 flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {selectedThemeMetaForDetail.row?.is_custom ? (
                  <>
                    <span className="shrink-0 rounded border border-amber-700/50 bg-amber-950/40 px-1.5 py-0.5 text-[10px] font-semibold text-amber-100">
                      オリジナル
                    </span>
                    {formatThemeCreatedDate(selectedThemeMetaForDetail.row.created_at) ? (
                      <span className="text-[10px] text-gray-500 tabular-nums">
                        作成 {formatThemeCreatedDate(selectedThemeMetaForDetail.row.created_at)}
                      </span>
                    ) : null}
                  </>
                ) : null}
                <span className="text-sm font-semibold text-white">{selectedMission.theme_label}</span>
                {isComplete ? (
                  <span className="rounded bg-lime-600/90 px-2 py-0.5 text-[11px] font-bold text-white">
                    コンプリート
                  </span>
                ) : isPaused ? (
                  <span className="rounded bg-gray-600/90 px-2 py-0.5 text-[11px] font-bold text-white">
                    一時解除中
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">
                    {progress}/{THEME_PLAYLIST_SLOT_TARGET} 曲
                  </span>
                )}
              </div>
            </div>
          </div>

          {selectedThemeMetaForDetail.descriptionFull ? (
            <p className="mb-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-400">
              {selectedThemeMetaForDetail.descriptionFull}
            </p>
          ) : null}

          {isPaused ? (
            <div className="rounded border border-gray-700/80 bg-gray-950/40 px-3 py-4 text-center">
              <p className="text-sm font-medium text-gray-200">現在、進行中のミッションはありません。</p>
              <p className="mt-2 text-xs leading-relaxed text-gray-400">
                上のお題一覧で同じお題の行をクリックすると、途中から再開できます。
              </p>
            </div>
          ) : (
            <>
              {isComplete ? (
                <p className="mb-2 text-xs text-lime-100/90">
                  このミッションは完了済みです。同じお題の行をクリックすると、新しい10曲用のセッションが始まります。
                </p>
              ) : null}
              <h4 className="sr-only">収録曲</h4>
              {!allowRecordedDelete && !isGuest ? (
                <p className="mb-2 text-[10px] text-amber-200/85">
                  収録曲の削除は<strong className="text-amber-100">チャットオーナー</strong>のみ利用できます。
                </p>
              ) : null}
              <div className="max-h-[50vh] overflow-auto rounded-lg border border-gray-700/90 bg-gray-950/50 p-2 text-[11px] sm:text-xs">
                {selectedMission.entries.length === 0 ? (
                  <p className="px-2 py-4 text-center text-sm text-gray-500">まだ収録がありません。</p>
                ) : (
                  <ul className="space-y-2" aria-label="収録曲一覧">
                    {selectedMission.entries.map((e) => {
                      const dt = new Date(e.created_at).toLocaleString('ja-JP', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      const yt = e.url || `https://www.youtube.com/watch?v=${encodeURIComponent(e.video_id)}`;
                      return (
                        <li
                          key={e.id}
                          className="overflow-hidden rounded-lg border border-gray-800 bg-gray-900/55 shadow-sm"
                          aria-label={`${e.slot_index}番目の収録`}
                        >
                          <div className="relative px-3 pt-2.5 pb-2">
                            <span
                              className="pointer-events-none absolute left-2 top-1/2 z-0 -translate-y-1/2 select-none font-black tabular-nums leading-none text-gray-500/[0.2] sm:text-gray-500/[0.24]"
                              style={{ fontSize: 'clamp(3rem, 14vw, 4.25rem)' }}
                              aria-hidden
                            >
                              {e.slot_index}
                            </span>
                            <div className="relative z-10 min-w-0 pl-10 sm:pl-11">
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span className="min-w-0 break-words font-medium leading-snug text-gray-50">
                                  {e.artist || '—'} — {e.title || e.video_id}
                                </span>
                                <a
                                  href={yt}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0 text-xs font-medium text-sky-400 hover:text-sky-300 hover:underline"
                                >
                                  YouTube
                                </a>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-800/90 pt-2 text-[11px]">
                                <time
                                  className="tabular-nums text-gray-500"
                                  dateTime={e.created_at}
                                  title={e.created_at}
                                >
                                  {dt}
                                </time>
                                <span className="font-medium text-gray-200">
                                  {e.selector_display_name?.trim() || '—'}
                                </span>
                                {allowRecordedDelete ? (
                                  <button
                                    type="button"
                                    disabled={busy || deletingEntryId === e.id}
                                    onClick={() => void deleteRecordedEntry(e.id)}
                                    className="ml-auto shrink-0 rounded-md border border-red-500/50 bg-red-950/50 px-2 py-1 text-[10px] font-semibold text-red-100 hover:border-red-400/70 hover:bg-red-900/60 disabled:opacity-40"
                                    title="収録からこの曲を削除"
                                  >
                                    {deletingEntryId === e.id ? '…' : '削除'}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          <div className="w-full border-t border-gray-800/90 bg-black/30 px-3 py-2.5">
                            <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-gray-400">
                              {e.ai_comment}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {toggleConfirmModal.open ? (
        <div
          className="fixed inset-0 z-[78] flex items-center justify-center bg-black/65 p-4"
          role="presentation"
          onClick={() => {
            if (!busy) {
              setToggleConfirmModal((prev) => ({ ...prev, open: false }));
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="toggle-theme-mission-title"
            className="w-full max-w-md rounded-lg border border-gray-600 bg-gray-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="toggle-theme-mission-title" className="text-sm font-semibold text-white">
              {toggleConfirmModal.action === 'pause' ? 'お題を一時解除' : 'お題を開始'}
            </h3>
            <p className="mt-3 text-xs leading-relaxed text-gray-300">
              「<span className="font-medium text-gray-100">{toggleConfirmModal.themeLabel}</span>」を
              {toggleConfirmModal.action === 'pause' ? '一時解除しますか？' : '開始しますか？'}
            </p>
            {toggleConfirmModal.action === 'start' && toggleConfirmModal.otherActiveThemeLabel ? (
              <p className="mt-2 text-xs leading-relaxed text-amber-200/90">
                開始すると、現在進行中の「
                <span className="font-medium text-amber-100">{toggleConfirmModal.otherActiveThemeLabel}</span>
                」は自動で一時解除されます。
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setToggleConfirmModal((prev) => ({ ...prev, open: false }))}
                className="rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700 disabled:opacity-40"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmToggleThemeRow()}
                className={`rounded px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 ${
                  toggleConfirmModal.action === 'pause' ? 'bg-gray-600 hover:bg-gray-500' : 'bg-violet-700 hover:bg-violet-600'
                }`}
              >
                {toggleConfirmModal.action === 'pause' ? '一時解除する' : '開始する'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteModal.open && deleteModal.theme ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4"
          role="presentation"
          onClick={() => {
            if (!busy) setDeleteModal({ open: false, theme: null, entryCount: 0 });
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-custom-theme-title"
            className="w-full max-w-md rounded-lg border border-gray-600 bg-gray-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-custom-theme-title" className="text-sm font-semibold text-white">
              オリジナルお題を削除
            </h3>
            <p className="mt-3 text-xs leading-relaxed text-gray-300">
              「<span className="font-medium text-gray-100">{deleteModal.theme.label}</span>
              」には登録済みの曲が <strong className="text-amber-100">{deleteModal.entryCount}</strong> 件あります。削除するとミッションと収録データはすべて消え、一覧からも消えます。この操作は取り消せません。
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeleteModal({ open: false, theme: null, entryCount: 0 })}
                className="rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700 disabled:opacity-40"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void executeDeleteCustomTheme(deleteModal.theme!.id)}
                className="rounded bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-40"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

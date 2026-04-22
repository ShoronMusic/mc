'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { THEME_PLAYLIST_SLOT_TARGET } from '@/lib/theme-playlist-definitions';
import { THEME_PLAYLIST_MISSION_CLIENT_CHANGED_EVENT } from '@/lib/theme-playlist-mission-client-events';

type ThemeRow = { id: string; label: string; description: string };

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
};
type ThemeListTab = 'preset' | 'create' | 'completed';

function notifyThemePlaylistMissionChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(THEME_PLAYLIST_MISSION_CLIENT_CHANGED_EVENT));
  }
}

export default function ThemePlaylistMissionPanel({ isGuest }: Props) {
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

  const load = useCallback(async () => {
    if (isGuest) return;
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
        return;
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
        if (prev && ms.some((m) => m.id === prev)) return prev;
        return firstActive?.id ?? null;
      });
    } catch {
      setLoadError('読み込みに失敗しました。');
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

  const startMission = async (themeId: string) => {
    setActionMessage(null);
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
      await load();
      if (data?.customTheme?.id) {
        await startMission(data.customTheme.id);
      }
      notifyThemePlaylistMissionChanged();
    } catch {
      setActionMessage('新規作成に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const pauseMission = async () => {
    if (!selectedMissionId) return;
    setActionMessage(null);
    setBusy(true);
    try {
      const res = await fetch('/api/user/theme-playlist-mission', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause', missionId: selectedMissionId }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setActionMessage(typeof data?.error === 'string' ? data.error : '一旦解除に失敗しました。');
        return;
      }
      setActionMessage('ミッションを一旦解除しました。後で開始/再開で続きを再開できます。');
      await load();
      notifyThemePlaylistMissionChanged();
    } catch {
      setActionMessage('一旦解除に失敗しました。');
    } finally {
      setBusy(false);
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
        <h3 className="mb-2 text-sm font-medium text-gray-200">お題一覧（開始）</h3>
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
            <table className="w-full border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-950/90 text-[11px] text-gray-400">
                  <th className="px-2 py-1.5 font-medium">お題</th>
                  <th className="hidden px-2 py-1.5 font-medium sm:table-cell">説明</th>
                  <th className="w-28 px-2 py-1.5 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {[...customThemes, ...presetThemes].map((t) => (
                  <tr key={t.id} className="border-b border-gray-800/90">
                    <td className="px-2 py-1.5 font-medium text-white">{t.label}</td>
                    <td className="hidden px-2 py-1.5 text-gray-500 sm:table-cell">{t.description}</td>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void startMission(t.id)}
                        className="rounded bg-violet-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-violet-700 disabled:opacity-40"
                      >
                        開始/再開
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-200">ミッション選択</h3>
        {missions.length === 0 ? (
          <p className="text-xs text-gray-500">まだミッションがありません。上の表からお題を開始してください。</p>
        ) : (
          <div className="max-h-[40vh] overflow-auto rounded border border-gray-700">
            <table className="w-full border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-950/90 text-[11px] text-gray-400">
                  <th className="w-10 px-2 py-1.5 font-medium">選</th>
                  <th className="px-2 py-1.5 font-medium">お題</th>
                  <th className="w-24 px-2 py-1.5 font-medium">状態</th>
                  <th className="w-16 px-2 py-1.5 font-medium">進捗</th>
                </tr>
              </thead>
              <tbody>
                {missions.map((m) => (
                  <tr
                    key={m.id}
                    className={`border-b border-gray-800/90 ${
                      selectedMissionId === m.id ? 'bg-violet-950/30' : ''
                    }`}
                  >
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="radio"
                        name="theme-mission-my"
                        checked={selectedMissionId === m.id}
                        onChange={() => setSelectedMissionId(m.id)}
                        className="accent-violet-500"
                        aria-label={`ミッション ${m.theme_label}`}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-gray-100">{m.theme_label}</td>
                    <td className="px-2 py-1.5 text-gray-400">
                      {m.status === 'completed' ? '完了' : m.status === 'paused' ? '一時解除' : '進行中'}
                    </td>
                    <td className="px-2 py-1.5 text-gray-300">
                      {m.entry_count}/{THEME_PLAYLIST_SLOT_TARGET}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedMission && (
        <div className="rounded border border-gray-700 bg-gray-900/30 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
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
            {!isComplete && isActive ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void pauseMission()}
                className="rounded border border-gray-600 bg-gray-800 px-2 py-1 text-[11px] font-medium text-gray-200 hover:bg-gray-700 disabled:opacity-40"
              >
                一旦解除
              </button>
            ) : null}
          </div>

          {!isComplete && isActive ? (
            <p className="mb-2 text-xs text-gray-300/90">
              URL入力欄は廃止しました。部屋の発言欄で URL を貼り、<strong className="text-gray-200">お題曲送信（β）</strong> を押して追加してください。
            </p>
          ) : isPaused ? (
            <p className="mb-2 text-xs text-gray-300/90">
              このミッションは一旦解除中です。上のお題一覧で同じお題の「開始/再開」を押すと途中から再開できます。
            </p>
          ) : (
            <p className="mb-2 text-xs text-lime-100/90">
              このミッションは完了済みです。同じお題で再度「開始/再開」すると、新しい10曲用のセッションが始まります。
            </p>
          )}

          <h4 className="mb-1 text-[11px] font-medium text-gray-400">収録曲</h4>
          <div className="max-h-[50vh] overflow-auto rounded border border-gray-800">
            <table className="w-full border-collapse text-left text-[11px] sm:text-xs">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-950/90 text-gray-500">
                  <th className="w-8 px-1 py-1 font-medium">#</th>
                  <th className="px-1 py-1 font-medium">曲</th>
                  <th className="w-28 px-1 py-1 font-medium">選曲者</th>
                  <th className="w-32 px-1 py-1 font-medium">日時</th>
                  <th className="px-1 py-1 font-medium">AI総評</th>
                </tr>
              </thead>
              <tbody>
                {selectedMission.entries.map((e) => (
                  <tr key={e.id} className="border-b border-gray-800/80 align-top">
                    <td className="px-1 py-1 text-gray-500">{e.slot_index}</td>
                    <td className="px-1 py-1 text-gray-100">
                      <div>{e.artist || '—'} — {e.title || e.video_id}</div>
                      <a
                        href={e.url || `https://www.youtube.com/watch?v=${encodeURIComponent(e.video_id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-300 hover:underline"
                      >
                        YouTube
                      </a>
                    </td>
                    <td className="px-1 py-1 text-gray-300">{e.selector_display_name?.trim() || '—'}</td>
                    <td className="px-1 py-1 text-gray-400">
                      {new Date(e.created_at).toLocaleString('ja-JP', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-1 py-1 leading-snug text-gray-400">{e.ai_comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

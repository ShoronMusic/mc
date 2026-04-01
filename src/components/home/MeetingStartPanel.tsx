'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { GUEST_STORAGE_KEY } from '@/components/auth/JoinChoice';

const DEFAULT_ROOM_IDS = ['01', '02', '03'] as const;

/**
 * ログイン済みユーザー向け: 会の開始・終了（運用・検証用の最小UI）
 */
export function MeetingStartPanel() {
  const [visible, setVisible] = useState(false);
  const [roomId, setRoomId] = useState<string>(DEFAULT_ROOM_IDS[0]);
  const [title, setTitle] = useState('本日の会');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(GUEST_STORAGE_KEY)) {
      setVisible(false);
      return;
    }
    const supabase = createClient();
    if (!isSupabaseConfigured() || !supabase) {
      setVisible(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setVisible(!!session?.user);
    });
  }, []);

  const run = useCallback(
    async (action: 'start' | 'end') => {
      setMessage(null);
      setBusy(true);
      try {
        const res = await fetch('/api/room-gatherings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action,
            roomId,
            ...(action === 'start' ? { title: title.trim() || '未設定の会' } : {}),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
        if (!res.ok) {
          setMessage(data?.error ?? '処理に失敗しました。');
          return;
        }
        setMessage(action === 'start' ? '会を開始しました。一覧が更新されるまで数秒お待ちください。' : '会を終了しました。');
        window.setTimeout(() => window.location.reload(), 600);
      } catch {
        setMessage('通信に失敗しました。');
      } finally {
        setBusy(false);
      }
    },
    [roomId, title],
  );

  if (!visible) return null;

  return (
    <div className="mt-4 rounded-lg border border-dashed border-gray-600 bg-gray-900/60 px-3 py-3">
      <p className="mb-2 text-center text-[11px] font-medium text-gray-400">主催者向け（ログイン中のみ表示）</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-center">
        <label className="flex flex-col gap-0.5 text-xs text-gray-400">
          ルーム
          <select
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-sm text-white"
            disabled={busy}
          >
            {DEFAULT_ROOM_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-xs text-gray-400">
          会のタイトル
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-sm text-white"
            disabled={busy}
            placeholder="例: 土曜洋楽会"
          />
        </label>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={() => void run('start')}
          disabled={busy}
          className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          会を開始
        </button>
        <button
          type="button"
          onClick={() => void run('end')}
          disabled={busy}
          className="rounded border border-gray-500 bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 disabled:opacity-50"
        >
          このルームの会を終了
        </button>
      </div>
      {message && <p className="mt-2 text-center text-xs text-gray-300">{message}</p>}
    </div>
  );
}

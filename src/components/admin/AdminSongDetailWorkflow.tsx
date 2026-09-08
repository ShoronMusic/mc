'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';

export type AdminSongDetailSectionKey = 'basic' | 'intro' | 'spotify';
type ActionKey = AdminSongDetailSectionKey | 'introGenerate';

type ActionFn = () => Promise<boolean>;

type WorkflowContextValue = {
  hideInlineActions: boolean;
  setFilled: (key: AdminSongDetailSectionKey, filled: boolean) => void;
  registerAction: (key: ActionKey, fn: ActionFn | null) => void;
};

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

export function useAdminSongDetailWorkflow(): WorkflowContextValue | null {
  return useContext(WorkflowContext);
}

const SECTION_META: {
  key: AdminSongDetailSectionKey;
  label: string;
  href: string;
  doneClass: string;
}[] = [
  {
    key: 'basic',
    label: '基本情報',
    href: '#style-edit',
    doneClass: 'bg-emerald-700 text-white',
  },
  {
    key: 'intro',
    label: '曲紹介',
    href: '#music8-intro',
    doneClass: 'bg-amber-600 text-black',
  },
  {
    key: 'spotify',
    label: 'Spotify',
    href: '#spotify-meta',
    doneClass: 'bg-green-700 text-white',
  },
];

type Props = {
  children: ReactNode;
  initialBasicFilled: boolean;
  initialIntroFilled: boolean;
  initialSpotifyFilled: boolean;
};

export function AdminSongDetailWorkflow({
  children,
  initialBasicFilled,
  initialIntroFilled,
  initialSpotifyFilled,
}: Props) {
  const router = useRouter();
  const [filled, setFilledState] = useState({
    basic: initialBasicFilled,
    intro: initialIntroFilled,
    spotify: initialSpotifyFilled,
  });
  const [busy, setBusy] = useState<'idle' | 'save' | 'intro' | 'spotify' | 'both'>('idle');
  const [msg, setMsg] = useState<string | null>(null);
  const actions = useRef<Partial<Record<ActionKey, ActionFn>>>({});

  const setFilled = useCallback((key: AdminSongDetailSectionKey, value: boolean) => {
    setFilledState((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

  const registerAction = useCallback((key: ActionKey, fn: ActionFn | null) => {
    if (fn) actions.current[key] = fn;
    else delete actions.current[key];
  }, []);

  const ctx = useMemo(
    () => ({ hideInlineActions: true, setFilled, registerAction }),
    [setFilled, registerAction],
  );

  async function saveAll() {
    setBusy('save');
    setMsg(null);
    try {
      const basicOk = (await actions.current.basic?.()) ?? true;
      const introOk = (await actions.current.intro?.()) ?? true;
      if (!basicOk || !introOk) {
        setMsg(!basicOk ? '基本情報の保存に失敗しました。' : '曲紹介の保存に失敗しました。');
        return;
      }
      setMsg('保存しました。');
      router.refresh();
    } catch {
      setMsg('保存に失敗しました。');
    } finally {
      setBusy('idle');
    }
  }

  async function fetchIntro() {
    setBusy('intro');
    setMsg(null);
    try {
      const ok = (await actions.current.introGenerate?.()) ?? false;
      if (!ok) {
        setMsg('曲紹介の取得を確認してください（下の曲紹介欄のメッセージ）。');
        return;
      }
      setMsg('曲紹介を取得しました。内容を確認して「保存」してください。');
    } catch {
      setMsg('曲紹介の取得に失敗しました。');
    } finally {
      setBusy('idle');
    }
  }

  async function fetchSpotify() {
    setBusy('spotify');
    setMsg(null);
    try {
      const ok = (await actions.current.spotify?.()) ?? false;
      if (!ok) {
        setMsg('Spotify 取得を確認してください（下の Spotify 欄のメッセージ）。');
        return;
      }
      setMsg('Spotify を取得しました。');
      router.refresh();
    } catch {
      setMsg('Spotify 取得に失敗しました。');
    } finally {
      setBusy('idle');
    }
  }

  async function fetchIntroAndSpotify() {
    setBusy('both');
    setMsg(null);
    try {
      const [introOk, spotifyOk] = await Promise.all([
        actions.current.introGenerate?.() ?? Promise.resolve(false),
        actions.current.spotify?.() ?? Promise.resolve(false),
      ]);
      if (!introOk && !spotifyOk) {
        setMsg('曲紹介・Spotify とも取得できませんでした。各欄のメッセージを確認してください。');
        return;
      }
      if (!introOk) {
        setMsg('Spotify は取得しましたが、曲紹介の取得を確認してください。');
        router.refresh();
        return;
      }
      if (!spotifyOk) {
        setMsg(
          '曲紹介は取得しました。Spotify は確認してください（下の Spotify 欄）。曲紹介は「保存」で確定します。',
        );
        return;
      }
      setMsg('曲紹介と Spotify を取得しました。曲紹介は内容を確認して「保存」してください。');
      router.refresh();
    } catch {
      setMsg('曲紹介＆Spotify の取得に失敗しました。');
    } finally {
      setBusy('idle');
    }
  }

  return (
    <WorkflowContext.Provider value={ctx}>
      <div
        className="sticky top-0 z-40 -mx-4 mb-3 border-b border-gray-700 bg-gray-950/95 px-4 py-2.5 shadow-[0_10px_18px_-12px_rgba(0,0,0,0.85)] backdrop-blur"
        role="region"
        aria-label="曲詳細の保存状況"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] text-gray-500">保存状況</span>
          {SECTION_META.map((s) => {
            const done = filled[s.key];
            return (
              <a
                key={s.key}
                href={s.href}
                aria-label={`${s.label} ${done ? '済' : '未'}`}
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium ${
                  done ? s.doneClass : 'bg-gray-900 text-gray-400 ring-1 ring-gray-700'
                }`}
              >
                <span>{s.label}</span>
                <span className={done ? 'opacity-90' : 'text-gray-500'}>{done ? '済' : '未'}</span>
              </a>
            );
          })}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy !== 'idle'}
              onClick={() => void fetchIntroAndSpotify()}
              className="rounded border border-sky-700 bg-sky-950/50 px-3 py-1.5 text-xs font-medium text-sky-100 hover:bg-sky-900/60 disabled:opacity-50"
            >
              {busy === 'both' ? '取得中…' : '曲紹介＆Spotify取得'}
            </button>
            <button
              type="button"
              disabled={busy !== 'idle'}
              onClick={() => void fetchIntro()}
              className="rounded border border-amber-800 bg-amber-950/50 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-900/60 disabled:opacity-50"
            >
              {busy === 'intro' ? '取得中…' : '曲紹介取得'}
            </button>
            {!filled.spotify ? (
              <button
                type="button"
                disabled={busy !== 'idle'}
                onClick={() => void fetchSpotify()}
                className="rounded border border-green-800 bg-green-950/50 px-3 py-1.5 text-xs font-medium text-green-100 hover:bg-green-900/60 disabled:opacity-50"
              >
                {busy === 'spotify' ? '処理中…' : 'Spotify 取得'}
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy !== 'idle'}
              onClick={() => void saveAll()}
              className="rounded bg-emerald-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy === 'save' ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
        {msg ? (
          <p className="mt-1.5 text-[11px] text-amber-200" role="status">
            {msg}
          </p>
        ) : null}
      </div>
      {children}
    </WorkflowContext.Provider>
  );
}

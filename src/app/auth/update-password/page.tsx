'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const PASSWORD_MIN_LENGTH = 6;

export default function UpdatePasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = createClient();
    if (!client) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    client.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) {
        setHasSession(!!session);
        setChecking(false);
      }
    });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setHasSession(!!session);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!supabase) return;
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`パスワードは${PASSWORD_MIN_LENGTH}文字以上にしてください。`);
      return;
    }
    if (password !== passwordConfirm) {
      setError('パスワードが一致しません。');
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      router.push('/');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'パスワードの更新に失敗しました。';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!supabase) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 p-4 text-gray-300">
        <p>Supabase が未設定です。.env.local を確認してください。</p>
        <Link href="/" className="mt-4 text-amber-500 underline hover:text-amber-400">
          トップへ
        </Link>
      </div>
    );
  }

  if (checking) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 p-4 text-gray-300">
        読み込み中…
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-gray-950 p-4 text-gray-300">
        <h1 className="mb-3 text-lg font-semibold text-white">パスワード再設定</h1>
        <p className="text-sm leading-relaxed text-gray-400">
          リンクの有効期限が切れているか、セッションを確認できませんでした。パスワード再設定メールのリンクをもう一度開くか、ルーム参加画面の「パスワードをお忘れですか？」からやり直してください。
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-center text-sm text-amber-500 underline hover:text-amber-400"
        >
          トップへ
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-700 bg-gray-900 p-6">
        <h1 className="mb-2 text-lg font-semibold text-white">新しいパスワードを設定</h1>
        <p className="mb-4 text-sm text-gray-400">新しいパスワードを入力して完了してください。</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-300">新しいパスワード</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`${PASSWORD_MIN_LENGTH}文字以上`}
              minLength={PASSWORD_MIN_LENGTH}
              className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-white placeholder-gray-500"
              autoComplete="new-password"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-300">パスワード（確認）</span>
            <input
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              placeholder="もう一度入力"
              minLength={PASSWORD_MIN_LENGTH}
              className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-white placeholder-gray-500"
              autoComplete="new-password"
            />
          </label>
          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-amber-600 px-3 py-2 font-medium text-white transition hover:bg-amber-500 disabled:opacity-50"
          >
            {loading ? '更新中…' : 'パスワードを更新'}
          </button>
        </form>
        <Link
          href="/"
          className="mt-4 block text-center text-sm text-gray-400 underline hover:text-gray-300"
        >
          トップへ
        </Link>
      </div>
    </div>
  );
}

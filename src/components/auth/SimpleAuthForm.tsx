'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface SimpleAuthFormProps {
  onSuccess: (displayName: string) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}

export function SimpleAuthForm({ onSuccess, onCancel, onError }: SimpleAuthFormProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const supabase = createClient();
  if (!supabase) return null;

  const PASSWORD_MIN_LENGTH = 6;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    onError('');
    if (!email.trim() || !password.trim()) {
      onError('メールとパスワードを入力してください。');
      return;
    }
    if (!isLogin) {
      if (!displayName.trim()) {
        onError('表示名を入力してください。');
        return;
      }
      if (password.length < PASSWORD_MIN_LENGTH) {
        onError('パスワードは6文字以上にしてください。');
        return;
      }
    }
    setLoading(true);
    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        const name =
          data.user?.user_metadata?.display_name ??
          data.user?.user_metadata?.name ??
          data.user?.email?.split('@')[0] ??
          'ユーザー';
        onSuccess(name);
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: displayName.trim() || email.split('@')[0] },
          },
        });
        if (error) throw error;
        const name =
          data.user?.user_metadata?.display_name ??
          data.user?.user_metadata?.name ??
          data.user?.email?.split('@')[0] ??
          'ユーザー';
        onSuccess(name);
      }
    } catch (err: unknown) {
      let msg = err instanceof Error ? err.message : '登録・ログインに失敗しました。';
      if (msg.includes('already registered') || msg.includes('User already registered')) {
        msg = 'このメールアドレスはすでに登録されています。ログインしてください。';
      } else if (msg.includes('Password') && msg.toLowerCase().includes('length')) {
        msg = 'パスワードは6文字以上にしてください。';
      } else if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials')) {
        msg = 'メールアドレスまたはパスワードが違います。パスワードを確認するか、Supabase で「メール確認」を有効にしている場合は確認メールのリンクをクリックしてから再度ログインしてください。';
      }
      onError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {!isLogin && (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-300">表示名</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="チャットで表示する名前"
            className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-white placeholder-gray-500"
            autoComplete="nickname"
          />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-sm text-gray-300">メールアドレス</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="example@email.com"
          className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-white placeholder-gray-500"
          autoComplete="email"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-gray-300">パスワード</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="6文字以上"
          minLength={isLogin ? undefined : PASSWORD_MIN_LENGTH}
          className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-white placeholder-gray-500"
          autoComplete={isLogin ? 'current-password' : 'new-password'}
        />
        {!isLogin && (
          <span className="text-xs text-gray-500">6文字以上で設定してください</span>
        )}
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-lg bg-amber-600 px-3 py-2 font-medium text-white transition hover:bg-amber-500 disabled:opacity-50"
        >
          {loading ? '送信中…' : isLogin ? 'ログイン' : '登録'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-600 px-3 py-2 text-gray-300 hover:bg-gray-800"
        >
          キャンセル
        </button>
      </div>
      <button
        type="button"
        onClick={() => setIsLogin((v) => !v)}
        className="text-center text-sm text-gray-400 underline hover:text-gray-300"
      >
        {isLogin ? 'アカウントを作成する' : 'すでに登録済みの方はログイン'}
      </button>
    </form>
  );
}

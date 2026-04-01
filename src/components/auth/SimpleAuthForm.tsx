'use client';

import { useState } from 'react';
import { getBrowserAppOrigin } from '@/lib/app-origin';
import { createClient } from '@/lib/supabase/client';

interface SimpleAuthFormProps {
  onSuccess: (displayName: string) => void;
  onCancel: () => void;
  onError: (message: string) => void;
  /** メール確認が有効なプロジェクトでは signUp 直後に session が無い。このとき案内のみ（ログインは確認後） */
  onAwaitingEmailConfirmation?: (email: string) => void;
  /** パスワードリセットメール送信後（ログイン画面からの「パスワードをお忘れ」） */
  onResetEmailSent?: (email: string) => void;
}

export function SimpleAuthForm({
  onSuccess,
  onCancel,
  onError,
  onAwaitingEmailConfirmation,
  onResetEmailSent,
}: SimpleAuthFormProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const supabase = createClient();
  if (!supabase) return null;

  const PASSWORD_MIN_LENGTH = 6;

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    onError('');
    if (!email.trim()) {
      onError('メールアドレスを入力してください。');
      return;
    }
    const origin = getBrowserAppOrigin();
    if (!origin) {
      onError('ブラウザで再度お試しください。');
      return;
    }
    setLoading(true);
    try {
      const next = '/auth/update-password';
      const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) throw error;
      onResetEmailSent?.(email.trim());
      setForgotPassword(false);
    } catch (err: unknown) {
      let msg =
        err instanceof Error ? err.message : 'リセット用メールの送信に失敗しました。しばらくしてから再度お試しください。';
      if (msg.toLowerCase().includes('rate limit') || msg.includes('429')) {
        msg = '送信が多すぎます。しばらく時間をおいてから再度お試しください。';
      }
      onError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    onError('');
    if (forgotPassword) {
      await handleForgotSubmit(e);
      return;
    }
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
        if (data.session) {
          onSuccess(name);
        } else if (data.user && onAwaitingEmailConfirmation) {
          onAwaitingEmailConfirmation(email.trim());
        } else if (data.user) {
          onError(
            '登録は完了しましたが、まだログインできません。Supabase でメール確認が有効な場合、届いたメールのリンクを開いてからログインしてください。'
          );
        } else {
          onError('登録に失敗しました。しばらくしてから再度お試しください。');
        }
      }
    } catch (err: unknown) {
      let msg = err instanceof Error ? err.message : '登録・ログインに失敗しました。';
      if (msg.includes('already registered') || msg.includes('User already registered')) {
        msg = 'このメールアドレスはすでに登録されています。ログインしてください。';
      } else if (msg.includes('Password') && msg.toLowerCase().includes('length')) {
        msg = 'パスワードは6文字以上にしてください。';
      } else if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials')) {
        msg =
          'ログインできませんでした。パスワードを確認するか、まだ登録していない場合は下の「アカウントを持っていない方は新規登録」から登録してください（未登録のメールでも同じ表示になることがあります）。メール確認を有効にしている場合は、確認メールのリンクを開いてからログインしてください。';
      } else if (msg.toLowerCase().includes('email not confirmed')) {
        msg =
          'メールアドレスの確認が済んでいません。受信トレイ（迷惑メールフォルダも）の確認リンクを開いてから、もう一度ログインしてください。';
      } else if (msg.toLowerCase().includes('signup') && msg.toLowerCase().includes('disabled')) {
        msg = 'このプロジェクトでは新規のメール登録が無効になっています。Supabase の Authentication 設定を確認するか、Google 認証をお使いください。';
      }
      onError(msg);
    } finally {
      setLoading(false);
    }
  };

  const heading = forgotPassword
    ? 'パスワードの再設定'
    : isLogin
      ? 'メールアドレスでログイン'
      : 'メールアドレスで新規登録';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-white">{heading}</h2>
      {forgotPassword && (
        <p className="text-sm text-gray-400">
          登録したメールアドレスに、パスワード再設定用のリンクを送ります（届かない場合は迷惑メールフォルダもご確認ください）。
        </p>
      )}
      {!isLogin && !forgotPassword && (
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
      {!forgotPassword && (
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
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-lg bg-amber-600 px-3 py-2 font-medium text-white transition hover:bg-amber-500 disabled:opacity-50"
        >
          {loading
            ? '送信中…'
            : forgotPassword
              ? 'リセット用メールを送る'
              : isLogin
                ? 'ログイン'
                : '登録'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-600 px-3 py-2 text-gray-300 hover:bg-gray-800"
        >
          キャンセル
        </button>
      </div>
      {isLogin && !forgotPassword && (
        <button
          type="button"
          onClick={() => {
            onError('');
            setForgotPassword(true);
          }}
          className="text-center text-sm text-gray-400 underline hover:text-gray-300"
        >
          パスワードをお忘れですか？
        </button>
      )}
      {forgotPassword && (
        <button
          type="button"
          onClick={() => {
            onError('');
            setForgotPassword(false);
          }}
          className="text-center text-sm text-gray-400 underline hover:text-gray-300"
        >
          ログイン画面に戻る
        </button>
      )}
      {!forgotPassword && (
        <>
          <div className="border-t border-gray-600 pt-3" role="separator" />
          <button
            type="button"
            onClick={() => {
              onError('');
              setIsLogin((v) => !v);
            }}
            className="text-center text-sm text-blue-400 underline underline-offset-2 hover:text-blue-300"
          >
            {isLogin ? 'アカウントを持っていない方は新規登録' : 'すでに登録済みの方はログイン'}
          </button>
        </>
      )}
    </form>
  );
}

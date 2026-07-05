'use client';

import { useEffect, useState } from 'react';
import { getBrowserAppOrigin } from '@/lib/app-origin';
import {
  buildEmailConfirmRedirectUrl,
  isUserEmailConfirmed,
  requiresEmailConfirmation,
} from '@/lib/supabase-email-auth';
import {
  isPasswordLongEnough,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_HINT,
  passwordTooShortMessage,
} from '@/lib/auth-password-policy';
import type { BrowserSupabaseClient } from '@/lib/supabase/load-browser-client';
import { loadBrowserSupabaseClient } from '@/lib/supabase/load-browser-client';

interface SimpleAuthFormProps {
  onSuccess: (displayName: string) => void;
  onCancel: () => void;
  onError: (message: string) => void;
  /** メール確認が有効なプロジェクトでは signUp 直後に session が無い。このとき案内のみ（ログインは確認後） */
  onAwaitingEmailConfirmation?: (email: string) => void;
  /** パスワードリセットメール送信後（ログイン画面からの「パスワードをお忘れ」） */
  onResetEmailSent?: (email: string) => void;
  /** true のとき初回表示を新規登録にする（ゲスト向け「メールで登録」導線など） */
  startWithRegister?: boolean;
  /** 確認メールリンク完了後の戻り先（例: `/01`）。未指定時は現在のパス */
  emailConfirmRedirectPath?: string;
}

export function SimpleAuthForm({
  onSuccess,
  onCancel,
  onError,
  onAwaitingEmailConfirmation,
  onResetEmailSent,
  startWithRegister = false,
  emailConfirmRedirectPath,
}: SimpleAuthFormProps) {
  const [isLogin, setIsLogin] = useState(!startWithRegister);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [awaitingEmailConfirmation, setAwaitingEmailConfirmation] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [supabase, setSupabase] = useState<BrowserSupabaseClient | null>(null);

  useEffect(() => {
    let active = true;
    void loadBrowserSupabaseClient().then(({ client }) => {
      if (!active) return;
      setSupabase(client);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!supabase) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-gray-400">フォームを読み込んでいます…</p>
      </div>
    );
  }

  const resolveEmailConfirmRedirectPath = (): string => {
    if (emailConfirmRedirectPath) return emailConfirmRedirectPath;
    if (typeof window !== 'undefined') return window.location.pathname || '/';
    return '/';
  };

  const notifyAwaitingEmailConfirmation = (address: string) => {
    setAwaitingEmailConfirmation(true);
    setResendNotice(null);
    onAwaitingEmailConfirmation?.(address);
  };

  const handleResendConfirmation = async () => {
    onError('');
    setResendNotice(null);
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
      const emailRedirectTo = buildEmailConfirmRedirectUrl(resolveEmailConfirmRedirectPath(), origin);
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo },
      });
      if (error) throw error;
      setResendNotice('確認メールを再送信しました。迷惑メールフォルダもご確認ください。');
    } catch (err: unknown) {
      let msg =
        err instanceof Error ? err.message : '確認メールの再送信に失敗しました。しばらくしてから再度お試しください。';
      if (msg.toLowerCase().includes('rate limit') || msg.includes('429')) {
        msg = '送信が多すぎます。しばらく時間をおいてから再度お試しください。';
      }
      onError(msg);
    } finally {
      setLoading(false);
    }
  };

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
      /** next クエリがメール経由で欠落するとトップへ飛び入力画面に届かないため、専用コールバックにする */
      const redirectTo = `${origin}/auth/recover-callback`;
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
      if (!isPasswordLongEnough(password)) {
        onError(passwordTooShortMessage());
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
        if (data.user && requiresEmailConfirmation(data.user)) {
          await supabase.auth.signOut();
          throw new Error('Email not confirmed');
        }
        const name =
          data.user?.user_metadata?.display_name ??
          data.user?.user_metadata?.name ??
          data.user?.email?.split('@')[0] ??
          'ユーザー';
        onSuccess(name);
      } else {
        const origin = getBrowserAppOrigin();
        if (!origin) {
          onError('ブラウザで再度お試しください。');
          return;
        }
        const emailRedirectTo = buildEmailConfirmRedirectUrl(resolveEmailConfirmRedirectPath(), origin);
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: displayName.trim() || email.split('@')[0] },
            emailRedirectTo,
          },
        });
        if (error) throw error;
        const name =
          data.user?.user_metadata?.display_name ??
          data.user?.user_metadata?.name ??
          data.user?.email?.split('@')[0] ??
          'ユーザー';
        if (data.session && data.user && isUserEmailConfirmed(data.user)) {
          onSuccess(name);
        } else if (data.session && data.user) {
          await supabase.auth.signOut();
          notifyAwaitingEmailConfirmation(email.trim());
        } else if (data.user && onAwaitingEmailConfirmation) {
          notifyAwaitingEmailConfirmation(email.trim());
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
        msg = passwordTooShortMessage();
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
        <p className="text-xs leading-relaxed text-gray-500">
          登録後、入力したメールアドレス宛に確認メールを送ります。リンクを開いて確認が完了してからログインしてください。
        </p>
      )}
      {!isLogin && !forgotPassword && (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-300">表示名</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="チャットで表示する名前（登録後に変更可能）"
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
            placeholder={PASSWORD_POLICY_HINT}
            minLength={isLogin ? undefined : PASSWORD_MIN_LENGTH}
            className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-white placeholder-gray-500"
            autoComplete={isLogin ? 'current-password' : 'new-password'}
          />
          {!isLogin && (
            <span className="text-xs text-gray-500">{PASSWORD_POLICY_HINT}</span>
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
      {awaitingEmailConfirmation && (
        <div className="rounded-lg border border-emerald-800/60 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
          <p>確認メールを送信しました。リンクを開いたあと「すでに登録済みの方はログイン」からログインしてください。</p>
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleResendConfirmation()}
            className="mt-2 text-sm text-emerald-300 underline underline-offset-2 hover:text-emerald-200 disabled:opacity-50"
          >
            確認メールを再送信
          </button>
          {resendNotice && (
            <p className="mt-2 text-xs text-emerald-300/90" role="status">
              {resendNotice}
            </p>
          )}
        </div>
      )}
      {!forgotPassword && (
        <>
          <div className="border-t border-gray-600 pt-3" role="separator" />
          <button
            type="button"
            onClick={() => {
              onError('');
              setAwaitingEmailConfirmation(false);
              setResendNotice(null);
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

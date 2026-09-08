'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminSongMusic8IntroResponse } from '@/lib/admin-song-music8-intro-types';
import { useAdminSongDetailWorkflow } from '@/components/admin/AdminSongDetailWorkflow';
import { isAdminSongIntroFilled } from '@/lib/admin-song-detail-status';

type Props = {
  songId: string;
  initialIntro: string | null;
};

export function AdminSongMusic8IntroPanel({ songId, initialIntro }: Props) {
  const router = useRouter();
  const workflow = useAdminSongDetailWorkflow();
  const [text, setText] = useState(initialIntro ?? '');
  const [busy, setBusy] = useState<'idle' | 'generate' | 'save'>('idle');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setText(initialIntro ?? '');
  }, [initialIntro]);

  useEffect(() => {
    workflow?.setFilled('intro', isAdminSongIntroFilled(text));
  }, [workflow, text]);

  async function run(action: 'generate' | 'save'): Promise<boolean> {
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/song-music8-intro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          songId,
          action,
          ...(action === 'save' ? { text } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as AdminSongMusic8IntroResponse;
      if (!res.ok) {
        setMsg(data.error || '失敗しました。');
        return false;
      }
      if (action === 'generate') {
        if (data.text) setText(data.text);
        setMsg(
          data.incomplete
            ? '取得しましたが字数が足りないか途中切れです。もう一度「Gemini で取得」を押してください。'
            : 'Gemini から取得しました。内容を確認して保存してください。',
        );
        return true;
      }
      setMsg('保存しました。');
      if (!workflow) router.refresh();
      return true;
    } catch {
      setMsg('失敗しました。');
      return false;
    } finally {
      setBusy('idle');
    }
  }

  useEffect(() => {
    if (!workflow) return;
    workflow.registerAction('intro', () => run('save'));
    workflow.registerAction('introGenerate', () => run('generate'));
    return () => {
      workflow.registerAction('intro', null);
      workflow.registerAction('introGenerate', null);
    };
  });

  return (
    <div id="music8-intro" className="mt-4 scroll-mt-20 rounded border border-amber-900/50 bg-amber-950/10 p-3">
      <h3 className="text-sm font-semibold text-amber-100">Music8 曲紹介（本文）</h3>
      <p className="mt-1 text-xs text-gray-400">
        WP 新規投稿の「Send to Gemini」相当。公開サイトの曲紹介（180〜220字・言い切り調）を生成します。部屋チャットの曲解説とは別です。保存すると部屋ライブラリの曲詳細にすぐ出ます（Music8 公開 JSON は週次エクスポート後）。
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        className="mt-3 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm leading-relaxed text-gray-100 focus:border-amber-700 focus:outline-none"
        placeholder="Gemini で取得するか、手で入力します。"
      />
      <p className="mt-1 text-[11px] text-gray-500">
        {text.trim().length} 字
        {workflow ? ' · 取得は上部バーの「曲紹介取得」、保存は「保存」です。' : ''}
      </p>
      {msg ? (
        <p className="mt-2 text-xs text-amber-200" role="status">
          {msg}
        </p>
      ) : null}
      {workflow ? null : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== 'idle'}
            onClick={() => void run('generate')}
            className="rounded bg-amber-700 px-3 py-1.5 text-sm font-medium text-black hover:bg-amber-600 disabled:opacity-50"
          >
            {busy === 'generate' ? 'Gemini 生成中…' : 'Gemini で取得'}
          </button>
          <button
            type="button"
            disabled={busy !== 'idle'}
            onClick={() => void run('save')}
            className="rounded border border-amber-800 bg-gray-950 px-3 py-1.5 text-sm text-amber-100 hover:bg-amber-950/40 disabled:opacity-50"
          >
            {busy === 'save' ? '保存中…' : '本文を保存'}
          </button>
        </div>
      )}
    </div>
  );
}

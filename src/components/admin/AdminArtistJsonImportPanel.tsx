'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function buildDefaultArtistJsonUrl(artistName: string): string {
  const slug = artistName
    .trim()
    .replace(/^\s*(?:The|A|An)\s+/i, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`]/g, '')
    .replace(/[^A-Za-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `https://xs867261.xsrv.jp/data/data/artists/${slug || 'unknown'}.json`;
}

export function AdminArtistJsonImportPanel({ artistName }: { artistName: string }) {
  const router = useRouter();
  const [jsonText, setJsonText] = useState('');
  const [jsonUrl, setJsonUrl] = useState(buildDefaultArtistJsonUrl(artistName));
  const [submitting, setSubmitting] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = jsonText.trim().length > 0;

  const loadSampleFromUrl = async () => {
    const url = jsonUrl.trim() || buildDefaultArtistJsonUrl(artistName);
    setLoadingSample(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        setError(`JSON URL 取得に失敗しました（HTTP ${res.status}）`);
        return;
      }
      const text = await res.text();
      JSON.parse(text);
      setJsonText(text);
      setMessage('JSON を読み込みました。');
    } catch {
      setError('JSON URL からの読み込みに失敗しました。');
    } finally {
      setLoadingSample(false);
    }
  };

  const onImport = async () => {
    const text = jsonText.trim();
    if (!text) return;
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/artist-master-import-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistName,
          jsonText: text,
          jsonUrl: jsonUrl.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : '取り込みに失敗しました。');
        return;
      }
      setMessage('取り込みが完了しました。');
      router.refresh();
    } catch {
      setError('取り込みに失敗しました。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-6 rounded-lg border border-gray-800 bg-gray-900/40 p-4 text-sm">
      <h2 className="text-sm font-semibold text-amber-200">Music8 個別JSON 取り込み</h2>
      <p className="mt-1 text-xs text-gray-500">
        このアーティストの Music8 JSON を貼り付けると、基本情報を artists に補完します。
      </p>
      <textarea
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
        placeholder="ここに Music8 のアーティスト JSON 本文を貼り付けてください（この薄い文字は例で、入力値ではありません）"
        className="mt-3 h-40 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 font-mono text-xs text-gray-100 outline-none focus:border-amber-600"
      />
      <label className="mt-3 block text-[11px] text-gray-500">
        JSON URL（任意・貼り付けなしで直接取得）
        <input
          type="url"
          value={jsonUrl}
          onChange={(e) => setJsonUrl(e.target.value)}
          placeholder="https://.../artists/police.json"
          className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-xs text-gray-100 outline-none focus:border-amber-600"
        />
      </label>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void loadSampleFromUrl()}
          disabled={loadingSample || submitting}
          className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-gray-300 hover:bg-gray-700"
        >
          {loadingSample ? '読込中…' : 'サンプル入力（URLから）'}
        </button>
        <button
          type="button"
          onClick={() => void onImport()}
          disabled={submitting || !(canSubmit || jsonUrl.trim())}
          className={`rounded px-4 py-2 text-xs font-medium transition-colors ${
            submitting || !(canSubmit || jsonUrl.trim())
              ? 'cursor-not-allowed border border-gray-700 bg-gray-800 text-gray-500'
              : 'border border-amber-500 bg-amber-600 text-gray-950 hover:bg-amber-500 active:bg-amber-400'
          }`}
        >
          {submitting ? '取り込み中…' : 'JSONを取り込む'}
        </button>
        <p className="text-[11px] text-gray-500">
          {canSubmit || jsonUrl.trim()
            ? '入力あり: 実行できます。'
            : 'JSON を貼り付けるか URL を入力すると実行できます。'}
        </p>
        {message ? <p className="text-xs text-emerald-300">{message}</p> : null}
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
      </div>
    </section>
  );
}


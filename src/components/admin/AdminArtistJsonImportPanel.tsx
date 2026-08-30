'use client';

/**
 * 管理 UI からは外した（正本は artists。公開 JSON の個別取込は手修正を上書きする）。
 * API `POST /api/admin/artist-master-import-json` は緊急用に残している。
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { music8ArtistJsonUrl } from '@/lib/music8-data-urls';

function slugifyForArtistJson(raw: string): string {
  return raw
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
}

function buildDefaultArtistJsonUrl(preferredSlug: string | null | undefined, artistName: string): string {
  const fromSlug = (preferredSlug ?? '').trim().toLowerCase();
  if (fromSlug) return music8ArtistJsonUrl(fromSlug);
  return music8ArtistJsonUrl(slugifyForArtistJson(artistName) || 'unknown');
}

type Props = {
  artistName: string;
  artistId?: string | null;
  /** GCS / WP 照合用（英語名側の music8_artist_slug） */
  music8ArtistSlug?: string | null;
};

export function AdminArtistJsonImportPanel({
  artistName,
  artistId,
  music8ArtistSlug,
}: Props) {
  const router = useRouter();
  const [jsonText, setJsonText] = useState('');
  const [jsonUrl, setJsonUrl] = useState(buildDefaultArtistJsonUrl(music8ArtistSlug, artistName));
  const [submitting, setSubmitting] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [loadingWp, setLoadingWp] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = jsonText.trim().length > 0;
  const busy = submitting || loadingSample || loadingWp;

  const loadSampleFromUrl = async () => {
    const url = jsonUrl.trim() || buildDefaultArtistJsonUrl(music8ArtistSlug, artistName);
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

  const importFromWpRest = async () => {
    setLoadingWp(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/artist-music8-wp-rest-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistId: artistId ?? undefined,
          artistName,
          music8ArtistSlug: music8ArtistSlug ?? undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        source?: string;
        slug?: string | null;
      };
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'WP REST からの取得に失敗しました。');
        return;
      }
      setMessage(
        data.slug
          ? `WordPress REST から補完しました（slug: ${data.slug}）。`
          : 'WordPress REST から補完しました。',
      );
      router.refresh();
    } catch {
      setError('WP REST からの取得に失敗しました。');
    } finally {
      setLoadingWp(false);
    }
  };

  const onImport = async () => {
    const text = jsonText.trim();
    if (!text && !jsonUrl.trim()) return;
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/artist-master-import-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistName,
          jsonText: text || undefined,
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
      <p className="mt-1 text-xs leading-relaxed text-gray-500">
        ① GCS のアーティスト JSON を URL／貼り付けで取り込む。② JSON
        未エクスポートでも WP にカテゴリがあれば{' '}
        <code className="text-gray-400">wp/v2/categories</code> から補完できます（曲詳細の「WP REST
        から補完」と同系）。
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
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void loadSampleFromUrl()}
          disabled={busy}
          className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-50"
        >
          {loadingSample ? '読込中…' : 'サンプル入力（URLから）'}
        </button>
        <button
          type="button"
          onClick={() => void importFromWpRest()}
          disabled={busy}
          className="rounded border border-cyan-700 bg-gray-950 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-950/40 disabled:opacity-50"
        >
          {loadingWp ? '取得中…' : 'WP REST から補完'}
        </button>
        <button
          type="button"
          onClick={() => void onImport()}
          disabled={busy || !(canSubmit || jsonUrl.trim())}
          className={`rounded px-4 py-2 text-xs font-medium transition-colors ${
            busy || !(canSubmit || jsonUrl.trim())
              ? 'cursor-not-allowed border border-gray-700 bg-gray-800 text-gray-500'
              : 'border border-amber-500 bg-amber-600 text-gray-950 hover:bg-amber-500 active:bg-amber-400'
          }`}
        >
          {submitting ? '取り込み中…' : 'JSONを取り込む'}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-gray-500">
        {canSubmit || jsonUrl.trim()
          ? 'JSON 入力あり: 「JSONを取り込む」で実行できます。WP だけ使う場合は右側のボタンのみで可。'
          : 'JSON なしでも「WP REST から補完」は実行できます。'}
      </p>
      {message ? <p className="mt-2 text-xs text-emerald-300">{message}</p> : null}
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
    </section>
  );
}

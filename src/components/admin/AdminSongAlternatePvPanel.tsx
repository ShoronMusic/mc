'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  MAX_SONG_VIDEO_VARIANTS,
  type AlternatePvMatchLevel,
} from '@/lib/song-alternate-pv-match';

type Preview = {
  videoId: string;
  youtubeTitle: string | null;
  resolvedArtist: string | null;
  resolvedTitle: string | null;
  channelTitle: string | null;
  publishedAt: string | null;
  suggestedVariant: string;
  match: { level: AlternatePvMatchLevel; reasons: string[] };
  currentCount: number;
  maxCount: number;
  alreadyOnThisSong: boolean;
  otherSongId: string | null;
  error?: string;
  message?: string;
  added?: boolean;
};

const VARIANT_OPTIONS = ['official', 'visualizer', 'lyric', 'live', 'topic', 'other'] as const;

function levelLabel(level: AlternatePvMatchLevel): string {
  if (level === 'high') return '同一曲（高）';
  if (level === 'medium') return '同一曲の可能性（中）';
  if (level === 'low') return '別曲の可能性あり（低）';
  return '除外';
}

type Props = {
  songId: string;
  currentCount: number;
};

export function AdminSongAlternatePvPanel({ songId, currentCount }: Props) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [variant, setVariant] = useState<string>('official');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<'idle' | 'preview' | 'add'>('idle');
  const [msg, setMsg] = useState<string | null>(null);

  async function run(action: 'preview' | 'add', force = false) {
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/song-alternate-pv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          songId,
          url,
          action,
          variant,
          force,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Preview;
      setPreview(data);
      if (data.suggestedVariant && action === 'preview') {
        setVariant(data.suggestedVariant);
      }
      if (!res.ok) {
        setMsg(data.error || '失敗しました。');
        return;
      }
      if (action === 'add') {
        setMsg(data.message || '追記しました。');
        setUrl('');
        router.refresh();
      }
    } catch {
      setMsg('失敗しました。');
    } finally {
      setBusy('idle');
    }
  }

  const atCap = currentCount >= MAX_SONG_VIDEO_VARIANTS;
  const needsForce = preview?.match.level === 'low' || preview?.match.level === 'reject';

  return (
    <div className="mt-4 rounded border border-sky-900/50 bg-sky-950/15 p-3">
      <h3 className="text-xs font-semibold text-sky-200">別バージョン PV を追記</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
        公式 MV／リリックなど、同じ曲の別 YouTube を最大 {MAX_SONG_VIDEO_VARIANTS}{' '}
        本まで紐づけます。空白入りタイトル（例: p a r a d 0 x 1 c）も既存曲名と照合します。選曲時の自動マージはしません。
      </p>
      {atCap ? (
        <p className="mt-2 text-xs text-amber-200">この曲は既に {MAX_SONG_VIDEO_VARIANTS} 本あります。</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1 text-[11px] text-gray-400">
            YouTube URL
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white focus:border-sky-700 focus:outline-none"
            />
          </label>
          <label className="block text-[11px] text-gray-400">
            variant
            <select
              value={variant}
              onChange={(e) => setVariant(e.target.value)}
              className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white focus:border-sky-700 focus:outline-none"
            >
              {VARIANT_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy !== 'idle' || !url.trim()}
            onClick={() => void run('preview')}
            className="rounded border border-sky-800 bg-sky-950/40 px-3 py-1.5 text-xs text-sky-100 hover:bg-sky-900/50 disabled:opacity-50"
          >
            {busy === 'preview' ? '照合中…' : '照合'}
          </button>
        </div>
      )}

      {preview ? (
        <div className="mt-3 space-y-1 text-xs text-gray-300">
          <p>
            <span className="text-gray-500">video_id：</span>
            <a
              href={`https://www.youtube.com/watch?v=${encodeURIComponent(preview.videoId)}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-sky-400 hover:underline"
            >
              {preview.videoId}
            </a>
          </p>
          <p>
            <span className="text-gray-500">YouTube：</span>
            {preview.youtubeTitle || '—'}
          </p>
          <p>
            <span className="text-gray-500">解決：</span>
            {(preview.resolvedArtist || '—') + ' - ' + (preview.resolvedTitle || '—')}
          </p>
          <p>
            <span className="text-gray-500">判定：</span>
            {levelLabel(preview.match.level)}
          </p>
          {preview.match.reasons.length > 0 ? (
            <ul className="list-disc pl-4 text-[11px] text-gray-400">
              {preview.match.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : null}
          {preview.otherSongId ? (
            <p className="text-amber-200">
              別曲{' '}
              <a href={`/admin/songs/${preview.otherSongId}`} className="underline">
                {preview.otherSongId}
              </a>{' '}
              に既に紐づいています。
            </p>
          ) : null}
        </div>
      ) : null}

      {msg ? (
        <p className="mt-2 text-xs text-amber-200" role="status">
          {msg}
        </p>
      ) : null}

      {preview && !preview.alreadyOnThisSong && !preview.otherSongId && !atCap ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== 'idle'}
            onClick={() => void run('add', needsForce)}
            className="rounded bg-sky-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50"
          >
            {busy === 'add'
              ? '追記中…'
              : needsForce
                ? '確認して強制追記'
                : 'この曲に追記'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

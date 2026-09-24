'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SONG_VIDEO_VARIANT_OPTIONS, normalizeSongVideoVariant } from '@/lib/song-video-variants';

type Props = {
  songId: string;
  videoId: string;
  variant: string | null;
};

export function AdminSongVideoVariantCell({ songId, videoId, variant }: Props) {
  const router = useRouter();
  const initial = normalizeSongVideoVariant(variant) ?? (variant ?? '').trim();
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setValue(initial);
    setSaved(initial);
  }, [initial]);

  const known = (SONG_VIDEO_VARIANT_OPTIONS as readonly string[]).includes(value);
  const options = known || !value ? SONG_VIDEO_VARIANT_OPTIONS : [value, ...SONG_VIDEO_VARIANT_OPTIONS];

  async function save(next: string) {
    if (!next || next === saved) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/song-video-variant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ songId, videoId, variant: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setValue(saved);
        setMsg(data.error || '保存できませんでした。');
        return;
      }
      setSaved(next);
      setMsg(null);
      router.refresh();
    } catch {
      setValue(saved);
      setMsg('保存できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-[7.5rem]">
      <select
        value={value}
        disabled={busy}
        aria-label={`${videoId} の variant`}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          void save(next);
        }}
        className="w-full rounded border border-gray-700 bg-gray-950 px-1.5 py-1 text-xs text-white focus:border-sky-700 focus:outline-none disabled:opacity-50"
      >
        {!value ? <option value="">未設定</option> : null}
        {options.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      {msg ? <p className="mt-1 text-[10px] text-red-400">{msg}</p> : null}
    </div>
  );
}

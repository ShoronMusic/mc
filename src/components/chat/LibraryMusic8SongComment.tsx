'use client';

import { extractMusic8SongFields, pickMusic8SongFullDescription } from '@/lib/music8-song-fields';

export function pickMusic8SongPlainDescription(song: unknown): string | null {
  const t = pickMusic8SongFullDescription(song);
  return t || null;
}

export type LibraryMusic8SongMeta = {
  description: string | null;
  vocalLabel: string | null;
};

function metaFromSong(song: unknown): LibraryMusic8SongMeta {
  const description = pickMusic8SongPlainDescription(song);
  const vocalLabel = extractMusic8SongFields(song).vocalLabel.trim() || null;
  return { description, vocalLabel };
}

function pickLongerMeta(a: LibraryMusic8SongMeta, b: LibraryMusic8SongMeta): LibraryMusic8SongMeta {
  const aLen = (a.description ?? '').length;
  const bLen = (b.description ?? '').length;
  return {
    description: bLen > aLen ? b.description : a.description,
    vocalLabel: a.vocalLabel || b.vocalLabel,
  };
}

async function fetchSongJson(url: string): Promise<unknown | null> {
  const res = await fetch(url, { credentials: 'include' });
  const json = (await res.json().catch(() => ({}))) as { song?: unknown };
  return json?.song && typeof json.song === 'object' ? json.song : null;
}

const music8MetaInflight = new Map<string, Promise<LibraryMusic8SongMeta>>();

/** 曲詳細用: 紹介文は長い方を採用（抜粋より WP content 全文を優先） */
export function fetchMusic8SongLibraryMeta(
  videoId: string | null,
  artistName: string,
  songTitle: string,
): Promise<LibraryMusic8SongMeta> {
  const vid = (videoId ?? '').trim();
  const artist = artistName.trim();
  const title = songTitle.trim();
  const key = `${vid}\t${artist}\t${title}`;
  const hit = music8MetaInflight.get(key);
  if (hit) return hit;

  const pending = (async (): Promise<LibraryMusic8SongMeta> => {
    const empty: LibraryMusic8SongMeta = { description: null, vocalLabel: null };
    const tasks: Promise<LibraryMusic8SongMeta>[] = [];
    if (vid) {
      tasks.push(
        fetchSongJson(`/api/music8/musicaichat-by-video?videoId=${encodeURIComponent(vid)}`).then((song) =>
          song ? metaFromSong(song) : empty,
        ),
      );
    }
    if (artist && title) {
      tasks.push(
        fetchSongJson(
          `/api/music8/song-by-playback?artistName=${encodeURIComponent(artist)}&songTitle=${encodeURIComponent(title)}`,
        ).then((song) => (song ? metaFromSong(song) : empty)),
      );
    }
    if (tasks.length === 0) return empty;
    const parts = await Promise.all(tasks);
    return parts.reduce(pickLongerMeta, empty);
  })();

  const wrapped = pending.finally(() => {
    globalThis.setTimeout(() => {
      if (music8MetaInflight.get(key) === wrapped) music8MetaInflight.delete(key);
    }, 30_000);
  });
  music8MetaInflight.set(key, wrapped);
  return wrapped;
}

export async function fetchMusic8SongDescription(
  videoId: string | null,
  artistName: string,
  songTitle: string,
): Promise<string | null> {
  const meta = await fetchMusic8SongLibraryMeta(videoId, artistName, songTitle);
  return meta.description;
}

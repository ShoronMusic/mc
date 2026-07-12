/**
 * room_playback_history の title / artist_name から一覧用 display_title を組み立てる。
 * title に既に「Artist - Song」形式が入っている行の二重結合を防ぐ。
 */
export function snapshotPlaybackHistoryDisplayTitle(
  title: string | null | undefined,
  artistName: string | null | undefined,
): string | null {
  const t = (title ?? '').trim();
  const artist = (artistName ?? '').trim();
  if (!t && !artist) return null;
  if (t && artist) {
    const prefix = `${artist} - `;
    if (t.startsWith(prefix) || t === artist) return t;
    return `${artist} - ${t}`;
  }
  return t || artist || null;
}

/** 履歴行から曲名だけを取り出す（title が結合済みのとき） */
export function playbackHistorySongTitleOnly(
  title: string | null | undefined,
  artistName: string | null | undefined,
): string | null {
  const t = (title ?? '').trim();
  const artist = (artistName ?? '').trim();
  if (!t) return null;
  if (artist) {
    const prefix = `${artist} - `;
    if (t.startsWith(prefix)) {
      const song = t.slice(prefix.length).trim();
      return song || t;
    }
  }
  return t;
}

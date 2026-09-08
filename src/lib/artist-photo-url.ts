export function pickArtistPhotoUrl(row: {
  image_url?: string | null;
  spotify_artist_images?: string | null;
}): string | null {
  for (const raw of [row.image_url, row.spotify_artist_images]) {
    const s = (raw ?? '').trim();
    if (/^https?:\/\//i.test(s)) return s;
  }
  return null;
}

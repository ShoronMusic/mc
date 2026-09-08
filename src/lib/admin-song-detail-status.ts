import { MUSIC8_INTRO_MIN_CHARS } from '@/lib/music8-song-fields';

export function isAdminSongBasicInfoFilled(opts: {
  style?: string | null;
  vocal?: string | null;
  originalReleaseDate?: string | null;
}): boolean {
  return Boolean(
    (opts.style ?? '').trim() &&
      (opts.vocal ?? '').trim() &&
      (opts.originalReleaseDate ?? '').trim(),
  );
}

export function isAdminSongIntroFilled(text: string | null | undefined): boolean {
  return (text ?? '').trim().length >= MUSIC8_INTRO_MIN_CHARS;
}

export function isAdminSongSpotifyFilled(opts: {
  hasTrackId?: boolean;
  hasPopularity?: boolean;
}): boolean {
  return Boolean(opts.hasTrackId && opts.hasPopularity);
}

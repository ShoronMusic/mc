import famousPvConfig from '@/config/youtube-famous-pv-artist-song.json';
import { getMainArtist } from '@/lib/format-song-display';

export type FamousPvPackRow = {
  artistDisplay: string;
  song: string;
};

type ConfigShape = Record<string, FamousPvPackRow | string | undefined>;

function loadFamousPvMap(): ReadonlyMap<string, FamousPvPackRow> {
  const raw = famousPvConfig as ConfigShape;
  const m = new Map<string, FamousPvPackRow>();
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('_')) continue;
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const row = v as FamousPvPackRow;
    const ad = typeof row.artistDisplay === 'string' ? row.artistDisplay.trim() : '';
    const sg = typeof row.song === 'string' ? row.song.trim() : '';
    if (ad && sg) m.set(k.trim(), { artistDisplay: ad, song: sg });
  }
  return m;
}

const FAMOUS_PV_BY_VIDEO_ID = loadFamousPvMap();

/**
 * 手動登録した「有名公式PV」だけ videoId でアーティスト／曲名を固定する（ヒューリスティックより優先）。
 */
export function resolveFamousPvArtistSongPack(
  videoId: string | null | undefined,
): { artist: string; artistDisplay: string; song: string } | null {
  const id = videoId?.trim();
  if (!id) return null;
  const row = FAMOUS_PV_BY_VIDEO_ID.get(id);
  if (!row) return null;
  const main = getMainArtist(row.artistDisplay) || row.artistDisplay;
  return {
    artist: main,
    artistDisplay: row.artistDisplay,
    song: row.song,
  };
}

/**
 * 邦楽ライト曲 DB — 選曲時の表記・メタ解決（MB 優先 → YouTube フォールバック）。
 */

import { textHasJapaneseScript } from '@/lib/comment-pack-jp-economy';
import {
  fetchMusicBrainzRecordingMetadata,
  type MusicBrainzRecordingMetadata,
} from '@/lib/musicbrainz-recording-metadata';
import {
  parseArtistSongFromJpBilingualHyphenTitle,
  parseArtistSongFromCornerBracketTitle,
  parseArtistSongFromJpHyphenTitleSlashEnArtist,
  parseArtistSongFromJpSlashTitle,
  resolveDomesticArtistSongFromYoutube,
  stripJpOfficialVideoDecorations,
} from '@/lib/jp-domestic-youtube-title';

export type DomesticSongMetadataSource =
  | 'musicbrainz'
  | 'youtube_hyphen_slash_en'
  | 'youtube_slash'
  | 'youtube_bilingual_hyphen'
  | 'youtube_corner_bracket'
  | 'youtube_resolved'
  | 'youtube_channel';

export type DomesticSongMetadataResult = {
  mainArtist: string;
  songTitle: string;
  displayTitle: string;
  artistDisplay: string;
  originalReleaseDate: string | null;
  /** 英語タイトル等の日本語読み（カタカナ優先） */
  songTitleJa: string | null;
  genres: string[];
  source: DomesticSongMetadataSource;
  musicBrainzScore: number | null;
};

export type ResolveDomesticSongMetadataInput = {
  rawTitle: string;
  channelTitle?: string | null;
  channelAuthor?: string | null;
  resolvedArtist?: string | null;
  resolvedSong?: string | null;
  /**
   * mc 選曲向け: MB が英語表記のみのとき YouTube 邦楽ルールへフォールバックする。
   * MA では未指定（MB 優先のまま）。
   */
  preferJapaneseScriptDisplay?: boolean;
};

/** MB 結果に日本語表記が無いか（mc の YouTube フォールバック判定用） */
export function musicBrainzMetadataLacksJapaneseScript(
  mb: Pick<MusicBrainzRecordingMetadata, 'mainArtist' | 'songTitle' | 'displayTitle'>,
): boolean {
  const blob = [mb.displayTitle, mb.mainArtist, mb.songTitle]
    .filter((v) => typeof v === 'string' && v.trim())
    .join('\n');
  return !textHasJapaneseScript(blob);
}

function mbSearchCandidates(input: ResolveDomesticSongMetadataInput): Array<{ artist: string; song: string }> {
  const out: Array<{ artist: string; song: string }> = [];
  const seen = new Set<string>();

  const add = (artist: string, song: string) => {
    const a = artist.trim();
    const s = song.trim();
    if (!a || !s) return;
    const key = `${a.toLowerCase()}\n${s.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ artist: a, song: s });
  };

  const hyphenSlash = parseArtistSongFromJpHyphenTitleSlashEnArtist(input.rawTitle);
  if (hyphenSlash) add(hyphenSlash.artist, hyphenSlash.song);

  const slash = parseArtistSongFromJpSlashTitle(input.rawTitle);
  if (slash) add(slash.artist, slash.song);

  const bilingual = parseArtistSongFromJpBilingualHyphenTitle(input.rawTitle);
  if (bilingual) add(bilingual.artist, bilingual.song);

  const corner = parseArtistSongFromCornerBracketTitle(input.rawTitle);
  if (corner) add(corner.artist, corner.song);

  const resolvedArtist = (input.resolvedArtist ?? '').trim();
  const resolvedSong = (input.resolvedSong ?? '').trim();
  if (resolvedArtist && resolvedSong) add(resolvedArtist, resolvedSong);

  const channel = (input.channelTitle ?? input.channelAuthor ?? '').trim();
  const stripped = stripJpOfficialVideoDecorations(input.rawTitle);
  if (channel && stripped) add(channel, stripped);

  return out;
}

/**
 * 邦楽・公式ゲート通過後に呼ぶ。Gemini は使わない。
 */
export async function resolveDomesticSongMetadataForRegistration(
  input: ResolveDomesticSongMetadataInput,
): Promise<DomesticSongMetadataResult | null> {
  const preferJp = input.preferJapaneseScriptDisplay === true;
  let mbSidecar: MusicBrainzRecordingMetadata | null = null;

  for (const { artist, song } of mbSearchCandidates(input)) {
    const mb = await fetchMusicBrainzRecordingMetadata(artist, song);
    if (!mb) continue;
    if (preferJp && musicBrainzMetadataLacksJapaneseScript(mb)) {
      if (!mbSidecar) mbSidecar = mb;
      continue;
    }
    return {
      mainArtist: mb.mainArtist,
      songTitle: mb.songTitle,
      displayTitle: mb.displayTitle,
      artistDisplay: mb.mainArtist,
      originalReleaseDate: mb.originalReleaseDate,
      songTitleJa: mb.songTitleJa,
      genres: mb.genres,
      source: 'musicbrainz',
      musicBrainzScore: mb.recordingScore,
    };
  }

  const yt = resolveDomesticArtistSongFromYoutube({
    rawTitle: input.rawTitle,
    channelTitle: input.channelTitle,
    channelAuthor: input.channelAuthor,
    resolvedArtist: input.resolvedArtist,
    resolvedSong: input.resolvedSong,
  });
  if (yt) {
    const source: DomesticSongMetadataSource =
      yt.source === 'jp_hyphen_slash_en'
        ? 'youtube_hyphen_slash_en'
        : yt.source === 'jp_slash'
          ? 'youtube_slash'
          : yt.source === 'jp_bilingual_hyphen'
            ? 'youtube_bilingual_hyphen'
            : yt.source === 'jp_corner_bracket'
              ? 'youtube_corner_bracket'
              : yt.source === 'resolved'
                ? 'youtube_resolved'
                : 'youtube_channel';

    return {
      mainArtist: yt.mainArtist,
      songTitle: yt.songTitle,
      displayTitle: yt.displayTitle,
      artistDisplay: yt.artistDisplay,
      originalReleaseDate: mbSidecar?.originalReleaseDate ?? null,
      songTitleJa: mbSidecar?.songTitleJa ?? null,
      genres: mbSidecar?.genres ?? [],
      source,
      musicBrainzScore: mbSidecar?.recordingScore ?? null,
    };
  }

  if (mbSidecar) {
    return {
      mainArtist: mbSidecar.mainArtist,
      songTitle: mbSidecar.songTitle,
      displayTitle: mbSidecar.displayTitle,
      artistDisplay: mbSidecar.mainArtist,
      originalReleaseDate: mbSidecar.originalReleaseDate,
      songTitleJa: mbSidecar.songTitleJa,
      genres: mbSidecar.genres,
      source: 'musicbrainz',
      musicBrainzScore: mbSidecar.recordingScore,
    };
  }

  return null;
}

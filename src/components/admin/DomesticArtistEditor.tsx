'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import {
  artistRowToDraft,
  emptyDraft,
  Field,
  inputClass,
  RegistrationStatusIcons,
} from '@/components/admin/DomesticArtistRegisterParts';
import { AdminArtistMemberRelationEditor } from '@/components/admin/AdminArtistMemberRelationEditor';
import {
  ARTIST_OCCUPATION_OPTIONS,
  canonicalizeArtistOccupations,
  extraArtistOccupations,
  isArtistOccupationSelected,
  toggleArtistOccupation,
} from '@/lib/artist-occupation-options';
import {
  mergeArtistEnglishNameAfterSpotify,
  mergeArtistEnglishNameAfterWikipedia,
} from '@/lib/artist-english-name';
import type { AdminMemberHintStatus, ArtistMemberLink } from '@/lib/artist-members';
import type { AdminArtistProfileDraft, AdminArtistThePrefix } from '@/lib/admin-artist-profile-parse';
import { resolveYoutubeChannelHref } from '@/lib/music8-artist-display';
import {
  normalizeWikipediaArticleHref,
  resolveArtistWikipediaHref,
} from '@/lib/library-artist-public-display';
import {
  composeAdminArtistDisplayName,
  normalizeAdminArtistThePrefix,
  splitAdminArtistNameParts,
  withSyncedAdminArtistDisplayName,
} from '@/lib/admin-artist-profile-parse';
import { mergeExternalGeminiArtistClipboardIntoDraft } from '@/lib/admin-external-gemini-artist-import';
import { resolveDomesticArtistRegistrationStatus } from '@/lib/admin-domestic-artist-registration-status';
import {
  formatPlaylistArtistsField,
  parsePlaylistArtistsField,
} from '@/lib/admin-domestic-playlist-artists-field';
import { SongCoverThumb } from '@/components/song/SongCoverThumb';
import {
  GenreBestRegisteredLabelLinks,
  useGenreBestLabelsBySongIds,
} from '@/components/admin/GenreBestRegisteredLabels';

type LookupResponse = {
  error?: string;
  artist?: Record<string, unknown> | null;
  memberGraph?: { members?: ArtistMemberLink[]; bands?: ArtistMemberLink[] };
  memberHints?: AdminMemberHintStatus[];
};

function asMemberLinks(raw: ArtistMemberLink[] | undefined): ArtistMemberLink[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string');
}

type GenerateResponse = {
  error?: string;
  ok?: boolean;
  model?: string;
  draft?: AdminArtistProfileDraft;
};

type SaveResponse = {
  error?: string;
  ok?: boolean;
  artistId?: string;
  mode?: 'insert' | 'update';
  dryRun?: boolean;
};

type YoutubeChannelResponse = {
  error?: string;
  ok?: boolean;
  selected?: {
    channelId: string;
    channelTitle: string;
    channelUrl: string;
  };
};

type WikipediaPageResponse = {
  error?: string;
  ok?: boolean;
  wikipediaPage?: string;
  lang?: 'en' | 'ja';
};

type SpotifyArtistResponse = {
  error?: string;
  ok?: boolean;
  selected?: {
    id: string;
    name: string;
    popularity: number | null;
    images: string | null;
  };
};

type PlaylistFetchItem = {
  index: number;
  videoId: string;
  url: string;
  artist: string;
  title: string;
  displayTitle: string;
  releaseDate: string | null;
  songTitleJa?: string | null;
  youtubeDate: string | null;
  officialGate: { persist: boolean; reason: string };
  include: boolean;
  note: string | null;
  artistMatch: 'channel' | 'name' | 'mismatch' | 'unknown';
  existingSongId: string | null;
  genres?: string[];
  rawTitle?: string;
  channelTitle?: string | null;
  channelId?: string | null;
  titleEdited?: boolean;
  /** 共演アーティスト（登録アーティスト以外） */
  creditArtists?: string[];
};

type PlaylistFetchResponse = {
  error?: string;
  ok?: boolean;
  playlistId?: string;
  playlistUrl?: string;
  items?: PlaylistFetchItem[];
  summary?: {
    total: number;
    playlistFetched?: number;
    included: number;
    gateOk: number;
    artistMatched: number;
    withReleaseDate: number;
    existingVideos: number;
    skippedExisting?: number;
  };
};

type PlaylistApplyResponse = {
  error?: string;
  ok?: boolean;
  dryRun?: boolean;
  results?: Array<{ videoId: string; status: string }>;
  summary?: {
    total: number;
    imported: number;
    dryRun: number;
    skippedExisting: number;
    skippedExcluded: number;
    skippedGate: number;
    failed: number;
  };
};

type RegisteredSongItem = {
  id: string;
  display_title: string | null;
  main_artist: string | null;
  song_title: string | null;
  song_title_ja: string | null;
  original_release_date: string | null;
  video_id: string | null;
  youtube_url: string | null;
  spotify_track_id?: string | null;
  spotify_popularity?: number | null;
  spotify_images?: string | null;
};

type Props =
  | { mode: 'new' }
  | { mode: 'edit'; artistId: string };

export function DomesticArtistEditor(props: Props) {
  const { mode } = props;
  const artistIdParam = props.mode === 'edit' ? props.artistId : null;
  const searchParams = useSearchParams();
  const nameFromQuery = mode === 'new' ? (searchParams.get('name') ?? '').trim() : '';
  const autoloadFromQuery = mode === 'new' && searchParams.get('autoload') === '1';
  const queryBootstrapped = useRef(false);

  const [artistName, setArtistName] = useState(nameFromQuery);
  const [draft, setDraft] = useState<AdminArtistProfileDraft | null>(null);
  const [artistId, setArtistId] = useState<string | null>(artistIdParam);
  const [memberBands, setMemberBands] = useState<ArtistMemberLink[]>([]);
  const [memberPeople, setMemberPeople] = useState<ArtistMemberLink[]>([]);
  const [memberHints, setMemberHints] = useState<AdminMemberHintStatus[]>([]);
  const [membersFallback, setMembersFallback] = useState<string | null>(null);
  const [memberGraphReady, setMemberGraphReady] = useState(mode === 'new');
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [fetchingYoutube, setFetchingYoutube] = useState(false);
  const [fetchingWikipedia, setFetchingWikipedia] = useState(false);
  const [fetchingSpotify, setFetchingSpotify] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [playlistMaxItems, setPlaylistMaxItems] = useState(10);
  const [playlistItems, setPlaylistItems] = useState<PlaylistFetchItem[]>([]);
  const [playlistSummary, setPlaylistSummary] = useState<PlaylistFetchResponse['summary'] | null>(
    null,
  );
  const [fetchingPlaylist, setFetchingPlaylist] = useState(false);
  const [applyingPlaylist, setApplyingPlaylist] = useState(false);
  const [playlistForceAllow, setPlaylistForceAllow] = useState(false);
  const [registeredSongs, setRegisteredSongs] = useState<RegisteredSongItem[]>([]);
  const genreBestLabelsBySong = useGenreBestLabelsBySongIds(registeredSongs.map((s) => s.id));
  const [loadingRegisteredSongs, setLoadingRegisteredSongs] = useState(false);
  const [registeredSongsError, setRegisteredSongsError] = useState<string | null>(null);
  const [spotifyEnrichBusy, setSpotifyEnrichBusy] = useState(false);
  const [spotifyEnrichMsg, setSpotifyEnrichMsg] = useState<string | null>(null);
  const [mbDateBusy, setMbDateBusy] = useState(false);
  const [mbDateMsg, setMbDateMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const missingSpotifyCount = registeredSongs.filter(
    (s) => !s.spotify_track_id?.trim() || s.spotify_popularity == null,
  ).length;
  const missingDateItems = registeredSongs.filter((s) => !s.original_release_date?.trim());
  const missingDateCount = missingDateItems.length;

  const loadRegisteredSongs = useCallback(async (name: string, catalog?: string | null) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setRegisteredSongs([]);
      setRegisteredSongsError(null);
      return;
    }
    const catalogParam =
      catalog === 'western' || catalog === 'domestic' || catalog === 'all' || catalog === 'unknown'
        ? catalog === 'unknown'
          ? 'all'
          : catalog
        : 'all';
    setLoadingRegisteredSongs(true);
    setRegisteredSongsError(null);
    try {
      const res = await fetch(
        `/api/admin/domestic-artist-profile/songs?name=${encodeURIComponent(trimmed)}&catalog=${encodeURIComponent(catalogParam)}`,
        { credentials: 'include' },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        items?: RegisteredSongItem[];
      };
      if (!res.ok) {
        setRegisteredSongs([]);
        setRegisteredSongsError(data.error ?? '登録曲の取得に失敗しました。');
        return;
      }
      setRegisteredSongs(Array.isArray(data.items) ? data.items : []);
    } catch {
      setRegisteredSongs([]);
      setRegisteredSongsError('登録曲の取得に失敗しました。');
    } finally {
      setLoadingRegisteredSongs(false);
    }
  }, []);

  const applyMemberGraphFromLookup = useCallback((data: LookupResponse, hasArtist: boolean) => {
    if (!hasArtist) {
      setMemberBands([]);
      setMemberPeople([]);
      setMemberHints([]);
      setMembersFallback(null);
      setMemberGraphReady(true);
      return;
    }
    setMemberBands(asMemberLinks(data.memberGraph?.bands));
    setMemberPeople(asMemberLinks(data.memberGraph?.members));
    setMemberHints(Array.isArray(data.memberHints) ? data.memberHints : []);
    const rawMembers = data.artist && typeof data.artist.members === 'string' ? data.artist.members.trim() : '';
    setMembersFallback(rawMembers || null);
    setMemberGraphReady(true);
  }, []);

  const loadById = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/domestic-artist-profile/lookup?id=${encodeURIComponent(id)}&members=1`,
        { credentials: 'include' },
      );
      const data = (await res.json().catch(() => ({}))) as LookupResponse;
      if (!res.ok) {
        setError(data.error ?? 'アーティストの読み込みに失敗しました。');
        return;
      }
      if (!data.artist || typeof data.artist.id !== 'string') {
        setError('アーティストが見つかりませんでした。');
        return;
      }
      const name = typeof data.artist.name === 'string' ? data.artist.name : '';
      setArtistId(data.artist.id);
      setArtistName(name);
      const nextDraft = artistRowToDraft(data.artist, name);
      setDraft({
        ...nextDraft,
        occupations: canonicalizeArtistOccupations(nextDraft.occupations),
      });
      applyMemberGraphFromLookup(data, true);
      setMessage('アーティストを読み込みました。');
      const scope =
        data.artist.catalog_scope === 'western' ||
        data.artist.catalog_scope === 'domestic' ||
        data.artist.catalog_scope === 'unknown'
          ? (data.artist.catalog_scope as string)
          : 'all';
      void loadRegisteredSongs(nextDraft.name, scope);
    } catch {
      setError('アーティストの読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [applyMemberGraphFromLookup, loadRegisteredSongs]);

  useEffect(() => {
    if (mode === 'edit' && artistIdParam) {
      void loadById(artistIdParam);
    }
  }, [mode, artistIdParam, loadById]);

  const loadExistingByName = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/domestic-artist-profile/lookup?name=${encodeURIComponent(trimmed)}&members=1`,
        { credentials: 'include' },
      );
      const data = (await res.json().catch(() => ({}))) as LookupResponse;
      if (!res.ok) {
        setError(data.error ?? '既存データの読み込みに失敗しました。');
        return;
      }
      if (data.artist && typeof data.artist.id === 'string') {
        setArtistId(data.artist.id);
        const nextDraft = artistRowToDraft(data.artist, trimmed);
        setDraft({
          ...nextDraft,
          occupations: canonicalizeArtistOccupations(nextDraft.occupations),
        });
        applyMemberGraphFromLookup(data, true);
        setMessage('既存 artists 行を読み込みました。');
        const scope =
          data.artist.catalog_scope === 'western' ||
          data.artist.catalog_scope === 'domestic' ||
          data.artist.catalog_scope === 'unknown'
            ? (data.artist.catalog_scope as string)
            : 'all';
        void loadRegisteredSongs(nextDraft.name, scope);
      } else {
        setArtistId(null);
        setDraft(emptyDraft(trimmed));
        setRegisteredSongs([]);
        applyMemberGraphFromLookup(data, false);
        setMessage('新規アーティスト（未登録）です。');
      }
    } catch {
      setError('既存データの読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [applyMemberGraphFromLookup, loadRegisteredSongs]);

  useEffect(() => {
    if (mode !== 'new' || !nameFromQuery || queryBootstrapped.current) return;
    queryBootstrapped.current = true;
    setArtistName(nameFromQuery);
    if (autoloadFromQuery) {
      void loadExistingByName(nameFromQuery);
    }
  }, [mode, nameFromQuery, autoloadFromQuery, loadExistingByName]);

  async function runGenerate(): Promise<void> {
    const synced = draft ? withSyncedAdminArtistDisplayName(draft) : null;
    const name = (synced?.name ?? artistName).trim();
    if (!name) {
      setError('アーティスト名を入力してください。');
      return;
    }
    setGenerating(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/domestic-artist-profile/generate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistName: name,
          catalog: synced?.catalogScope === 'western' ? 'western' : 'domestic',
        }),
      });
      const data = (await res.json().catch(() => ({}))) as GenerateResponse;
      if (!res.ok) {
        setError(data.error ?? 'AI 生成に失敗しました。');
        return;
      }
      if (data.draft) {
        setDraft((prev) => {
          const generated = data.draft!;
          const nameBase = (prev?.nameBase ?? '').trim() || generated.nameBase;
          const thePrefix = prev?.thePrefix ?? generated.thePrefix;
          return withSyncedAdminArtistDisplayName({
            ...generated,
            nameBase,
            thePrefix,
            // 再生成で外部 ID を消さない
            spotifyArtistId: prev?.spotifyArtistId ?? generated.spotifyArtistId,
            spotifyArtistImages: prev?.spotifyArtistImages ?? generated.spotifyArtistImages,
            spotifyArtistPopularity:
              prev?.spotifyArtistPopularity ?? generated.spotifyArtistPopularity,
            youtubeChannelId: prev?.youtubeChannelId ?? generated.youtubeChannelId,
            youtubeChannelTitle: prev?.youtubeChannelTitle ?? generated.youtubeChannelTitle,
            wikipediaPage: prev?.wikipediaPage ?? generated.wikipediaPage,
            wikipediaUrl: prev?.wikipediaUrl ?? generated.wikipediaUrl,
            catalogScope: prev?.catalogScope ?? generated.catalogScope,
          });
        });
        setAiModel(typeof data.model === 'string' ? data.model : null);
        setMessage(`Gemini で生成しました（${data.model ?? 'model'}）。内容を確認してから保存してください。`);
      }
    } catch {
      setError('AI 生成に失敗しました。');
    } finally {
      setGenerating(false);
    }
  }

  async function runImportExternalGemini(): Promise<void> {
    const baseDraft = draft
      ? { ...draft }
      : artistName.trim()
        ? emptyDraft(artistName.trim())
        : null;
    if (!baseDraft) {
      setError('先にアーティスト名を入力するか、既存を読み込んでください。');
      return;
    }
    if (!navigator.clipboard?.readText) {
      setError('このブラウザはクリップボード読み取りに非対応です。');
      return;
    }
    setError(null);
    setMessage(null);
    try {
      const text = await navigator.clipboard.readText();
      const result = mergeExternalGeminiArtistClipboardIntoDraft(baseDraft, text);
      if (!result.ok) {
        setError(
          result.preview
            ? `${result.error}\n（先頭） ${result.preview}`
            : result.error,
        );
        return;
      }
      setDraft({
        ...result.draft,
        occupations: canonicalizeArtistOccupations(result.draft.occupations),
      });
      setAiModel('external-gemini-clipboard');
      setMessage(
        `外部 Gemini から ${result.fieldCount} 項目を取り込みました。内容を確認してから保存してください。`,
      );
    } catch {
      setError(
        'クリップボードの読み取りに失敗しました。ブラウザで貼り付け許可後、Gemini で「アーティスト保存」直後に再実行してください。',
      );
    }
  }

  async function runFetchYoutubeChannel(): Promise<void> {
    const name = (draft?.name ?? artistName).trim();
    if (!name) {
      setError('アーティスト名を入力してください。');
      return;
    }
    setFetchingYoutube(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/domestic-artist-profile/youtube-channel', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistName: name, nameJa: draft?.nameJa ?? null }),
      });
      const data = (await res.json().catch(() => ({}))) as YoutubeChannelResponse;
      if (!res.ok) {
        setError(data.error ?? 'YouTube チャンネル取得に失敗しました。');
        return;
      }
      if (data.selected) {
        patchDraft({
          youtubeChannelId: data.selected.channelId,
          youtubeChannelTitle: data.selected.channelTitle,
        });
        setMessage(`YouTube チャンネルを取得しました: ${data.selected.channelTitle}`);
      }
    } catch {
      setError('YouTube チャンネル取得に失敗しました。');
    } finally {
      setFetchingYoutube(false);
    }
  }

  async function runFetchWikipediaPage(): Promise<void> {
    const name = (draft?.name ?? artistName).trim();
    if (!name) {
      setError('アーティスト名を入力してください。');
      return;
    }
    setFetchingWikipedia(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/domestic-artist-profile/wikipedia-page', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistName: name,
          nameJa: draft?.nameJa ?? null,
          descriptionEn: draft?.descriptionEn ?? null,
          // 洋楽主: domestic 以外は英語版 Wikipedia
          catalog: draft?.catalogScope === 'domestic' ? 'domestic' : 'western',
        }),
      });
      const data = (await res.json().catch(() => ({}))) as WikipediaPageResponse;
      if (!res.ok) {
        setError(data.error ?? 'Wikipedia 取得に失敗しました。');
        return;
      }
      if (data.wikipediaPage) {
        patchDraft({
          wikipediaPage: data.wikipediaPage,
          nameEn: mergeArtistEnglishNameAfterWikipedia({
            currentNameEn: draft?.nameEn,
            wikipediaPage: data.wikipediaPage,
            wikipediaLang: data.lang,
          }),
        });
        setMessage(`Wikipedia を取得しました: ${data.wikipediaPage}`);
      }
    } catch {
      setError('Wikipedia 取得に失敗しました。');
    } finally {
      setFetchingWikipedia(false);
    }
  }

  function applySpotifyArtistSelection(data: SpotifyArtistResponse): void {
    if (data.selected) {
      patchDraft({
        spotifyArtistId: data.selected.id,
        spotifyArtistImages: data.selected.images,
        spotifyArtistPopularity: data.selected.popularity,
        nameEn: mergeArtistEnglishNameAfterSpotify(data.selected.name),
      });
      setMessage(`Spotify アーティストを取得しました: ${data.selected.name}`);
    }
  }

  async function runFetchSpotifyArtist(): Promise<void> {
    const name = (draft?.name ?? artistName).trim();
    if (!name) {
      setError('アーティスト名を入力してください。');
      return;
    }
    setFetchingSpotify(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/domestic-artist-profile/spotify-artist', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistName: name,
          nameJa: draft?.nameJa ?? null,
          descriptionEn: draft?.descriptionEn ?? null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as SpotifyArtistResponse;
      if (!res.ok) {
        setError(data.error ?? 'Spotify 取得に失敗しました。');
        return;
      }
      applySpotifyArtistSelection(data);
    } catch {
      setError('Spotify 取得に失敗しました。');
    } finally {
      setFetchingSpotify(false);
    }
  }

  async function runFetchSpotifyArtistById(): Promise<void> {
    const raw = (draft?.spotifyArtistId ?? '').trim();
    if (!raw) {
      setError('Spotify の artist ID またはアーティスト URL を入力してください。');
      return;
    }
    setFetchingSpotify(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/domestic-artist-profile/spotify-artist', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spotifyArtistId: raw }),
      });
      const data = (await res.json().catch(() => ({}))) as SpotifyArtistResponse;
      if (!res.ok) {
        setError(data.error ?? '指定 ID からの Spotify 取得に失敗しました。');
        return;
      }
      applySpotifyArtistSelection(data);
    } catch {
      setError('指定 ID からの Spotify 取得に失敗しました。');
    } finally {
      setFetchingSpotify(false);
    }
  }

  async function runFetchPlaylist(): Promise<void> {
    const name = (draft?.name ?? artistName).trim();
    if (!name) {
      setError('アーティスト名を入力してください。');
      return;
    }
    if (!playlistUrl.trim()) {
      setError('プレイリスト URL を入力してください。');
      return;
    }
    setFetchingPlaylist(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/domestic-artist-profile/playlist-fetch', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlistUrl: playlistUrl.trim(),
          maxItems: playlistMaxItems,
          artistName: name,
          nameEn: draft?.nameEn ?? null,
          nameJa: draft?.nameJa ?? null,
          youtubeChannelId: draft?.youtubeChannelId ?? null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as PlaylistFetchResponse;
      if (!res.ok) {
        setError(data.error ?? 'プレイリスト取得に失敗しました。');
        return;
      }
      setPlaylistItems(Array.isArray(data.items) ? data.items : []);
      setPlaylistSummary(data.summary ?? null);
      const skipped = data.summary?.skippedExisting ?? data.summary?.existingVideos ?? 0;
      setMessage(
        `未登録 ${data.summary?.total ?? 0} 件を表に出しました（PL走査 ${data.summary?.playlistFetched ?? 0} / 既存スキップ ${skipped} / 投入候補 ${data.summary?.included ?? 0}）。`,
      );
    } catch {
      setError('プレイリスト取得に失敗しました。');
    } finally {
      setFetchingPlaylist(false);
    }
  }

  async function runApplyPlaylist(dryRun: boolean): Promise<void> {
    const name = (draft?.name ?? artistName).trim();
    if (!playlistItems.length) {
      setError('先にプレイリストを取得してください。');
      return;
    }
    setApplyingPlaylist(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/domestic-artist-profile/playlist-apply', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun,
          forceAllow: playlistForceAllow,
          artistName: name || null,
          items: playlistItems.map((item) => ({
            videoId: item.videoId,
            artist: item.artist,
            title: item.title,
            displayTitle: item.displayTitle,
            releaseDate: item.releaseDate,
            songTitleJa: item.songTitleJa,
            youtubeDate: item.youtubeDate,
            genres: item.genres,
            include: item.include,
            rawTitle: item.rawTitle,
            channelTitle: item.channelTitle,
            channelId: item.channelId,
            creditArtists: item.creditArtists,
          })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as PlaylistApplyResponse;
      if (!res.ok) {
        setError(data.error ?? 'プレイリスト投入に失敗しました。');
        return;
      }
      const s = data.summary;
      setMessage(
        dryRun
          ? `dry-run 完了: 投入可 ${s?.dryRun ?? 0} / 既存スキップ ${s?.skippedExisting ?? 0} / ゲート ${s?.skippedGate ?? 0}`
          : `一括保存完了: 登録 ${s?.imported ?? 0} / 既存スキップ ${s?.skippedExisting ?? 0} / 失敗 ${s?.failed ?? 0}`,
      );
      if (!dryRun) {
        const done = new Set(
          (data.results ?? [])
            .filter((r) => r.status === 'imported' || r.status === 'skipped_existing')
            .map((r) => r.videoId),
        );
        if (done.size > 0) {
          setPlaylistItems((prev) => {
            const next = prev
              .filter((item) => !done.has(item.videoId))
              .map((item, i) => ({ ...item, index: i + 1 }));
            setPlaylistSummary((summary) =>
              summary
                ? {
                    ...summary,
                    total: next.length,
                    included: next.filter((i) => i.include).length,
                  }
                : summary,
            );
            return next;
          });
        }
        if ((s?.imported ?? 0) > 0 && name) {
          void loadRegisteredSongs(name, draft?.catalogScope ?? 'all');
        }
      }
    } catch {
      setError('プレイリスト投入に失敗しました。');
    } finally {
      setApplyingPlaylist(false);
    }
  }

  async function runDomesticSpotifyEnrich(): Promise<void> {
    const name = (draft?.name ?? artistName).trim();
    if (!name || missingSpotifyCount === 0) return;
    setSpotifyEnrichBusy(true);
    setSpotifyEnrichMsg(null);
    setError(null);
    try {
      const dryRes = await fetch('/api/admin/domestic-songs-spotify-enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dryRun: true, artistName: name, limit: 30 }),
      });
      const dryData = (await dryRes.json().catch(() => ({}))) as {
        error?: string;
        summary?: {
          targets?: number;
          wouldUpdate?: number;
          wouldReview?: number;
          skippedNoMatch?: number;
          skippedNoToken?: number;
        };
      };
      if (!dryRes.ok) {
        setSpotifyEnrichMsg(dryData.error ?? 'Spotify 一括取得に失敗しました。');
        return;
      }
      const s = dryData.summary;
      if (
        (s?.skippedNoToken ?? 0) > 0 &&
        (s?.wouldUpdate ?? 0) === 0 &&
        (s?.wouldReview ?? 0) === 0
      ) {
        setSpotifyEnrichMsg(
          'SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET が未設定か無効です。.env.local を確認してください。',
        );
        return;
      }
      if ((s?.wouldUpdate ?? 0) === 0 && (s?.wouldReview ?? 0) === 0) {
        setSpotifyEnrichMsg(
          `未取得 ${missingSpotifyCount} 件を照会しましたが、反映・レビュー候補はありませんでした（対象 ${s?.targets ?? 0} / 未ヒット ${s?.skippedNoMatch ?? 0}）。`,
        );
        return;
      }

      const ok = window.confirm(
        `Spotify 未取得（表示上 ${missingSpotifyCount} 件）のうち、反映 ${s?.wouldUpdate ?? 0} 件・レビューキュー ${s?.wouldReview ?? 0} 件があります。DB に反映しますか？`,
      );
      if (!ok) {
        setSpotifyEnrichMsg(
          `プレビュー完了: 反映 ${s?.wouldUpdate ?? 0} / レビュー ${s?.wouldReview ?? 0}（キャンセルしました）。`,
        );
        return;
      }

      const applyRes = await fetch('/api/admin/domestic-songs-spotify-enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dryRun: false, artistName: name, limit: 30 }),
      });
      const applyData = (await applyRes.json().catch(() => ({}))) as {
        error?: string;
        summary?: { updated?: number; queuedReview?: number };
      };
      if (!applyRes.ok) {
        setSpotifyEnrichMsg(applyData.error ?? 'DB反映に失敗しました。');
        return;
      }
      setSpotifyEnrichMsg(
        `Spotify を反映 ${applyData.summary?.updated ?? 0} 件、レビューキュー ${applyData.summary?.queuedReview ?? 0} 件。曖昧なものは /admin/spotify-review-queue で確認できます。`,
      );
      void loadRegisteredSongs(name, draft?.catalogScope ?? 'all');
    } catch {
      setSpotifyEnrichMsg('Spotify 一括取得に失敗しました。');
    } finally {
      setSpotifyEnrichBusy(false);
    }
  }

  async function runMusicBrainzReleaseDates(): Promise<void> {
    const name = (draft?.name ?? artistName).trim();
    if (!name || missingDateCount === 0) return;
    setMbDateBusy(true);
    setMbDateMsg(null);
    setError(null);
    try {
      const songIds = missingDateItems.map((s) => s.id);
      const dryRes = await fetch('/api/admin/songs-batch-musicbrainz-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ songIds, dryRun: true }),
      });
      const dryData = (await dryRes.json().catch(() => ({}))) as {
        error?: string;
        summary?: {
          wouldUpdate?: number;
          skippedNotFound?: number;
          skippedNoDate?: number;
        };
        results?: Array<{
          songId: string;
          status: string;
          originalReleaseDate: string | null;
        }>;
      };
      if (!dryRes.ok) {
        setMbDateMsg(dryData.error ?? 'MusicBrainz 原盤日の取得に失敗しました。');
        return;
      }

      const updates = (dryData.results ?? [])
        .filter((r) => r.status === 'would_update' && r.originalReleaseDate)
        .map((r) => ({
          songId: r.songId,
          originalReleaseDate: r.originalReleaseDate as string,
        }));

      if (updates.length === 0) {
        const s = dryData.summary;
        setMbDateMsg(
          `原盤日未取得 ${missingDateCount} 件を照会しましたが、補完できる日付はありませんでした（MB未ヒット ${s?.skippedNotFound ?? 0} / MB日付なし ${s?.skippedNoDate ?? 0}）。`,
        );
        return;
      }

      const ok = window.confirm(
        `原盤日が未登録の ${missingDateCount} 件のうち、${updates.length} 件に MusicBrainz 原盤日があります。DB に反映しますか？`,
      );
      if (!ok) {
        setMbDateMsg(`プレビュー完了: ${updates.length} 件を反映可能（キャンセルしました）。`);
        return;
      }

      const applyRes = await fetch('/api/admin/songs-batch-musicbrainz-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dryRun: false, updates }),
      });
      const applyData = (await applyRes.json().catch(() => ({}))) as {
        error?: string;
        summary?: { updated?: number };
      };
      if (!applyRes.ok) {
        setMbDateMsg(applyData.error ?? 'DB反映に失敗しました。');
        return;
      }
      setMbDateMsg(
        `原盤日を ${applyData.summary?.updated ?? updates.length} 件反映しました。`,
      );
      void loadRegisteredSongs(name, draft?.catalogScope ?? 'all');
    } catch {
      setMbDateMsg('MusicBrainz 原盤日の取得に失敗しました。');
    } finally {
      setMbDateBusy(false);
    }
  }

  function patchPlaylistItem(index: number, patch: Partial<PlaylistFetchItem>): void {
    setPlaylistItems((prev) => {
      const next = prev.map((item) => (item.index === index ? { ...item, ...patch } : item));
      if ('include' in patch) {
        setPlaylistSummary((summary) =>
          summary ? { ...summary, included: next.filter((i) => i.include).length } : summary,
        );
      }
      return next;
    });
  }

  function patchPlaylistArtistsField(index: number, raw: string): void {
    const { mainArtist, creditArtists } = parsePlaylistArtistsField(raw);
    setPlaylistItems((prev) =>
      prev.map((item) => {
        if (item.index !== index) return item;
        const title = item.title.trim();
        return {
          ...item,
          artist: mainArtist || item.artist,
          creditArtists,
          displayTitle:
            mainArtist && title ? `${mainArtist} - ${title}` : title || item.displayTitle,
          titleEdited: true,
        };
      }),
    );
  }

  function patchPlaylistTitleField(index: number, titleRaw: string): void {
    const title = titleRaw;
    setPlaylistItems((prev) =>
      prev.map((item) => {
        if (item.index !== index) return item;
        const artist = item.artist.trim();
        const trimmed = title.trim();
        return {
          ...item,
          title,
          displayTitle: artist && trimmed ? `${artist} - ${trimmed}` : trimmed || item.displayTitle,
          titleEdited: true,
        };
      }),
    );
  }

  async function runSave(dryRun: boolean): Promise<void> {
    if (!draft) {
      setError('保存するデータがありません。');
      return;
    }
    const synced = withSyncedAdminArtistDisplayName(draft);
    if (!synced.name.trim() && !synced.nameBase.trim()) {
      setError('保存するデータがありません。');
      return;
    }
    setDraft(synced);
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/domestic-artist-profile/save', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: synced,
          artistId,
          aiModel,
          dryRun,
          ...(memberGraphReady
            ? {
                memberIds: memberPeople.map((m) => m.id),
                bandIds: memberBands.map((b) => b.id),
              }
            : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as SaveResponse;
      if (!res.ok) {
        setError(data.error ?? '保存に失敗しました。');
        return;
      }
      if (data.artistId) {
        setArtistId(data.artistId);
        if (mode === 'new' && !dryRun) {
          window.location.href = `/admin/domestic-artist-register/${data.artistId}`;
          return;
        }
      }
      setMessage(
        dryRun
          ? `dry-run OK（${data.mode === 'insert' ? '新規 insert' : '既存 update'} 予定）`
          : `DB 保存完了（${data.mode === 'insert' ? '新規' : '更新'}）`,
      );
    } catch {
      setError('保存に失敗しました。');
    } finally {
      setSaving(false);
    }
  }

  function patchDraft(partial: Partial<AdminArtistProfileDraft>): void {
    setDraft((prev) => (prev ? { ...prev, ...partial } : prev));
  }

  function patchNameParts(partial: {
    nameBase?: string;
    thePrefix?: AdminArtistThePrefix | null;
  }): void {
    setDraft((prev) => {
      if (!prev) return prev;
      const nameBase = partial.nameBase !== undefined ? partial.nameBase : prev.nameBase;
      const thePrefix =
        partial.thePrefix !== undefined ? partial.thePrefix : prev.thePrefix;
      return withSyncedAdminArtistDisplayName({
        ...prev,
        nameBase,
        thePrefix,
      });
    });
  }

  function onNameBaseBlur(): void {
    if (!draft) return;
    const parts = splitAdminArtistNameParts(draft.nameBase);
    if (!parts.nameBase) return;
    // 先頭の The/A/An だけ prefix へ。途中の And The は切らない
    if (parts.thePrefix && parts.nameBase !== draft.nameBase.trim()) {
      patchNameParts({ nameBase: parts.nameBase, thePrefix: parts.thePrefix });
    } else {
      patchNameParts({ nameBase: parts.nameBase });
    }
  }

  const occupationsText = draft?.occupations.join(', ') ?? '';
  const status = draft
    ? resolveDomesticArtistRegistrationStatus({
        description_en: draft.descriptionEn,
        profile_text: draft.profileText,
        name_ja: draft.nameJa,
        origin_country: draft.originCountry,
        active_period: draft.activePeriod,
        birth_date: draft.birthDate,
        death_date: draft.deathDate,
        occupations: draft.occupations,
        spotify_artist_id: draft.spotifyArtistId,
        youtube_channel_id: draft.youtubeChannelId,
        wikipedia_page: draft.wikipediaPage,
        wikipedia_url: draft.wikipediaUrl,
      })
    : null;

  const pageTitle =
    mode === 'edit'
      ? draft?.catalogScope === 'western'
        ? '洋楽アーティスト編集'
        : draft?.catalogScope === 'domestic'
          ? '邦楽アーティスト編集'
          : 'アーティスト編集'
      : 'アーティスト新規登録';

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-8 text-gray-100 sm:px-6">
      <AdminMenuBar />
      <Link
        href="/admin/domestic-artist-register"
        className="text-sm text-sky-300 hover:underline"
      >
        ← 一覧に戻る
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
        {pageTitle}
      </h1>
      {mode === 'edit' && draft ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
          <RegistrationStatusIcons status={status!} />
          <span>段階 {status!.stage}/5</span>
          <span className="rounded border border-gray-700 px-1.5 py-0.5 text-[11px] text-gray-300">
            catalog: {draft.catalogScope}
          </span>
        </div>
      ) : (
        <p className="mt-2 text-sm text-gray-400">
          邦楽・洋楽共通の artists 編集画面です。名前入力 → 「① 既存を読込」または「② AI 生成」→
          ③確認 → DB 保存。選曲で insert された行は{' '}
          <Link href="/admin/artists-newly-registered" className="text-sky-300 hover:underline">
            選曲登録アーティスト（日別）
          </Link>
          から編集できます。
        </p>
      )}

      {mode === 'new' ? (
        <section className="mt-6 rounded-lg border border-gray-800 bg-gray-900/60 p-4">
          <Field label="アーティスト名">
            <input
              type="text"
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
              placeholder="例: 米津玄師"
              className={inputClass}
            />
          </Field>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadExistingByName(artistName)}
              disabled={loading || !artistName.trim()}
              className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-40"
            >
              {loading ? '読込中…' : '① 既存を読込'}
            </button>
            <button
              type="button"
              onClick={() => void runGenerate()}
              disabled={generating || !artistName.trim()}
              className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40"
            >
              {generating ? '生成中…' : '② AIで生成して反映（青）'}
            </button>
            <button
              type="button"
              onClick={() => void runImportExternalGemini()}
              disabled={!draft && !artistName.trim()}
              title="Gemini タブで拡張「アーティスト保存」直後にクリック（クリップボード JSON）"
              className="rounded border border-violet-600/80 bg-violet-950/40 px-4 py-2 text-sm font-medium text-violet-100 hover:bg-violet-900/50 disabled:opacity-40"
            >
              外部Gemini取り込み
            </button>
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            API 再生成が使えないとき: 別タブ Gemini で生成 → 拡張「アーティスト保存」→「外部Gemini取り込み」
          </p>
        </section>
      ) : null}

      {loading && mode === 'edit' ? (
        <p className="mt-6 text-sm text-gray-400">読み込み中…</p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-emerald-300">{message}</p> : null}

      {draft && !loading ? (
        <section className="mt-6 space-y-4 rounded-lg border border-gray-800 bg-gray-900/40 p-4">
          <h2 className="text-sm font-semibold text-amber-200">
            {mode === 'new' ? '③ 内容確認・編集' : '内容確認・編集'}
          </h2>
          {mode === 'edit' ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void runGenerate()}
                disabled={generating}
                className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40"
              >
                {generating ? '生成中…' : 'AIで再生成（青）'}
              </button>
              <button
                type="button"
                onClick={() => void runImportExternalGemini()}
                title="Gemini タブで拡張「アーティスト保存」直後にクリック（クリップボード JSON）"
                className="rounded border border-violet-600/80 bg-violet-950/40 px-4 py-2 text-sm font-medium text-violet-100 hover:bg-violet-900/50"
              >
                外部Gemini取り込み
              </button>
              <span className="text-[11px] text-gray-500">
                API不可時: Gemini→拡張「アーティスト保存」→このボタン
              </span>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-2">
              <Field label="本体名 (name_base)">
                <input
                  className={inputClass}
                  value={draft.nameBase}
                  onChange={(e) => patchNameParts({ nameBase: e.target.value })}
                  onBlur={() => onNameBaseBlur()}
                  placeholder="冠詞なし（例: Sways / Strokes / Tom Petty And The Heartbreakers）"
                />
              </Field>
              <p className="text-[11px] text-gray-500">
                先頭が The/A/An のときだけ Prefix に分離します。途中の「And The …」はバンド名としてそのまま残します。
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-200">
                  <input
                    type="checkbox"
                    checked={draft.thePrefix === 'The'}
                    onChange={(e) =>
                      patchNameParts({
                        thePrefix: e.target.checked
                          ? 'The'
                          : draft.thePrefix === 'The'
                            ? null
                            : draft.thePrefix,
                      })
                    }
                    className="h-3.5 w-3.5 rounded border-gray-600 bg-gray-950 text-sky-500 focus:ring-sky-500/40"
                  />
                  <span>Include &quot;The&quot; Prefix（Music8 / WP と同様）</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-400">
                  冠詞
                  <select
                    className="rounded border border-gray-700 bg-gray-950 px-2 py-1 text-sm text-white"
                    value={draft.thePrefix ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      patchNameParts({
                        thePrefix: normalizeAdminArtistThePrefix(v || null),
                      });
                    }}
                  >
                    <option value="">なし</option>
                    <option value="The">The</option>
                    <option value="A">A</option>
                    <option value="An">An</option>
                  </select>
                </label>
              </div>
              <p className="text-xs text-gray-500">
                表示名 (name):{' '}
                <span className="font-medium text-gray-300">
                  {composeAdminArtistDisplayName(draft.nameBase, draft.thePrefix) || '（未入力）'}
                </span>
                <span className="ml-2 text-gray-600">
                  — AI 再生成・Spotify 取得はこの表示名で検索します
                </span>
              </p>
            </div>
            <Field label="英語名 (name_en)">
              <input
                className={inputClass}
                value={draft.nameEn ?? ''}
                onChange={(e) => patchDraft({ nameEn: e.target.value || null })}
                placeholder="英語表記（例: Bruno Mars）"
              />
            </Field>
            <Field label="日本語読み (name_ja)">
              <input
                className={inputClass}
                value={draft.nameJa ?? ''}
                onChange={(e) => patchDraft({ nameJa: e.target.value || null })}
              />
            </Field>
            <Field label="Origin (origin_country)">
              <input
                className={inputClass}
                value={draft.originCountry ?? ''}
                onChange={(e) => patchDraft({ originCountry: e.target.value || null })}
              />
            </Field>
            <Field label="活動期間 (active_period)">
              <input
                className={inputClass}
                value={draft.activePeriod ?? ''}
                onChange={(e) => patchDraft({ activePeriod: e.target.value || null })}
              />
            </Field>
            <Field label="生年月日 (birth_date)">
              <input
                className={inputClass}
                value={draft.birthDate ?? ''}
                onChange={(e) => patchDraft({ birthDate: e.target.value || null })}
                placeholder="YYYY.MM.DD"
              />
            </Field>
            <Field label="永眠 (death_date)">
              <input
                className={inputClass}
                value={draft.deathDate ?? ''}
                onChange={(e) => patchDraft({ deathDate: e.target.value || null })}
                placeholder="YYYY.MM.DD"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Occupation（Music8 / WP と同項目）">
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3 md:grid-cols-4">
                  {ARTIST_OCCUPATION_OPTIONS.map((opt) => {
                    const checked = isArtistOccupationSelected(draft.occupations, opt);
                    return (
                      <label
                        key={opt.value}
                        className="flex cursor-pointer items-center gap-2 text-sm text-gray-200"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            patchDraft({
                              occupations: toggleArtistOccupation(draft.occupations, opt),
                            })
                          }
                          className="h-3.5 w-3.5 rounded border-gray-600 bg-gray-950 text-sky-500 focus:ring-sky-500/40"
                        />
                        <span>{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
                {extraArtistOccupations(draft.occupations).length > 0 ? (
                  <p className="mt-2 text-xs text-amber-200/90">
                    一覧外の値:{' '}
                    {extraArtistOccupations(draft.occupations).join(', ')}
                    （保存時はそのまま残します）
                  </p>
                ) : null}
                <p className="mt-1 text-[11px] text-gray-500">
                  選択中: {occupationsText || '（なし）'}
                </p>
              </Field>
            </div>
            <AdminArtistMemberRelationEditor
              selfId={artistId}
              bands={memberBands}
              members={memberPeople}
              membersFallback={membersFallback}
              hints={memberHints}
              disabled={saving}
              onChange={(next) => {
                setMemberBands(next.bands);
                setMemberPeople(next.members);
                setMemberGraphReady(true);
              }}
            />
            <Field label="catalog_scope">
              <select
                className={inputClass}
                value={draft.catalogScope}
                onChange={(e) =>
                  patchDraft({
                    catalogScope: e.target.value as AdminArtistProfileDraft['catalogScope'],
                  })
                }
              >
                <option value="domestic">domestic</option>
                <option value="western">western</option>
                <option value="unknown">unknown</option>
              </select>
            </Field>
          </div>
          <Field label="概要（英） description_en">
            <textarea
              className={`${inputClass} min-h-[4rem]`}
              value={draft.descriptionEn ?? ''}
              onChange={(e) => patchDraft({ descriptionEn: e.target.value || null })}
            />
          </Field>
          <Field label="プロフィール（日） profile_text">
            <textarea
              className={`${inputClass} min-h-[10rem]`}
              value={draft.profileText ?? ''}
              onChange={(e) => patchDraft({ profileText: e.target.value || null })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="spotify_artist_id">
              <div className="flex flex-wrap gap-2">
                <input
                  className={`${inputClass} min-w-[12rem] flex-1`}
                  value={draft.spotifyArtistId ?? ''}
                  onChange={(e) => patchDraft({ spotifyArtistId: e.target.value || null })}
                  placeholder="22文字 ID または https://open.spotify.com/artist/…"
                />
                <button
                  type="button"
                  onClick={() => void runFetchSpotifyArtistById()}
                  disabled={fetchingSpotify}
                  className="shrink-0 rounded border border-green-700/80 bg-green-950/40 px-3 py-2 text-xs font-medium text-green-100 hover:bg-green-900/50 disabled:opacity-40"
                >
                  {fetchingSpotify ? '取得中…' : 'このIDで取得'}
                </button>
                <button
                  type="button"
                  onClick={() => void runFetchSpotifyArtist()}
                  disabled={fetchingSpotify}
                  className="shrink-0 rounded border border-emerald-700/80 bg-emerald-950/30 px-3 py-2 text-xs font-medium text-emerald-100 hover:bg-emerald-900/40 disabled:opacity-40"
                >
                  {fetchingSpotify ? '取得中…' : '名前で検索'}
                </button>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                ID / URL が分かっているときは「このIDで取得」。名前検索は右のボタン（下書きへの反映のみ。保存が必要です）。
              </p>
              {draft.spotifyArtistPopularity != null ? (
                <p className="mt-1 text-xs text-gray-400">人気度: {draft.spotifyArtistPopularity}</p>
              ) : null}
              {draft.spotifyArtistId ? (
                <a
                  href={`https://open.spotify.com/artist/${draft.spotifyArtistId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs text-sky-300 hover:underline"
                >
                  Spotify で開く
                </a>
              ) : null}
              {draft.spotifyArtistImages ? (
                <div className="mt-3">
                  <a
                    href={draft.spotifyArtistImages}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="画像を別タブで開く"
                    className="inline-block rounded border border-gray-700 transition hover:border-sky-500 hover:opacity-90"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={draft.spotifyArtistImages}
                      alt=""
                      className="h-56 w-56 rounded object-cover sm:h-64 sm:w-64"
                    />
                  </a>
                </div>
              ) : null}
            </Field>
            <Field label="youtube_channel_id">
              <div className="flex flex-wrap gap-2">
                <input
                  className={`${inputClass} min-w-[12rem] flex-1`}
                  value={draft.youtubeChannelId ?? ''}
                  onChange={(e) => patchDraft({ youtubeChannelId: e.target.value || null })}
                  placeholder="UC… または @ArtOfficialMusic"
                />
                <button
                  type="button"
                  onClick={() => void runFetchYoutubeChannel()}
                  disabled={fetchingYoutube}
                  className="shrink-0 rounded border border-red-700/80 bg-red-950/30 px-3 py-2 text-xs font-medium text-red-100 hover:bg-red-900/40 disabled:opacity-40"
                >
                  {fetchingYoutube ? '取得中…' : 'YouTubeチャンネル取得'}
                </button>
              </div>
              {draft.youtubeChannelTitle ? (
                <p className="mt-1 text-xs text-gray-400">{draft.youtubeChannelTitle}</p>
              ) : null}
              {(() => {
                const href = resolveYoutubeChannelHref(draft.youtubeChannelId);
                return href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs text-sky-300 hover:underline"
                  >
                    YouTube で開く
                  </a>
                ) : null;
              })()}
            </Field>
            <Field label="wikipedia_page">
              <div className="flex flex-wrap gap-2">
                <input
                  className={`${inputClass} min-w-[12rem] flex-1`}
                  value={draft.wikipediaPage ?? ''}
                  onChange={(e) => patchDraft({ wikipediaPage: e.target.value || null })}
                  placeholder="Velveteen_Queen"
                />
                <button
                  type="button"
                  onClick={() => void runFetchWikipediaPage()}
                  disabled={fetchingWikipedia}
                  className="shrink-0 rounded border border-violet-700/80 bg-violet-950/30 px-3 py-2 text-xs font-medium text-violet-100 hover:bg-violet-900/40 disabled:opacity-40"
                >
                  {fetchingWikipedia ? '取得中…' : 'Wikipedia取得'}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-gray-500">
                英語版スラッグ（https://en.wikipedia.org/wiki/ の後）。日本語名なら ja.wikipedia.org。
              </p>
            </Field>
            <Field label="wikipedia_url（英語版以外）">
              <input
                className={inputClass}
                value={draft.wikipediaUrl ?? ''}
                onChange={(e) => patchDraft({ wikipediaUrl: e.target.value || null })}
                placeholder="https://de.wikipedia.org/wiki/Velveteen_Queen"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                英語版以外の記事 URL。値があると Wikipedia リンクはこちらを優先します。
              </p>
              {draft.wikipediaUrl?.trim() && !normalizeWikipediaArticleHref(draft.wikipediaUrl) ? (
                <p className="mt-1 text-[11px] text-amber-300">
                  https://de.wikipedia.org/wiki/記事名 の形式にしてください。
                </p>
              ) : null}
              {(() => {
                const href = resolveArtistWikipediaHref({
                  wikipedia_url: draft.wikipediaUrl,
                  wikipedia_page: draft.wikipediaPage,
                });
                return href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs text-sky-300 hover:underline"
                  >
                    Wikipedia で開く
                  </a>
                ) : null;
              })()}
            </Field>
          </div>

          <div className="space-y-3 rounded-lg border border-emerald-800/50 bg-emerald-950/15 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-emerald-100">
                登録曲{' '}
                <span className="font-normal text-emerald-200/80">
                  {loadingRegisteredSongs
                    ? '…'
                    : `${registeredSongs.length} 件`}
                </span>
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                {(draft?.name ?? artistName).trim() ? (
                  <Link
                    href={`/admin/songs?q=${encodeURIComponent((draft?.name ?? artistName).trim())}`}
                    className="text-xs text-sky-300 hover:underline"
                  >
                    曲ダッシュボードで開く
                  </Link>
                ) : null}
                <button
                  type="button"
                  disabled={loadingRegisteredSongs || !(draft?.name ?? artistName).trim()}
                  onClick={() =>
                    void loadRegisteredSongs(draft?.name ?? artistName, draft?.catalogScope ?? 'all')
                  }
                  className="rounded border border-emerald-700/70 px-2 py-1 text-xs text-emerald-100 hover:bg-emerald-900/40 disabled:opacity-40"
                >
                  {loadingRegisteredSongs ? '更新中…' : '再読込'}
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              main_artist / song_credits 経由でこのアーティストに紐づく邦楽曲。YouTube
              は代表 video へのリンクです。
            </p>
            {missingSpotifyCount > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={
                    spotifyEnrichBusy ||
                    mbDateBusy ||
                    loadingRegisteredSongs ||
                    !(draft?.name ?? artistName).trim()
                  }
                  onClick={() => void runDomesticSpotifyEnrich()}
                  className="rounded border border-green-700/80 bg-green-950/30 px-2.5 py-1 text-xs text-green-100 hover:bg-green-900/40 disabled:opacity-40"
                >
                  {spotifyEnrichBusy
                    ? 'Spotify取得中…'
                    : `Spotify未取得を一括取得（${missingSpotifyCount}件）`}
                </button>
                <span className="text-xs text-gray-500">
                  track ID / popularity が空の曲（最大30件）。曖昧なものはレビューキューへ。
                </span>
              </div>
            ) : null}
            {missingDateCount > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={
                    mbDateBusy ||
                    spotifyEnrichBusy ||
                    loadingRegisteredSongs ||
                    !(draft?.name ?? artistName).trim()
                  }
                  onClick={() => void runMusicBrainzReleaseDates()}
                  className="rounded border border-sky-700/80 bg-sky-950/30 px-2.5 py-1 text-xs text-sky-100 hover:bg-sky-900/40 disabled:opacity-40"
                >
                  {mbDateBusy
                    ? 'MB原盤日取得中…'
                    : `原盤日未取得を一括取得（${missingDateCount}件）`}
                </button>
                <span className="text-xs text-gray-500">
                  表示中のうち原盤日が空の曲だけ MusicBrainz 照会（既存日付は触りません）
                </span>
              </div>
            ) : null}
            {spotifyEnrichMsg ? (
              <p className="text-xs text-green-200" role="status">
                {spotifyEnrichMsg}
              </p>
            ) : null}
            {mbDateMsg ? (
              <p className="text-xs text-sky-200" role="status">
                {mbDateMsg}
              </p>
            ) : null}
            {registeredSongsError ? (
              <p className="text-xs text-red-400" role="alert">
                {registeredSongsError}
              </p>
            ) : null}
            {!loadingRegisteredSongs && registeredSongs.length === 0 && !registeredSongsError ? (
              <p className="text-xs text-gray-500">まだ登録曲がありません。④でプレイリストから投入できます。</p>
            ) : null}
            {registeredSongs.length > 0 ? (
              <div className="max-h-64 overflow-auto rounded border border-gray-800">
                <table className="w-full min-w-[40rem] text-left text-xs">
                  <thead className="sticky top-0 bg-gray-900 text-gray-400">
                    <tr>
                      <th className="px-2 py-1">#</th>
                      <th className="px-2 py-1">カバー</th>
                      <th className="px-2 py-1">曲名</th>
                      <th className="px-2 py-1">Genre BEST</th>
                      <th className="px-2 py-1">ヨミ</th>
                      <th className="px-2 py-1">原盤日</th>
                      <th className="px-2 py-1 text-right">人気</th>
                      <th className="px-2 py-1">YouTube</th>
                      <th className="px-2 py-1">詳細</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registeredSongs.map((song, i) => (
                      <tr key={song.id} className="border-t border-gray-800/80">
                        <td className="px-2 py-1 tabular-nums text-gray-500">{i + 1}</td>
                        <td className="px-2 py-1">
                          <SongCoverThumb
                            spotifyImages={song.spotify_images}
                            videoId={song.video_id}
                            alt=""
                            className="h-10 w-10"
                          />
                        </td>
                        <td className="px-2 py-1 text-gray-200">
                          {song.song_title || song.display_title || '—'}
                        </td>
                        <td className="px-2 py-1">
                          <GenreBestRegisteredLabelLinks labels={genreBestLabelsBySong[song.id]} />
                        </td>
                        <td className="px-2 py-1 text-gray-400">{song.song_title_ja ?? '—'}</td>
                        <td className="px-2 py-1 tabular-nums text-gray-400">
                          {song.original_release_date ?? '—'}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-gray-300">
                          {song.spotify_popularity != null ? song.spotify_popularity : '—'}
                        </td>
                        <td className="px-2 py-1">
                          {song.youtube_url ? (
                            <a
                              href={song.youtube_url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-[10px] text-sky-300 hover:underline"
                              title={song.video_id ?? undefined}
                            >
                              開く
                            </a>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1">
                          <Link
                            href={`/admin/songs/${song.id}?q=${encodeURIComponent((draft?.name ?? artistName).trim())}`}
                            className="text-amber-200 hover:underline"
                          >
                            編集
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          <div className="space-y-3 rounded-lg border border-amber-800/60 bg-amber-950/20 p-4">
            <h3 className="text-sm font-semibold text-amber-100">④ プレイリストから曲取得</h3>
            <p className="text-xs leading-relaxed text-gray-400">
              URL 取得 → 表でアーティスト（カンマ区切りで共演）・曲名・日本語読みを修正 → 一括保存。DB
              に既にある YouTube ID は飛ばし、未登録が「最大件数」に達するまで続きから集めます。日本語読みは
              MB aliases があれば自動入力、なければ手入力（ライブラリ検索用）。原盤日と YT
              公開日は別項目です。
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[16rem] flex-1 text-xs text-gray-400">
                プレイリスト URL
                <input
                  className={`${inputClass} mt-1`}
                  value={playlistUrl}
                  onChange={(e) => setPlaylistUrl(e.target.value)}
                  placeholder="https://www.youtube.com/playlist?list=PL..."
                />
              </label>
              <label className="w-28 text-xs text-gray-400">
                未登録の最大件数
                <input
                  type="number"
                  min={1}
                  max={100}
                  className={`${inputClass} mt-1`}
                  value={playlistMaxItems}
                  onChange={(e) => setPlaylistMaxItems(Number(e.target.value) || 10)}
                />
              </label>
              <button
                type="button"
                onClick={() => void runFetchPlaylist()}
                disabled={fetchingPlaylist}
                className="rounded border border-amber-600/80 bg-amber-900/40 px-4 py-2 text-sm font-medium text-amber-50 hover:bg-amber-800/50 disabled:opacity-40"
              >
                {fetchingPlaylist ? '取得中…' : '1. プレイリスト取得'}
              </button>
            </div>
            {playlistSummary ? (
              <p className="text-xs text-gray-400">
                表 {playlistSummary.total} 件
                {playlistSummary.playlistFetched != null
                  ? `（PL読込 ${playlistSummary.playlistFetched}）`
                  : ''}{' '}
                / 既存スキップ {playlistSummary.skippedExisting ?? playlistSummary.existingVideos} /
                include {playlistSummary.included} / ゲート OK {playlistSummary.gateOk} / 原盤日あり{' '}
                {playlistSummary.withReleaseDate}
              </p>
            ) : null}
            {playlistItems.length > 0 ? (
              <div className="max-h-[28rem] overflow-auto rounded border border-gray-800">
                <table className="w-full min-w-[52rem] text-left text-xs">
                  <thead className="sticky top-0 bg-gray-900 text-gray-400">
                    <tr>
                      <th className="px-2 py-1">#</th>
                      <th className="px-2 py-1">保存</th>
                      <th className="px-2 py-1">videoId</th>
                      <th className="px-2 py-1 min-w-[10rem]">アーティスト（カンマ区切り）</th>
                      <th className="px-2 py-1 min-w-[10rem]">曲名</th>
                      <th className="px-2 py-1">一致</th>
                      <th className="px-2 py-1">ゲート</th>
                      <th className="px-2 py-1 min-w-[6rem]">日本語読み</th>
                      <th className="px-2 py-1">原盤日</th>
                      <th className="px-2 py-1">YT公開日</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playlistItems.map((item) => (
                      <tr key={item.videoId} className="border-t border-gray-800/80 align-top">
                        <td className="px-2 py-1 tabular-nums text-gray-500">{item.index}</td>
                        <td className="px-2 py-1">
                          <input
                            type="checkbox"
                            checked={item.include}
                            onChange={(e) =>
                              patchPlaylistItem(item.index, { include: e.target.checked })
                            }
                          />
                        </td>
                        <td className="px-2 py-1">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-[10px] text-sky-300 hover:underline"
                          >
                            {item.videoId}
                          </a>
                          {item.note ? (
                            <p className="mt-0.5 max-w-[8rem] text-[10px] text-amber-200/90">
                              {item.note}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-2 py-1">
                          <input
                            className="w-full min-w-[9rem] rounded border border-gray-700 bg-gray-950 px-1.5 py-1 text-xs text-gray-100"
                            value={formatPlaylistArtistsField(item.artist, item.creditArtists)}
                            onChange={(e) => patchPlaylistArtistsField(item.index, e.target.value)}
                            placeholder="main, credit…"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            className="w-full min-w-[9rem] rounded border border-gray-700 bg-gray-950 px-1.5 py-1 text-xs text-gray-100"
                            value={item.title}
                            onChange={(e) => patchPlaylistTitleField(item.index, e.target.value)}
                          />
                          {item.titleEdited ? (
                            <p className="mt-0.5 text-[10px] text-emerald-300">手修正</p>
                          ) : null}
                          {item.rawTitle && item.rawTitle !== item.title ? (
                            <p
                              className="mt-0.5 max-w-[14rem] truncate text-[10px] text-gray-500"
                              title={item.rawTitle}
                            >
                              YT: {item.rawTitle}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-2 py-1 text-gray-400">{item.artistMatch}</td>
                        <td className="px-2 py-1 text-gray-400">
                          {item.officialGate.persist ? 'OK' : item.officialGate.reason}
                        </td>
                        <td className="px-2 py-1">
                          <input
                            className="w-full min-w-[5rem] rounded border border-gray-700 bg-gray-950 px-1.5 py-1 text-xs text-gray-100"
                            value={item.songTitleJa ?? ''}
                            onChange={(e) =>
                              patchPlaylistItem(item.index, {
                                songTitleJa: e.target.value,
                                titleEdited: true,
                              })
                            }
                            placeholder="レモン"
                          />
                        </td>
                        <td className="px-2 py-1 text-gray-400">{item.releaseDate ?? '—'}</td>
                        <td className="px-2 py-1 text-gray-400">{item.youtubeDate ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {playlistItems.length > 0 ? (
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={playlistForceAllow}
                    onChange={(e) => setPlaylistForceAllow(e.target.checked)}
                  />
                  forceAllow（公式ゲート bypass）
                </label>
                <button
                  type="button"
                  onClick={() => void runApplyPlaylist(true)}
                  disabled={applyingPlaylist}
                  className="rounded border border-sky-600 px-3 py-1.5 text-xs text-sky-100 hover:bg-sky-950/50 disabled:opacity-40"
                >
                  {applyingPlaylist ? '実行中…' : '2. dry-run'}
                </button>
                <button
                  type="button"
                  onClick={() => void runApplyPlaylist(false)}
                  disabled={applyingPlaylist}
                  className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-40"
                >
                  {applyingPlaylist ? '保存中…' : '3. 一括保存（DB）'}
                </button>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-gray-800 pt-4">
            <button
              type="button"
              onClick={() => void runSave(true)}
              disabled={saving}
              className="rounded border border-sky-600 px-4 py-2 text-sm text-sky-100 hover:bg-sky-950/50 disabled:opacity-40"
            >
              dry-run
            </button>
            <button
              type="button"
              onClick={() => void runSave(false)}
              disabled={saving}
              className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-gray-950 hover:bg-amber-500 disabled:opacity-40"
            >
              {saving ? '保存中…' : 'DBに保存'}
            </button>
            {artistId ? (
              <Link
                href={`/admin/library/artist?name=${encodeURIComponent(draft.name)}`}
                className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800"
              >
                ライブラリで確認
              </Link>
            ) : null}
          </div>
          {artistId ? (
            <p className="text-xs text-gray-500">
              artist_id: <span className="font-mono text-gray-400">{artistId}</span>
            </p>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

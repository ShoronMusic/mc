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
import {
  mergeArtistEnglishNameAfterSpotify,
  mergeArtistEnglishNameAfterWikipedia,
} from '@/lib/artist-english-name';
import type { AdminArtistProfileDraft } from '@/lib/admin-artist-profile-parse';
import { resolveDomesticArtistRegistrationStatus } from '@/lib/admin-domestic-artist-registration-status';
import {
  formatPlaylistArtistsField,
  parsePlaylistArtistsField,
} from '@/lib/admin-domestic-playlist-artists-field';

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

  const loadRegisteredSongs = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setRegisteredSongs([]);
      setRegisteredSongsError(null);
      return;
    }
    setLoadingRegisteredSongs(true);
    setRegisteredSongsError(null);
    try {
      const res = await fetch(
        `/api/admin/domestic-artist-profile/songs?name=${encodeURIComponent(trimmed)}&catalog=domestic`,
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

  const loadById = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/domestic-artist-profile/lookup?id=${encodeURIComponent(id)}`,
        { credentials: 'include' },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        artist?: Record<string, unknown> | null;
      };
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
      setDraft(artistRowToDraft(data.artist, name));
      setMessage('アーティストを読み込みました。');
      void loadRegisteredSongs(name);
    } catch {
      setError('アーティストの読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [loadRegisteredSongs]);

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
        `/api/admin/domestic-artist-profile/lookup?name=${encodeURIComponent(trimmed)}`,
        { credentials: 'include' },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        artist?: Record<string, unknown> | null;
      };
      if (!res.ok) {
        setError(data.error ?? '既存データの読み込みに失敗しました。');
        return;
      }
      if (data.artist && typeof data.artist.id === 'string') {
        setArtistId(data.artist.id);
        setDraft(artistRowToDraft(data.artist, trimmed));
        setMessage('既存 artists 行を読み込みました。');
        void loadRegisteredSongs(trimmed);
      } else {
        setArtistId(null);
        setDraft(emptyDraft(trimmed));
        setRegisteredSongs([]);
        setMessage('新規アーティスト（未登録）です。');
      }
    } catch {
      setError('既存データの読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [loadRegisteredSongs]);

  useEffect(() => {
    if (mode !== 'new' || !nameFromQuery || queryBootstrapped.current) return;
    queryBootstrapped.current = true;
    setArtistName(nameFromQuery);
    if (autoloadFromQuery) {
      void loadExistingByName(nameFromQuery);
    }
  }, [mode, nameFromQuery, autoloadFromQuery, loadExistingByName]);

  async function runGenerate(): Promise<void> {
    const name = (draft?.name ?? artistName).trim();
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
        body: JSON.stringify({ artistName: name, catalog: 'domestic' }),
      });
      const data = (await res.json().catch(() => ({}))) as GenerateResponse;
      if (!res.ok) {
        setError(data.error ?? 'AI 生成に失敗しました。');
        return;
      }
      if (data.draft) {
        setDraft(data.draft);
        setAiModel(typeof data.model === 'string' ? data.model : null);
        setMessage(`Gemini で生成しました（${data.model ?? 'model'}）。内容を確認してから保存してください。`);
      }
    } catch {
      setError('AI 生成に失敗しました。');
    } finally {
      setGenerating(false);
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
          catalog: draft?.catalogScope ?? 'domestic',
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
      if (data.selected) {
        patchDraft({
          spotifyArtistId: data.selected.id,
          spotifyArtistImages: data.selected.images,
          spotifyArtistPopularity: data.selected.popularity,
          nameEn: mergeArtistEnglishNameAfterSpotify(data.selected.name),
        });
        setMessage(`Spotify アーティストを取得しました: ${data.selected.name}`);
      }
    } catch {
      setError('Spotify 取得に失敗しました。');
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
          void loadRegisteredSongs(name);
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
      void loadRegisteredSongs(name);
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
      void loadRegisteredSongs(name);
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
    if (!draft?.name.trim()) {
      setError('保存するデータがありません。');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/domestic-artist-profile/save', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft, artistId, aiModel, dryRun }),
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
      })
    : null;

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
        {mode === 'edit' ? '邦楽アーティスト編集' : '邦楽アーティスト新規登録'}
      </h1>
      {mode === 'edit' && draft ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
          <RegistrationStatusIcons status={status!} />
          <span>段階 {status!.stage}/5</span>
        </div>
      ) : (
        <p className="mt-2 text-sm text-gray-400">
          名前入力 → 「① 既存を読込」（選曲でできた行など）または「② AI 生成」→ ③確認 → DB 保存。
          選曲で insert された行は{' '}
          <Link href="/admin/artists-newly-registered" className="text-sky-300 hover:underline">
            選曲登録アーティスト（日別）
          </Link>
          の「邦楽登録で編集」が最短です。
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
          </div>
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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void runGenerate()}
                disabled={generating}
                className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40"
              >
                {generating ? '生成中…' : 'AIで再生成（青）'}
              </button>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="表示名 (name)">
              <input
                className={inputClass}
                value={draft.name}
                onChange={(e) => patchDraft({ name: e.target.value })}
              />
            </Field>
            <Field label="英語名 (name_en)">
              <input
                className={inputClass}
                value={draft.nameEn ?? ''}
                onChange={(e) => patchDraft({ nameEn: e.target.value || null })}
                placeholder="Kenshi Yonezu"
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
            <Field label="Occupation（カンマ区切り）">
              <input
                className={inputClass}
                value={occupationsText}
                onChange={(e) =>
                  patchDraft({
                    occupations: e.target.value
                      .split(/[,、/]/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </Field>
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
                  placeholder="Spotify artist ID"
                />
                <button
                  type="button"
                  onClick={() => void runFetchSpotifyArtist()}
                  disabled={fetchingSpotify}
                  className="shrink-0 rounded border border-emerald-700/80 bg-emerald-950/30 px-3 py-2 text-xs font-medium text-emerald-100 hover:bg-emerald-900/40 disabled:opacity-40"
                >
                  {fetchingSpotify ? '取得中…' : 'Spotify取得'}
                </button>
              </div>
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
                <div className="mt-2">
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
                      className="h-16 w-16 rounded object-cover"
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
                  placeholder="UC…"
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
              {draft.youtubeChannelId ? (
                <a
                  href={`https://www.youtube.com/channel/${draft.youtubeChannelId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs text-sky-300 hover:underline"
                >
                  YouTube で開く
                </a>
              ) : null}
            </Field>
            <Field label="wikipedia_page">
              <div className="flex flex-wrap gap-2">
                <input
                  className={`${inputClass} min-w-[12rem] flex-1`}
                  value={draft.wikipediaPage ?? ''}
                  onChange={(e) => patchDraft({ wikipediaPage: e.target.value || null })}
                  placeholder="Kenshi_Yonezu"
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
              {draft.wikipediaPage ? (
                <a
                  href={
                    /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(draft.wikipediaPage)
                      ? `https://ja.wikipedia.org/wiki/${encodeURIComponent(draft.wikipediaPage)}`
                      : `https://en.wikipedia.org/wiki/${encodeURIComponent(draft.wikipediaPage)}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs text-sky-300 hover:underline"
                >
                  Wikipedia で開く
                </a>
              ) : null}
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
                  onClick={() => void loadRegisteredSongs(draft?.name ?? artistName)}
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
                      <th className="px-2 py-1">曲名</th>
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
                        <td className="px-2 py-1 text-gray-200">
                          {song.song_title || song.display_title || '—'}
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

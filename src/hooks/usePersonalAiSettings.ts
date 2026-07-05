'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSupabaseAuthUserId } from '@/hooks/useSupabaseAuthUserId';
import { useAiTrialStatus } from '@/hooks/useAiTrialStatus';
import {
  DEFAULT_USER_ROOM_AI_COMMENTARY_ENABLED,
  DEFAULT_USER_ROOM_AI_NEXT_SONG_RECOMMEND_ENABLED,
  DEFAULT_USER_ROOM_AI_SONG_QUIZ_ENABLED,
} from '@/lib/user-room-ai-features';
import { dispatchUserRoomAiFeaturesUpdated } from '@/lib/user-room-ai-features-client-events';
import {
  isSubstantiveUserTasteAutoProfile,
  looksTruncatedUserTasteAutoProfile,
  userTasteAutoProfileForUse,
} from '@/lib/user-ai-taste-auto-profile';
import { mergeManualAndAutoTasteForPrompt } from '@/lib/user-ai-taste-context';
import { USER_AI_TASTE_SUMMARY_MAX_CHARS } from '@/lib/user-ai-taste-summary';
import {
  USER_PUBLIC_PROFILE_ARTIST_SLOTS,
} from '@/lib/user-public-profile';
import type { RoomAiOwnerPolicy } from '@/lib/user-room-ai-features';

export function usePersonalAiSettings(isGuest: boolean, roomAiOwnerPolicy?: RoomAiOwnerPolicy) {
  const authUserId = useSupabaseAuthUserId(isGuest);
  const { status: aiTrialStatus, state: aiTrialState } = useAiTrialStatus(isGuest);

  const [aiTasteSummary, setAiTasteSummary] = useState('');
  const [aiTasteLoading, setAiTasteLoading] = useState(false);
  const [aiTasteSaving, setAiTasteSaving] = useState(false);
  const [aiTasteAutoRefreshing, setAiTasteAutoRefreshing] = useState(false);
  const [aiTasteAutoProfileText, setAiTasteAutoProfileText] = useState('');
  const [aiTasteAutoUpdatedAt, setAiTasteAutoUpdatedAt] = useState<string | null>(null);
  const [aiTasteMessage, setAiTasteMessage] = useState<string | null>(null);

  const [publicTagline, setPublicTagline] = useState('');
  const [publicArtistSlots, setPublicArtistSlots] = useState<string[]>(() =>
    Array.from({ length: USER_PUBLIC_PROFILE_ARTIST_SLOTS }, () => ''),
  );
  const [publicListening, setPublicListening] = useState('');

  const [roomAiCommentaryEnabled, setRoomAiCommentaryEnabled] = useState(
    DEFAULT_USER_ROOM_AI_COMMENTARY_ENABLED,
  );
  const [roomAiSongQuizEnabled, setRoomAiSongQuizEnabled] = useState(
    DEFAULT_USER_ROOM_AI_SONG_QUIZ_ENABLED,
  );
  const [roomAiNextSongRecommendEnabled, setRoomAiNextSongRecommendEnabled] = useState(
    DEFAULT_USER_ROOM_AI_NEXT_SONG_RECOMMEND_ENABLED,
  );
  const [roomAiFeaturesLoading, setRoomAiFeaturesLoading] = useState(false);
  const [roomAiFeaturesSaving, setRoomAiFeaturesSaving] = useState(false);
  const [roomAiFeaturesMessage, setRoomAiFeaturesMessage] = useState<string | null>(null);

  const aiTastePromptPreview = useMemo(() => {
    const auto = userTasteAutoProfileForUse(aiTasteAutoProfileText);
    const merged = mergeManualAndAutoTasteForPrompt(aiTasteSummary, auto);
    if (merged) return merged;

    const lines: string[] = [];
    const tagline = publicTagline.trim();
    if (tagline) lines.push(`・${tagline}`);
    const artists = publicArtistSlots.map((a) => a.trim()).filter(Boolean);
    if (artists.length) lines.push(`・好きなアーティスト: ${artists.join('、')}`);
    const listening = publicListening.trim();
    if (listening) lines.push(`・${listening}`);
    return lines.length ? lines.join('\n') : null;
  }, [aiTasteSummary, aiTasteAutoProfileText, publicTagline, publicArtistSlots, publicListening]);

  useEffect(() => {
    if (isGuest || !authUserId) {
      setAiTasteSummary('');
      setAiTasteAutoProfileText('');
      setAiTasteAutoUpdatedAt(null);
      setAiTasteLoading(false);
      return;
    }
    let cancelled = false;
    setAiTasteLoading(true);
    setAiTasteMessage(null);
    void Promise.all([
      fetch('/api/user/ai-taste-summary', { credentials: 'include' }).then((r) => r.json().catch(() => null)),
      fetch('/api/user/ai-taste-auto-profile', { credentials: 'include' }).then((r) => r.json().catch(() => null)),
    ])
      .then(([sumData, autoData]) => {
        if (cancelled) return;
        if (typeof sumData?.summaryText === 'string') setAiTasteSummary(sumData.summaryText);
        else setAiTasteSummary('');
        if (typeof autoData?.profileText === 'string') setAiTasteAutoProfileText(autoData.profileText);
        else setAiTasteAutoProfileText('');
        setAiTasteAutoUpdatedAt(typeof autoData?.updatedAt === 'string' ? autoData.updatedAt : null);
      })
      .catch(() => {
        if (!cancelled) setAiTasteMessage('趣向メモの読み込みに失敗しました。');
      })
      .finally(() => {
        if (!cancelled) setAiTasteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isGuest, authUserId]);

  useEffect(() => {
    if (isGuest || !authUserId) {
      setPublicTagline('');
      setPublicArtistSlots(Array.from({ length: USER_PUBLIC_PROFILE_ARTIST_SLOTS }, () => ''));
      setPublicListening('');
      return;
    }
    let cancelled = false;
    void fetch('/api/user/public-profile', { credentials: 'include' })
      .then((r) => r.json().catch(() => null))
      .then((data) => {
        if (cancelled) return;
        setPublicTagline(typeof data?.tagline === 'string' ? data.tagline : '');
        const raw = Array.isArray(data?.favoriteArtists) ? data.favoriteArtists : [];
        const names = raw.filter((x: unknown): x is string => typeof x === 'string').slice(0, USER_PUBLIC_PROFILE_ARTIST_SLOTS);
        const slots = [...names];
        while (slots.length < USER_PUBLIC_PROFILE_ARTIST_SLOTS) slots.push('');
        setPublicArtistSlots(slots.slice(0, USER_PUBLIC_PROFILE_ARTIST_SLOTS));
        setPublicListening(typeof data?.listeningNote === 'string' ? data.listeningNote : '');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isGuest, authUserId]);

  useEffect(() => {
    if (isGuest || !authUserId) {
      setRoomAiCommentaryEnabled(DEFAULT_USER_ROOM_AI_COMMENTARY_ENABLED);
      setRoomAiSongQuizEnabled(DEFAULT_USER_ROOM_AI_SONG_QUIZ_ENABLED);
      setRoomAiNextSongRecommendEnabled(DEFAULT_USER_ROOM_AI_NEXT_SONG_RECOMMEND_ENABLED);
      setRoomAiFeaturesLoading(false);
      setRoomAiFeaturesMessage(null);
      return;
    }
    let cancelled = false;
    setRoomAiFeaturesLoading(true);
    setRoomAiFeaturesMessage(null);
    void fetch('/api/user/room-ai-features', { credentials: 'include' })
      .then(async (r) => {
        const data = (await r.json().catch(() => null)) as {
          commentaryEnabled?: unknown;
          songQuizEnabled?: unknown;
          nextSongRecommendEnabled?: unknown;
          error?: string;
          persistHint?: string;
        } | null;
        if (cancelled) return;
        if (!r.ok || !data || typeof data.error === 'string') {
          setRoomAiCommentaryEnabled(DEFAULT_USER_ROOM_AI_COMMENTARY_ENABLED);
          setRoomAiSongQuizEnabled(DEFAULT_USER_ROOM_AI_SONG_QUIZ_ENABLED);
          setRoomAiNextSongRecommendEnabled(DEFAULT_USER_ROOM_AI_NEXT_SONG_RECOMMEND_ENABLED);
          if (typeof data?.error === 'string' && data.error.includes('user_room_ai_features')) {
            setRoomAiFeaturesMessage(data.error);
          }
          return;
        }
        setRoomAiCommentaryEnabled(data.commentaryEnabled !== false);
        setRoomAiSongQuizEnabled(data.songQuizEnabled !== false);
        setRoomAiNextSongRecommendEnabled(data.nextSongRecommendEnabled !== false);
        if (typeof data.persistHint === 'string' && data.persistHint.trim()) {
          setRoomAiFeaturesMessage(data.persistHint.trim());
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRoomAiCommentaryEnabled(DEFAULT_USER_ROOM_AI_COMMENTARY_ENABLED);
          setRoomAiSongQuizEnabled(DEFAULT_USER_ROOM_AI_SONG_QUIZ_ENABLED);
          setRoomAiNextSongRecommendEnabled(DEFAULT_USER_ROOM_AI_NEXT_SONG_RECOMMEND_ENABLED);
        }
      })
      .finally(() => {
        if (!cancelled) setRoomAiFeaturesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isGuest, authUserId]);

  const saveRoomAiFeatures = useCallback(
    async (next: {
      commentaryEnabled: boolean;
      songQuizEnabled: boolean;
      nextSongRecommendEnabled: boolean;
    }) => {
      if (isGuest || !authUserId) return;
      const normalized = {
        commentaryEnabled: next.commentaryEnabled,
        songQuizEnabled: next.commentaryEnabled ? next.songQuizEnabled : false,
        nextSongRecommendEnabled: next.nextSongRecommendEnabled,
      };
      setRoomAiFeaturesSaving(true);
      setRoomAiFeaturesMessage(null);
      try {
        const r = await fetch('/api/user/room-ai-features', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(normalized),
        });
        const data = (await r.json().catch(() => null)) as { error?: string } | null;
        if (!r.ok) {
          setRoomAiFeaturesMessage(typeof data?.error === 'string' ? data.error : '保存に失敗しました。');
          return;
        }
        setRoomAiCommentaryEnabled(normalized.commentaryEnabled);
        setRoomAiSongQuizEnabled(normalized.songQuizEnabled);
        setRoomAiNextSongRecommendEnabled(normalized.nextSongRecommendEnabled);
        setRoomAiFeaturesMessage('保存しました。');
        dispatchUserRoomAiFeaturesUpdated();
      } catch {
        setRoomAiFeaturesMessage('保存に失敗しました。');
      } finally {
        setRoomAiFeaturesSaving(false);
      }
    },
    [isGuest, authUserId],
  );

  const roomCommentaryOn = roomAiOwnerPolicy?.commentaryOn ?? true;
  const roomQuizOn = roomAiOwnerPolicy?.quizOn ?? true;
  const roomRecommendOn = roomAiOwnerPolicy?.recommendOn ?? true;
  const canPersonalCommentaryOn = roomCommentaryOn;
  const canPersonalQuizOn = roomCommentaryOn && roomQuizOn && roomAiCommentaryEnabled;
  const canPersonalRecommendOn = roomRecommendOn;

  const handleSaveAiTasteSummary = useCallback(async () => {
    setAiTasteSaving(true);
    setAiTasteMessage(null);
    try {
      const r = await fetch('/api/user/ai-taste-summary', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summaryText: aiTasteSummary }),
      });
      const data = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) {
        setAiTasteMessage(typeof data?.error === 'string' ? data.error : '保存に失敗しました。');
        return;
      }
      setAiTasteMessage('保存しました。「@」で AI に話しかけたときに参考にされます。');
    } catch {
      setAiTasteMessage('保存に失敗しました。');
    } finally {
      setAiTasteSaving(false);
    }
  }, [aiTasteSummary]);

  const handleRefreshAiTasteAuto = useCallback(async () => {
    setAiTasteAutoRefreshing(true);
    setAiTasteMessage(null);
    try {
      const r = await fetch('/api/user/ai-taste-auto-refresh', {
        method: 'POST',
        credentials: 'include',
      });
      const data = (await r.json().catch(() => null)) as {
        error?: string;
        message?: string;
        skipped?: boolean;
        reason?: string;
      } | null;
      if (r.status === 429) {
        setAiTasteMessage(
          typeof data?.message === 'string' ? data.message : '更新はしばらく空けてからお試しください。',
        );
        return;
      }
      if (!r.ok) {
        setAiTasteMessage(typeof data?.error === 'string' ? data.error : '自動要約の更新に失敗しました。');
        return;
      }
      if (data?.skipped && data.reason === 'insufficient_signals') {
        setAiTasteMessage(
          '集計できるチャット・選曲・お気に入り・マイリスト・プロフィールがまだ少ないようです。しばらく利用してから再度お試しください。',
        );
        return;
      }
      if (data?.skipped && data.reason === 'weak_generation') {
        setAiTasteMessage(
          typeof data.message === 'string'
            ? data.message
            : '要約の内容が薄すぎるため保存しませんでした。履歴を増やしてから再度お試しください。',
        );
        return;
      }
      setAiTasteMessage(
        '自動要約を更新しました。「@」で AI に話しかけたとき、手動メモと合わせて参考にされます。',
      );
      void fetch('/api/user/ai-taste-auto-profile', { credentials: 'include' })
        .then((res) => res.json().catch(() => null))
        .then((d) => {
          if (typeof d?.profileText === 'string') setAiTasteAutoProfileText(d.profileText);
          if (typeof d?.updatedAt === 'string') setAiTasteAutoUpdatedAt(d.updatedAt);
        })
        .catch(() => {});
    } catch {
      setAiTasteMessage('自動要約の更新に失敗しました。');
    } finally {
      setAiTasteAutoRefreshing(false);
    }
  }, []);

  return {
    aiTrialStatus,
    aiTrialState,
    aiTasteSummary,
    setAiTasteSummary,
    aiTasteLoading,
    aiTasteSaving,
    aiTasteAutoRefreshing,
    aiTasteAutoProfileText,
    aiTasteAutoUpdatedAt,
    aiTasteMessage,
    aiTastePromptPreview,
    aiTasteMaxChars: USER_AI_TASTE_SUMMARY_MAX_CHARS,
    handleSaveAiTasteSummary,
    handleRefreshAiTasteAuto,
    roomAiCommentaryEnabled,
    roomAiSongQuizEnabled,
    roomAiNextSongRecommendEnabled,
    roomAiFeaturesLoading,
    roomAiFeaturesSaving,
    roomAiFeaturesMessage,
    saveRoomAiFeatures,
    roomCommentaryOn,
    roomQuizOn,
    roomRecommendOn,
    canPersonalCommentaryOn,
    canPersonalQuizOn,
    canPersonalRecommendOn,
    isSubstantiveUserTasteAutoProfile,
    looksTruncatedUserTasteAutoProfile,
    userTasteAutoProfileForUse,
  };
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { THEME_PLAYLIST_SLOT_TARGET } from '@/lib/theme-playlist-definitions';
import { THEME_PLAYLIST_MISSION_CLIENT_CHANGED_EVENT } from '@/lib/theme-playlist-mission-client-events';

export type ThemePlaylistRoomSubmitBanner = {
  themeId: string;
  themeLabel: string;
  entryCount: number;
};

/**
 * マイページで開始した「進行中・未満杯」のお題ミッションがあれば、その themeId を返す。
 * 部屋では「お題曲送信」ボタン経由でのみ room-blurb へ渡す想定。
 */
export function useThemePlaylistRoomSubmitMission(isGuest: boolean, myPageOpen: boolean) {
  const [banner, setBanner] = useState<ThemePlaylistRoomSubmitBanner | null>(null);
  const prevMyPageOpenRef = useRef(myPageOpen);

  const refresh = useCallback(async () => {
    if (isGuest) {
      setBanner(null);
      return;
    }
    try {
      const res = await fetch('/api/user/theme-playlist-mission', { credentials: 'include' });
      const data = (await res.json().catch(() => null)) as {
        missions?: Array<{
          status: string;
          theme_id: string;
          theme_label?: string;
          entry_count?: number;
        }>;
      } | null;
      if (!res.ok || !Array.isArray(data?.missions)) {
        setBanner(null);
        return;
      }
      const active = data.missions.find(
        (m) =>
          m.status === 'active' &&
          typeof m.theme_id === 'string' &&
          m.theme_id.trim() !== '' &&
          (m.entry_count ?? 0) < THEME_PLAYLIST_SLOT_TARGET,
      );
      if (active?.theme_id) {
        const tid = active.theme_id.trim();
        const label =
          typeof active.theme_label === 'string' && active.theme_label.trim()
            ? active.theme_label.trim()
            : tid;
        setBanner({
          themeId: tid,
          themeLabel: label,
          entryCount: Math.max(0, Math.min(THEME_PLAYLIST_SLOT_TARGET, active.entry_count ?? 0)),
        });
      } else {
        setBanner(null);
      }
    } catch {
      setBanner(null);
    }
  }, [isGuest]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (prevMyPageOpenRef.current && !myPageOpen) {
      void refresh();
    }
    prevMyPageOpenRef.current = myPageOpen;
  }, [myPageOpen, refresh]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onMissionChanged = () => {
      void refresh();
    };
    window.addEventListener(THEME_PLAYLIST_MISSION_CLIENT_CHANGED_EVENT, onMissionChanged);
    return () => window.removeEventListener(THEME_PLAYLIST_MISSION_CLIENT_CHANGED_EVENT, onMissionChanged);
  }, [refresh]);

  return banner;
}

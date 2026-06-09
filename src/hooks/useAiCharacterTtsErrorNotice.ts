'use client';

import { useEffect } from 'react';
import { AI_CHARACTER_TTS_ERROR_EVENT } from '@/lib/ai-character-tts-client';
import { isAiCharacterTtsEnabledClient } from '@/lib/ai-character-tts-config';

/** TTS 失敗をシステム行で通知（同一セッションで 60 秒に 1 回まで） */
export function useAiCharacterTtsErrorNotice(
  addSystemMessage: (body: string) => void,
): void {
  useEffect(() => {
    if (!isAiCharacterTtsEnabledClient()) return;
    let lastAt = 0;
    const onError = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      const message = typeof detail?.message === 'string' ? detail.message.trim() : '';
      if (!message) return;
      const now = Date.now();
      if (now - lastAt < 60_000) return;
      lastAt = now;
      addSystemMessage(message);
    };
    window.addEventListener(AI_CHARACTER_TTS_ERROR_EVENT, onError);
    return () => window.removeEventListener(AI_CHARACTER_TTS_ERROR_EVENT, onError);
  }, [addSystemMessage]);
}

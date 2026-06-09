'use client';

import {
  getAiCharacterTtsVolumeClient,
  isAiCharacterTtsEnabledClient,
} from '@/lib/ai-character-tts-config';
import {
  prepareAiCharacterTtsText,
  type AiCharacterTtsPrepareOptions,
} from '@/lib/ai-character-tts-text';

export type AiCharacterTtsPlaybackOptions = AiCharacterTtsPrepareOptions;

let playbackChain: Promise<void> = Promise.resolve();
let currentAudio: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;

const blobCache = new Map<string, Blob>();
const BLOB_CACHE_MAX = 32;

const scheduledTtsMessageIds = new Set<string>();
const SCHEDULED_TTS_ID_MAX = 128;

function ttsCacheKey(displayBody: string, options?: AiCharacterTtsPlaybackOptions): string {
  return `${displayBody}\x00${options?.leadArtistJa?.trim() ?? ''}`;
}

function rememberScheduledTtsMessageId(messageId: string): boolean {
  if (scheduledTtsMessageIds.has(messageId)) return false;
  scheduledTtsMessageIds.add(messageId);
  while (scheduledTtsMessageIds.size > SCHEDULED_TTS_ID_MAX) {
    const oldest = scheduledTtsMessageIds.values().next().value;
    if (oldest == null) break;
    scheduledTtsMessageIds.delete(oldest);
  }
  return true;
}

function rememberBlob(cacheKey: string, blob: Blob): void {
  if (blobCache.has(cacheKey)) {
    blobCache.delete(cacheKey);
  }
  blobCache.set(cacheKey, blob);
  while (blobCache.size > BLOB_CACHE_MAX) {
    const oldest = blobCache.keys().next().value;
    if (oldest == null) break;
    blobCache.delete(oldest);
  }
}

function releaseCurrentAudio(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
}

async function playBlobOnce(blob: Blob): Promise<void> {
  if (typeof window === 'undefined') return;
  releaseCurrentAudio();
  const url = URL.createObjectURL(blob);
  currentObjectUrl = url;
  const audio = new Audio(url);
  currentAudio = audio;
  audio.volume = getAiCharacterTtsVolumeClient();
  await new Promise<void>((resolve, reject) => {
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error('audio playback error'));
    void audio.play().catch(reject);
  });
}

export const AI_CHARACTER_TTS_ERROR_EVENT = 'mc:character-tts-error';

function notifyTtsError(message: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(AI_CHARACTER_TTS_ERROR_EVENT, { detail: { message } }),
  );
}

function handlePlaybackError(e: unknown): void {
  console.warn('[ai-character-tts-client]', e);
  const msg = e instanceof Error ? e.message : '';
  if (/play|interact|gesture|NotAllowed/i.test(msg)) {
    notifyTtsError(
      'エージェント音声: ブラウザの自動再生がブロックされました。音声ボタンを押して再生してください。',
    );
  }
}

export function canShowAiCharacterTtsReplay(
  displayBody: string,
  options?: AiCharacterTtsPlaybackOptions,
): boolean {
  return isAiCharacterTtsEnabledClient() && !!prepareAiCharacterTtsText(displayBody, options);
}

async function fetchCharacterTtsBlob(
  displayBody: string,
  options?: AiCharacterTtsPlaybackOptions,
): Promise<Blob | null> {
  const prepared = prepareAiCharacterTtsText(displayBody, options);
  if (!prepared) return null;

  const cacheKey = ttsCacheKey(displayBody, options);
  const cached = blobCache.get(cacheKey);
  if (cached?.size) return cached;

  const res = await fetch('/api/ai/character-tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      text: displayBody,
      ...(options?.leadArtistJa?.trim()
        ? { leadArtistJa: options.leadArtistJa.trim() }
        : {}),
    }),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const errJson = (await res.json()) as { error?: string };
      detail = typeof errJson?.error === 'string' ? errJson.error : '';
    } catch {
      /* ignore */
    }
    if (res.status === 503 || res.status === 502) {
      notifyTtsError(
        'エージェント音声: TTS サーバーに接続できません。Irodori-TTS-Server が起動しているか、.env.local の IRODORI_TTS_SERVER_URL を確認してください。',
      );
    } else if (res.status === 504) {
      notifyTtsError(
        `エージェント音声: ${detail || '合成がタイムアウトしました。CPU では数十秒〜数分かかります。.env.local に IRODORI_TTS_NUM_STEPS=24 を試してください。'}`,
      );
    } else if (detail) {
      notifyTtsError(`エージェント音声: ${detail}`);
    }
    return null;
  }
  const blob = await res.blob();
  if (!blob.size) {
    notifyTtsError('エージェント音声: 空の音声が返されました。');
    return null;
  }
  rememberBlob(cacheKey, blob);
  return blob;
}

async function fetchAndPlayCharacterTts(
  displayBody: string,
  options?: AiCharacterTtsPlaybackOptions,
): Promise<void> {
  const blob = await fetchCharacterTtsBlob(displayBody, options);
  if (!blob) return;
  await playBlobOnce(blob);
}

/**
 * エージェントAIの本文を順番に読み上げる（前の再生中ならキュー）。
 */
export function scheduleAiCharacterTtsPlayback(
  displayBody: string,
  messageId?: string,
  options?: AiCharacterTtsPlaybackOptions,
): void {
  if (!isAiCharacterTtsEnabledClient()) return;
  if (!prepareAiCharacterTtsText(displayBody, options)) return;
  if (messageId && !rememberScheduledTtsMessageId(messageId)) return;

  playbackChain = playbackChain
    .then(() => fetchAndPlayCharacterTts(displayBody, options))
    .catch(handlePlaybackError);
}

/** 音声ボタン用。ユーザー操作なので即時再生（キャッシュがあれば再合成しない）。 */
export async function replayAiCharacterTtsPlayback(
  displayBody: string,
  options?: AiCharacterTtsPlaybackOptions,
): Promise<void> {
  if (!canShowAiCharacterTtsReplay(displayBody, options)) return;
  try {
    const blob = await fetchCharacterTtsBlob(displayBody, options);
    if (!blob) return;
    await playBlobOnce(blob);
  } catch (e) {
    handlePlaybackError(e);
  }
}

export function stopAiCharacterTtsPlayback(): void {
  playbackChain = Promise.resolve();
  releaseCurrentAudio();
}

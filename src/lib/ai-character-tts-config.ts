/**
 * エージェントAI の Irodori-TTS 読み上げ（試験）。
 * 既定オフ。`NEXT_PUBLIC_AI_CHARACTER_TTS_ENABLED=1` のときだけ有効。
 */
export function isAiCharacterTtsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AI_CHARACTER_TTS_ENABLED === '1';
}

/** @deprecated 互換 alias。`isAiCharacterTtsEnabled` と同じ */
export function isAiCharacterTtsEnabledClient(): boolean {
  return isAiCharacterTtsEnabled();
}

/** 同期部屋で Ably 経由の character_chat も各端末で読み上げる */
export function shouldPlayIncomingCharacterTtsClient(): boolean {
  return process.env.NEXT_PUBLIC_AI_CHARACTER_TTS_PLAY_INCOMING === '1';
}

export function getAiCharacterTtsVolumeClient(): number {
  const raw = process.env.NEXT_PUBLIC_AI_CHARACTER_TTS_VOLUME;
  if (raw == null || raw === '') return 0.85;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0.85;
  return Math.min(1, Math.max(0, n));
}

/** サーバー: Irodori-TTS-Server のベース URL（末尾スラッシュなし） */
export function getIrodoriTtsServerUrl(): string | null {
  const raw = process.env.IRODORI_TTS_SERVER_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

/**
 * 参照音声 ID。未設定・`none` は Irodori の参照なし合成（sample.wav 不要）。
 * ファイル stem を指定する場合は voices/sample.wav 等をサーバー側に置く。
 */
export function getIrodoriTtsVoiceId(): string | undefined {
  const v = process.env.IRODORI_TTS_VOICE?.trim();
  if (!v || v === '0' || v.toLowerCase() === 'off' || v.toLowerCase() === 'none') {
    return 'none';
  }
  return v;
}

export function getIrodoriTtsApiKey(): string | undefined {
  const v = process.env.IRODORI_TTS_API_KEY?.trim();
  return v || undefined;
}

/** 既定 wav（Windows で FFmpeg なしでも動きやすい。mp3 はサーバー側 FFmpeg が必要） */
export function getIrodoriTtsResponseFormat(): 'mp3' | 'wav' {
  const f = process.env.IRODORI_TTS_RESPONSE_FORMAT?.trim().toLowerCase();
  if (f === 'mp3') return 'mp3';
  return 'wav';
}

export function getIrodoriTtsModelName(): string {
  return process.env.IRODORI_TTS_MODEL?.trim() || 'irodori-tts';
}

/** character_chat 返答は短い想定 */
export const AI_CHARACTER_TTS_MAX_INPUT_CHARS = 400;

/** Next.js → Irodori の fetch タイムアウト（ms）。CPU では 2〜5 分かかることがある */
export function getAiCharacterTtsUpstreamTimeoutMs(): number {
  const raw = process.env.AI_CHARACTER_TTS_UPSTREAM_TIMEOUT_MS?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 30_000) return Math.round(n);
  }
  return 360_000;
}

/** 拡散ステップ数（小さいほど速い・品質はやや落ちる）。未設定ならサーバー既定（40 前後） */
export function getIrodoriTtsNumSteps(): number | undefined {
  const raw = process.env.IRODORI_TTS_NUM_STEPS?.trim();
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 8 || n > 64) return undefined;
  return Math.round(n);
}

/** 固定 seed で呼び出し間の声質ブレを抑える（参照音声と併用推奨） */
export function getIrodoriTtsSeed(): number | undefined {
  const raw = process.env.IRODORI_TTS_SEED?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  const voice = process.env.IRODORI_TTS_VOICE?.trim();
  if (voice && voice !== '0' && voice.toLowerCase() !== 'off' && voice.toLowerCase() !== 'none') {
    return 42;
  }
  return undefined;
}

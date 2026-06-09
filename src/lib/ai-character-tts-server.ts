import {
  AI_CHARACTER_TTS_MAX_INPUT_CHARS,
  getAiCharacterTtsUpstreamTimeoutMs,
  getIrodoriTtsApiKey,
  getIrodoriTtsModelName,
  getIrodoriTtsNumSteps,
  getIrodoriTtsResponseFormat,
  getIrodoriTtsSeed,
  getIrodoriTtsServerUrl,
  getIrodoriTtsVoiceId,
} from '@/lib/ai-character-tts-config';
import {
  prepareAiCharacterTtsText,
  type AiCharacterTtsPrepareOptions,
} from '@/lib/ai-character-tts-text';

export type SynthesizeAiCharacterSpeechResult =
  | { ok: true; audio: ArrayBuffer; contentType: string }
  | { ok: false; status: number; error: string };

export function normalizeAiCharacterTtsInput(
  raw: string,
  options?: AiCharacterTtsPrepareOptions,
): string | null {
  const prepared = prepareAiCharacterTtsText(raw, options);
  if (!prepared) return null;
  if (prepared.length > AI_CHARACTER_TTS_MAX_INPUT_CHARS) {
    return prepared.slice(0, AI_CHARACTER_TTS_MAX_INPUT_CHARS);
  }
  return prepared;
}

export async function synthesizeAiCharacterSpeech(
  rawText: string,
  options?: AiCharacterTtsPrepareOptions,
): Promise<SynthesizeAiCharacterSpeechResult> {
  const baseUrl = getIrodoriTtsServerUrl();
  if (!baseUrl) {
    return { ok: false, status: 503, error: 'IRODORI_TTS_SERVER_URL is not configured.' };
  }

  const input = normalizeAiCharacterTtsInput(rawText, options);
  if (!input) {
    return { ok: false, status: 400, error: 'Empty or invalid text for TTS.' };
  }

  const responseFormat = getIrodoriTtsResponseFormat();
  const body: Record<string, unknown> = {
    model: getIrodoriTtsModelName(),
    input,
    response_format: responseFormat,
  };
  body.voice = getIrodoriTtsVoiceId() ?? 'none';

  const irodoriOpts: Record<string, number> = {};
  const numSteps = getIrodoriTtsNumSteps();
  if (numSteps != null) irodoriOpts.num_steps = numSteps;
  const seed = getIrodoriTtsSeed();
  if (seed != null) irodoriOpts.seed = seed;
  if (Object.keys(irodoriOpts).length > 0) body.irodori = irodoriOpts;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: responseFormat === 'wav' ? 'audio/wav' : 'audio/mpeg',
  };
  const apiKey = getIrodoriTtsApiKey();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/v1/audio/speech`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(getAiCharacterTtsUpstreamTimeoutMs()),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'TTS upstream request failed';
    const isTimeout =
      (e instanceof Error && e.name === 'TimeoutError') || /aborted|timeout/i.test(msg);
    console.warn('[ai-character-tts-server] upstream fetch', msg);
    return {
      ok: false,
      status: isTimeout ? 504 : 502,
      error: isTimeout
        ? 'TTS synthesis timed out. CPU では IRODORI_TTS_NUM_STEPS=24 等で短縮してください。'
        : 'TTS server unreachable.',
    };
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => '');
    console.warn('[ai-character-tts-server] upstream', upstream.status, errText.slice(0, 200));
    return {
      ok: false,
      status: upstream.status === 503 ? 503 : 502,
      error: 'TTS synthesis failed.',
    };
  }

  const audio = await upstream.arrayBuffer();
  if (!audio.byteLength) {
    return { ok: false, status: 502, error: 'TTS returned empty audio.' };
  }

  const contentType =
    upstream.headers.get('content-type') ||
    (responseFormat === 'wav' ? 'audio/wav' : 'audio/mpeg');

  return { ok: true, audio, contentType };
}

'use client';

import { useState } from 'react';
import { SpeakerWaveIcon } from '@heroicons/react/24/outline';
import {
  canShowAiCharacterTtsReplay,
  replayAiCharacterTtsPlayback,
} from '@/lib/ai-character-tts-client';

type Props = {
  displayBody: string;
  characterTtsArtistJa?: string | null;
};

export default function AiCharacterTtsReplayButton({
  displayBody,
  characterTtsArtistJa,
}: Props) {
  const [busy, setBusy] = useState(false);
  const ttsOptions = characterTtsArtistJa?.trim()
    ? { leadArtistJa: characterTtsArtistJa.trim() }
    : undefined;

  if (!canShowAiCharacterTtsReplay(displayBody, ttsOptions)) return null;

  return (
    <button
      type="button"
      aria-label="音声を再生"
      title="音声を再生"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void replayAiCharacterTtsPlayback(displayBody, ttsOptions).finally(() => setBusy(false));
      }}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-amber-600/35 bg-amber-950/30 text-amber-200/85 transition-colors hover:border-amber-500/55 hover:bg-amber-900/40 hover:text-amber-50 disabled:cursor-wait disabled:opacity-60 ${
        busy ? 'animate-pulse ring-2 ring-amber-400/55' : ''
      }`}
    >
      <SpeakerWaveIcon className={`h-4 w-4 ${busy ? 'animate-pulse' : ''}`} aria-hidden />
    </button>
  );
}

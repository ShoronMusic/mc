import { NextResponse } from 'next/server';
import { getGeminiGenerationRoutingSummary, isGeminiConfigured } from '@/lib/gemini';
import {
  getNextSongRecommendBetaUserIds,
  isNextSongRecommendMasterEnabled,
} from '@/lib/next-song-recommend-feature';
import { isYouTubeConfigured } from '@/lib/youtube-search';

export const dynamic = 'force-dynamic';

export async function GET() {
  const routing = getGeminiGenerationRoutingSummary();
  return NextResponse.json({
    gemini: isGeminiConfigured(),
    geminiGeneration: routing,
    youtube: isYouTubeConfigured(),
    nextSongRecommend: {
      masterEnabled: isNextSongRecommendMasterEnabled(),
      betaUserIdsConfigured: getNextSongRecommendBetaUserIds().length > 0,
    },
  });
}

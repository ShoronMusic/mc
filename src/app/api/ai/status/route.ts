import { NextResponse } from 'next/server';
import { getGeminiGenerationRoutingSummary, isGeminiConfigured } from '@/lib/gemini';
import { isYouTubeConfigured } from '@/lib/youtube-search';

export const dynamic = 'force-dynamic';

export async function GET() {
  const routing = getGeminiGenerationRoutingSummary();
  return NextResponse.json({
    gemini: isGeminiConfigured(),
    geminiGeneration: routing,
    youtube: isYouTubeConfigured(),
  });
}

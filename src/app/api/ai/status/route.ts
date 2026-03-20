import { NextResponse } from 'next/server';
import { isGeminiConfigured } from '@/lib/gemini';
import { isYouTubeConfigured } from '@/lib/youtube-search';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    gemini: isGeminiConfigured(),
    youtube: isYouTubeConfigured(),
  });
}

import { NextResponse } from 'next/server';
import { classifyMusicRelatedAiQuestionGemini } from '@/lib/gemini-question-guard-classify';
import {
  checkQuestionGuardClassifyRateLimit,
  getQuestionGuardClassifyClientIp,
} from '@/lib/question-guard-classify-rate-limit';

export const dynamic = 'force-dynamic';

const MAX_QUESTION = 2000;
const MAX_RECENT = 12;

type IncomingMsg = {
  displayName?: string;
  body?: string;
  messageType?: string;
};

function normalizeRecent(raw: unknown): IncomingMsg[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_RECENT) return null;
  const out: IncomingMsg[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const o = item as Record<string, unknown>;
    const body = typeof o.body === 'string' ? o.body : '';
    const messageType = typeof o.messageType === 'string' ? o.messageType : '';
    const displayName = typeof o.displayName === 'string' ? o.displayName : undefined;
    if (!messageType) return null;
    out.push({
      displayName,
      body: body.slice(0, 4000),
      messageType,
    });
  }
  return out;
}

/**
 * クライアント側ヒューリスティックで弾かれた「@」質問を Gemini で再判定。
 * 未設定・失敗時は skipped: true（呼び出し側は従来どおりブロック扱い）。
 */
export async function POST(request: Request) {
  try {
    let body: {
      question?: string;
      recentMessages?: unknown;
      isGuest?: boolean;
      roomId?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const question =
      typeof body.question === 'string' ? body.question.trim().slice(0, MAX_QUESTION) : '';
    if (!question) {
      return NextResponse.json({ error: 'question が必要です。' }, { status: 400 });
    }

    const recent = normalizeRecent(body.recentMessages);
    if (recent === null) {
      return NextResponse.json({ error: 'recentMessages が不正です。' }, { status: 400 });
    }

    const isGuest = body.isGuest === true;
    const roomId = typeof body.roomId === 'string' ? body.roomId.trim().slice(0, 120) : '';

    const rate = checkQuestionGuardClassifyRateLimit(getQuestionGuardClassifyClientIp(request), isGuest);
    if (!rate.ok) {
      return NextResponse.json(
        {
          error: 'rate_limit',
          message:
            '質問の自動判定が短時間に集中しています。しばらく待ってから再度「@」付きで送ってください。',
          retryAfterSec: rate.retryAfterSec,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rate.retryAfterSec) },
        }
      );
    }

    const musicRelated = await classifyMusicRelatedAiQuestionGemini(question, recent, {
      roomId: roomId || null,
    });

    if (musicRelated === null) {
      return NextResponse.json({
        skipped: true,
        source: 'unavailable',
        musicRelated: null,
      });
    }

    return NextResponse.json({
      skipped: false,
      source: 'gemini',
      musicRelated,
    });
  } catch (e) {
    console.error('[api/ai/question-guard-classify]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

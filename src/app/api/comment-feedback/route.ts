import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendFeedbackEmail } from '@/lib/send-feedback-email';

export const dynamic = 'force-dynamic';

type DetailFeedbackBody = {
  isDuplicate?: boolean;
  isDubious?: boolean;
  isAmbiguous?: boolean;
  freeComment?: string;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: '認証が利用できません。' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let body: {
    songId?: string | null;
    videoId?: string | null;
    aiMessageId?: string;
    commentBody?: string;
    source?: string;
    isUpvote?: boolean;
    detailFeedback?: DetailFeedbackBody;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  let songId =
    typeof body.songId === 'string' && body.songId.trim() ? body.songId.trim() : null;
  const videoId =
    typeof body.videoId === 'string' && body.videoId.trim() ? body.videoId.trim() : null;
  const aiMessageId =
    typeof body.aiMessageId === 'string' && body.aiMessageId.trim()
      ? body.aiMessageId.trim()
      : '';
  const commentText =
    typeof body.commentBody === 'string' && body.commentBody.trim()
      ? body.commentBody.trim()
      : '';
  const source =
    typeof body.source === 'string' && body.source.trim() ? body.source.trim() : 'unknown';
  const isUpvote = body.isUpvote === true;
  const detailFeedback =
    body.detailFeedback && typeof body.detailFeedback === 'object'
      ? {
          isDuplicate: Boolean(body.detailFeedback.isDuplicate),
          isDubious: Boolean(body.detailFeedback.isDubious),
          isAmbiguous: Boolean(body.detailFeedback.isAmbiguous),
          freeComment:
            typeof body.detailFeedback.freeComment === 'string'
              ? body.detailFeedback.freeComment.trim()
              : '',
        }
      : null;

  if (!aiMessageId || !commentText) {
    return NextResponse.json(
      { error: 'aiMessageId and commentBody are required' },
      { status: 400 }
    );
  }

  // songId が未指定で videoId が分かっている場合は、song_videos から補完して曲単位で集計できるようにする
  if (!songId && videoId) {
    const { data: svRow, error: svError } = await supabase
      .from('song_videos')
      .select('song_id')
      .eq('video_id', videoId)
      .limit(1)
      .maybeSingle();
    if (!svError && svRow && 'song_id' in svRow && svRow.song_id) {
      songId = svRow.song_id as string;
    }
  }

  const row: Record<string, unknown> = {
    song_id: songId,
    video_id: videoId,
    ai_message_id: aiMessageId,
    body: commentText,
    source,
    is_upvote: detailFeedback ? false : isUpvote,
    user_id: user?.id ?? null,
  };

  if (detailFeedback) {
    row.is_duplicate = detailFeedback.isDuplicate;
    row.is_dubious = detailFeedback.isDubious;
    row.is_ambiguous = detailFeedback.isAmbiguous;
    row.free_comment = detailFeedback.freeComment || null;
  }

  const { error } = await supabase.from('comment_feedback').insert(row);

  if (error) {
    console.error('[comment-feedback POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let emailSent: boolean | undefined;
  let emailFailCode: 'missing_api_key' | 'send_failed' | undefined;
  if (detailFeedback) {
    const emailResult = await sendFeedbackEmail({
      aiMessageId,
      commentBody: commentText,
      videoId,
      songId,
      source,
      userId: user?.id ?? null,
      detail: detailFeedback,
    });
    emailSent = emailResult.ok;
    if (!emailResult.ok) {
      emailFailCode = emailResult.code;
      console.error('[comment-feedback] Email send failed:', emailResult.error);
    }
  }

  return NextResponse.json(
    detailFeedback
      ? { ok: true, emailSent: Boolean(emailSent), ...(emailFailCode ? { emailFailCode } : {}) }
      : { ok: true },
  );
}

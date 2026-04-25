import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { formatArtistTitle } from '@/lib/format-song-display';
import { generateChatReply } from '@/lib/gemini';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import { getStyleFromDb } from '@/lib/song-style';
import { checkChatAiRateLimit, getChatAiClientIp } from '@/lib/chat-ai-rate-limit';
import { fetchUserTasteContextForChat } from '@/lib/user-ai-taste-context';

export const dynamic = 'force-dynamic';

const CHARACTER_PERSONA_INSTRUCTION = `
あなたは「30代男性の洋楽好きキャラクター」です。
若い頃から輸入レコード店で働いてきた設定で、70年代から現在までの洋楽全般に詳しいです。
ただし、知識をひけらかさず、決してでしゃばりません。
他の参加者が貼った曲について、良いところや選曲センスの良さを、さりげなく褒めます。
専門用語や難しい言葉はできるだけ使わず、短めで、平易で分かりやすい日本語で話してください。
感想を言うときは「いい」「最高」だけで終わらせず、どこが良いかを短く1つ理由で添えてください。
選曲コメントでは、可能なら「リズム」「グルーヴ」「ベース」「メロディ」「コーラス」「展開」「音色」などの音楽的な観点を1つか2つ入れて、具体的に褒めてください。
ただし長文にはせず、1〜2文で簡潔に伝えてください。
`.trim();

function latestUserText(
  list: { displayName?: string; body?: string; messageType?: string }[]
): string {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const m = list[i];
    if (m?.messageType === 'ai') continue;
    const body = typeof m?.body === 'string' ? m.body.trim() : '';
    if (body) return body;
  }
  return '';
}

/** キャラ呼び出しでも、短い相づちは返さない */
function shouldGenerateCharacterReply(userText: string): boolean {
  const t = userText.trim();
  if (!t) return false;
  if (
    t.length <= 24 &&
    /^(いいね|これ好き|好き|すき|最高|わかる|それな|うん|はい|なるほど|たしかに|私も|おなじ|同じ)([!！。〜\s]*)$/i.test(
      t,
    )
  ) {
    return false;
  }
  return true;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const list = messages.map((m: { displayName?: string; body?: string; messageType?: string }) => ({
      displayName: typeof m.displayName === 'string' ? m.displayName : undefined,
      body: typeof m.body === 'string' ? m.body : '',
      messageType: typeof m.messageType === 'string' ? m.messageType : undefined,
    }));
    const newestUserText = latestUserText(list);
    if (!shouldGenerateCharacterReply(newestUserText)) {
      return NextResponse.json({ text: null, skipped: true, reason: 'short_acknowledgement' });
    }

    const isGuest = body?.isGuest === true;
    const rate = checkChatAiRateLimit(getChatAiClientIp(request), isGuest);
    if (!rate.ok) {
      return NextResponse.json(
        {
          error: 'rate_limit',
          message: 'AI への質問が短時間に集中しています。しばらく待ってから再度お試しください。',
          retryAfterSec: rate.retryAfterSec,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rate.retryAfterSec) },
        },
      );
    }

    let currentSong: string | null = null;
    let currentSongStyle: string | null = null;
    const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
    if (videoId) {
      const supabase = await createClient();
      const oembed = await fetchOEmbed(videoId);
      const title = oembed?.title ?? videoId;
      currentSong = formatArtistTitle(title, oembed?.author_name) || null;
      if (supabase) {
        const style = await getStyleFromDb(supabase, videoId);
        currentSongStyle = style ?? null;
      }
    }

    let userTasteSummary: string | null = null;
    const supaAuth = await createClient();
    if (supaAuth) {
      const {
        data: { user },
      } = await supaAuth.auth.getUser();
      if (user?.id) {
        userTasteSummary = await fetchUserTasteContextForChat(supaAuth, user.id);
      }
    }

    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    const text = await generateChatReply(
      list,
      currentSong,
      currentSongStyle,
      {
        roomId: roomId || undefined,
        videoId: videoId || undefined,
      },
      { forceReply: true, userTasteSummary, personaInstruction: CHARACTER_PERSONA_INSTRUCTION },
    );
    if (text == null) {
      return NextResponse.json({ error: 'AI is not configured or failed to generate a reply.' }, { status: 503 });
    }

    return NextResponse.json({ text });
  } catch (e) {
    console.error('[api/ai/character-chat]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

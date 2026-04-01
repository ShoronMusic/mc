import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { formatArtistTitle } from '@/lib/format-song-display';
import { generateChatReply } from '@/lib/gemini';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import { getStyleFromDb } from '@/lib/song-style';
import { upsertSongAndVideo } from '@/lib/song-entities';
import { insertTidbit } from '../../../../lib/song-tidbits';
import { checkChatAiRateLimit, getChatAiClientIp } from '@/lib/chat-ai-rate-limit';

export const dynamic = 'force-dynamic';

type PlaybackTrendRow = {
  video_id: string;
  title: string | null;
  artist_name: string | null;
  style: string | null;
  played_at: string;
};

type EraRow = {
  video_id: string;
  era: string | null;
};

type ChatTrendRow = {
  body: string | null;
};

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

/**
 * 通常雑談では AI 返答を抑制し、質問・問い合わせのときだけ返す。
 * これにより、参加者同士の会話ログを AI が埋め尽くすのを防ぐ。
 */
function shouldGenerateChatReply(userText: string): boolean {
  const t = userText.trim();
  if (!t) return false;
  const lower = t.toLowerCase();

  // 相づち・短文リアクションは常に無視（ログノイズ抑制）
  if (
    t.length <= 20 &&
    /^(いいね|最高|好き|すき|わかる|それな|ほんと|ほんとそれ|なるほど|たしかに|私も|おなじ|同じ|うん|はい|そうですね|そう思う|いい曲|神曲)([!！。〜\s]*)$/.test(
      t
    )
  ) {
    return false;
  }

  // AI 宛てメンションは優先して応答
  const hasAiMention =
    /(^|[\s、,:：])(ai|ＡＩ|えーあい|エーアイ)([\s、,:：]|$)/i.test(t) ||
    /@ai\b/i.test(lower) ||
    /(ai|ＡＩ|えーあい|エーアイ)に(質問|聞きたい|教えて|相談|確認)/i.test(t) ||
    /(ai|ＡＩ|えーあい|エーアイ)へ(質問|相談|確認)/i.test(t);
  if (hasAiMention) return true;

  // 参加者宛て（〜さん）っぽい文は、AIメンションが無い限り無視
  if (/さん/.test(t)) return false;

  // 明確な疑問文（ただし短い雑談質問は除外）
  if (/[?？]/.test(t) && t.length >= 8) return true;

  // 典型的な質問表現（情報要求系）
  if (/(教えて|とは|って何|なぜ|どうして|どうやって|どうすれば|どこ|いつ|誰|何の曲|曲名|アーティスト|意味)/.test(t)) {
    return true;
  }

  return false;
}

function isTrendQuestion(userText: string): boolean {
  const t = userText.trim();
  if (!t) return false;
  if (!/(流れ|傾向|人気|どんな感じ|雰囲気|今日の感じ|直近)/.test(t)) return false;
  return /(今日|きょう|直近|この1時間|この2時間|1時間|2時間|今夜|最近)/.test(t);
}

function parseTrendHours(userText: string): 1 | 2 {
  const t = userText.trim();
  if (/1時間|1h|１時間/.test(t)) return 1;
  return 2;
}

function normalizeText(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().trim();
}

function countMentionsByKeyword(chatBodies: string[], keyword: string): number {
  const k = normalizeText(keyword);
  if (!k || k.length < 2) return 0;
  let c = 0;
  chatBodies.forEach((b) => {
    if (b.includes(k)) c += 1;
  });
  return c;
}

async function buildRoomTrendSummary(roomId: string, hours: 1 | 2): Promise<string | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data: playData, error: playError } = await supabase
    .from('room_playback_history')
    .select('video_id, title, artist_name, style, played_at')
    .eq('room_id', roomId)
    .gte('played_at', sinceIso)
    .order('played_at', { ascending: false })
    .limit(500);
  if (playError) {
    if (playError.code === '42P01') return null;
    console.error('[api/ai/chat] trend playback', playError);
    return null;
  }
  const plays = (playData ?? []) as PlaybackTrendRow[];
  if (plays.length === 0) {
    return `直近${hours}時間では再生履歴がまだ少ないです。もう少し曲が流れたら、人気曲や傾向をまとめます。`;
  }

  const { data: chatData, error: chatError } = await supabase
    .from('room_chat_log')
    .select('body')
    .eq('room_id', roomId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(1200);
  if (chatError && chatError.code !== '42P01') {
    console.error('[api/ai/chat] trend chat', chatError);
  }
  const chatBodies = ((chatData ?? []) as ChatTrendRow[])
    .map((r) => normalizeText(r.body))
    .filter(Boolean);

  const styleCount = new Map<string, number>();
  const artistPlayCount = new Map<string, number>();
  const trackMap = new Map<
    string,
    { artist: string; title: string; plays: number; style: string; mention: number }
  >();

  plays.forEach((p) => {
    const artist = (p.artist_name ?? '不明アーティスト').trim();
    const title = (p.title ?? p.video_id).trim();
    const style = (p.style ?? 'Other').trim();
    styleCount.set(style, (styleCount.get(style) ?? 0) + 1);
    artistPlayCount.set(artist, (artistPlayCount.get(artist) ?? 0) + 1);
    const key = p.video_id;
    const prev = trackMap.get(key);
    if (prev) {
      prev.plays += 1;
    } else {
      trackMap.set(key, { artist, title, plays: 1, style, mention: 0 });
    }
  });

  // 曲名・アーティスト名の会話内出現数を「人気度」の補助指標に使う
  trackMap.forEach((v) => {
    const artistMentions = countMentionsByKeyword(chatBodies, v.artist);
    // 曲名は長すぎる副題が多いので先頭64文字までで判定
    const titleMentions = countMentionsByKeyword(chatBodies, v.title.slice(0, 64));
    v.mention = artistMentions + titleMentions;
  });

  const videoIds = Array.from(new Set(plays.map((p) => p.video_id).filter(Boolean)));
  const eraCount = new Map<string, number>();
  if (videoIds.length > 0) {
    const { data: eraData, error: eraError } = await supabase
      .from('song_era')
      .select('video_id, era')
      .in('video_id', videoIds);
    if (!eraError && eraData?.length) {
      const eraByVideo = new Map<string, string>();
      (eraData as EraRow[]).forEach((r) => {
        if (r.video_id && r.era) eraByVideo.set(r.video_id, r.era);
      });
      plays.forEach((p) => {
        const e = eraByVideo.get(p.video_id) ?? 'Other';
        eraCount.set(e, (eraCount.get(e) ?? 0) + 1);
      });
    }
  }

  const topStyles = Array.from(styleCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k]) => k);
  const topEras = Array.from(eraCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k]) => k);

  const topArtists = Array.from(artistPlayCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  const topTracks = Array.from(trackMap.values())
    .map((t) => ({ ...t, score: t.plays * 3 + t.mention }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  const styleTxt = topStyles.length > 0 ? topStyles.join('・') : '傾向判定中';
  const eraTxt = topEras.length > 0 ? topEras.join('・') : '年代判定中';
  const artistTxt = topArtists.length > 0 ? topArtists.join('、') : 'まだ偏りなし';
  const trackTxt =
    topTracks.length > 0
      ? topTracks.map((t) => `${t.artist} - ${t.title}`).join(' / ')
      : 'まだ偏りなし';

  return `直近${hours}時間の流れは、スタイルは${styleTxt}寄り、年代は${eraTxt}が中心です。会話と再生を合わせた人気どころは ${trackTxt} あたりで、アーティストでは ${artistTxt} がよく出ています。`;
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
    const isGuest = body?.isGuest === true;
    if (!shouldGenerateChatReply(newestUserText)) {
      return NextResponse.json({ text: null, skipped: true, reason: 'non_question_chat' });
    }

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

    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    if (roomId && isTrendQuestion(newestUserText)) {
      const hours = parseTrendHours(newestUserText);
      const trendText = await buildRoomTrendSummary(roomId, hours);
      if (trendText) {
        return NextResponse.json({ text: trendText, source: 'room_trend' });
      }
    }

    let currentSong: string | null = null;
    let currentSongStyle: string | null = null;
    const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
    let songId: string | null = null;
    if (videoId) {
      const supabase = await createClient();
      const oembed = await fetchOEmbed(videoId);
      const title = oembed?.title ?? videoId;
      currentSong = formatArtistTitle(title, oembed?.author_name) || null;
      if (supabase) {
        const style = await getStyleFromDb(supabase, videoId);
        currentSongStyle = style ?? null;

        // 曲マスタに登録（簡易版）し、song_id を取得
        try {
          const mainArtist = oembed?.author_name ?? null;
          const songTitle = title;
          songId = await upsertSongAndVideo({
            supabase,
            videoId,
            mainArtist,
            songTitle,
            variant: 'chat',
          });
        } catch (e) {
          console.error('[api/ai/chat] upsertSongAndVideo', e);
        }
      }
    }

    const text = await generateChatReply(list, currentSong, currentSongStyle, {
      roomId: roomId || undefined,
      videoId: videoId || undefined,
    });
    if (text == null) {
      return NextResponse.json(
        { error: 'AI is not configured or failed to generate a reply.' },
        { status: 503 }
      );
    }

    // 曲に紐づく豆知識として保存（videoId があり、songId が取れている場合）
    if (videoId && songId) {
      try {
        const supabase = await createClient();
        if (supabase) {
          await insertTidbit(supabase, {
            songId,
            videoId,
            body: text,
            source: 'ai_chat',
          });
        }
      } catch (e) {
        console.error('[api/ai/chat] insertTidbit', e);
      }
    }

    return NextResponse.json({ text, songId });
  } catch (e) {
    console.error('[api/ai/chat]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

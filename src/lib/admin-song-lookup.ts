/**
 * 管理画面「曲引き」: キー解決・room_chat_log からの関連抽出・テキストエクスポート
 */

import type { AtChatPairFromLog, RoomChatLogRow } from '@/lib/room-chat-at-qa-from-log';
import { buildAtChatPairsFromLogRows } from '@/lib/room-chat-at-qa-from-log';

export const JST = 'Asia/Tokyo';

/** comment-pack 保存ソース（曲解説＋自由4本） */
export const SONG_LOOKUP_COMMENT_SOURCES = [
  'ai_commentary',
  'ai_chat_1',
  'ai_chat_2',
  'ai_chat_3',
  'ai_chat_4',
] as const;

const YOUTUBE_HOST_PATH = /youtube\.com\/watch\?([^#]*)/i;
const YOUTUBE_SHORT = /youtu\.be\/([a-zA-Z0-9_-]{6,})/i;
const YOUTUBE_EMBED = /youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/i;

export function jstYmdFromIso(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: JST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

export function jstDayRangeUtc(ymd: string): { startIso: string; endIso: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const start = new Date(`${ymd}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** クエリ文字列から YouTube video_id を取り出す（URL または 11 文字前後の素の ID） */
export function extractYoutubeVideoIdFromQuery(q: string): string | null {
  const t = q.trim();
  if (!t) return null;
  const mShort = t.match(YOUTUBE_SHORT);
  if (mShort?.[1]) return mShort[1].slice(0, 11);
  const mEmb = t.match(YOUTUBE_EMBED);
  if (mEmb?.[1]) return mEmb[1].slice(0, 11);
  const mWatch = t.match(YOUTUBE_HOST_PATH);
  if (mWatch?.[1]) {
    const qs = new URLSearchParams(mWatch[1].replace(/^&/, ''));
    const v = qs.get('v')?.trim();
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(t)) return t;
  return null;
}

export function textContainsVideoId(body: string, videoId: string): boolean {
  const vid = videoId.trim();
  if (!vid) return false;
  const b = body.toLowerCase();
  const v = vid.toLowerCase();
  if (b.includes(`v=${v}`) || b.includes(`v=${v}&`) || b.includes(`youtu.be/${v}`)) return true;
  if (b.includes(`embed/${v}`)) return true;
  return b.includes(v);
}

export function isLikelySongCommentaryAiBody(body: string): boolean {
  const s = body.trim();
  return /^\[NEW\]/u.test(s) || /^\[DB\]/u.test(s);
}

export function playWindowsFromPlays(
  plays: { played_at: string }[],
  marginBeforeMs: number,
  marginAfterMs: number,
): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const p of plays) {
    const t = new Date(p.played_at).getTime();
    if (Number.isNaN(t)) continue;
    out.push({ start: t - marginBeforeMs, end: t + marginAfterMs });
  }
  return out;
}

export function isoInAnyWindow(iso: string, windows: { start: number; end: number }[]): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return windows.some((w) => t >= w.start && t <= w.end);
}

/** 再生ウィンドウ内の @→AI ペア（同一部屋・同一日の plays はその日の該当曲再生のみ） */
export function filterAtPairsByPlayWindows(
  pairs: AtChatPairFromLog[],
  plays: { played_at: string }[],
): AtChatPairFromLog[] {
  const wins = playWindowsFromPlays(plays, 90_000, 50 * 60_000);
  return pairs.filter((p) => isoInAnyWindow(p.userCreatedAt, wins));
}

export type LiveCommentaryHit = {
  created_at: string;
  room_id: string;
  body: string;
};

/**
 * 同一日・同一部屋ログから、[NEW]/[DB] の AI 行で、
 * 直前（最大 40 行）に当該 video を含むユーザー行があり、かつ再生ウィンドウに入るものを最大 max 件。
 */
export function extractLiveCommentariesFromLog(
  rows: readonly RoomChatLogRow[],
  videoId: string,
  plays: { played_at: string }[],
  roomId: string,
  max: number,
): LiveCommentaryHit[] {
  const wins = playWindowsFromPlays(plays, 45_000, 50 * 60_000);
  const list = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const hits: LiveCommentaryHit[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < list.length; i += 1) {
    const row = list[i]!;
    if ((row.message_type ?? '') !== 'ai') continue;
    if (!isLikelySongCommentaryAiBody(row.body ?? '')) continue;
    if (!isoInAnyWindow(row.created_at, wins)) continue;

    let foundUserWithVideo = false;
    for (let j = i - 1; j >= 0 && j >= i - 40; j -= 1) {
      const u = list[j]!;
      if ((u.message_type ?? '') !== 'user') continue;
      if (textContainsVideoId(u.body ?? '', videoId)) {
        const ut = new Date(u.created_at).getTime();
        const rt = new Date(row.created_at).getTime();
        if (!Number.isNaN(ut) && !Number.isNaN(rt) && rt - ut <= 20 * 60_000) {
          foundUserWithVideo = true;
        }
        break;
      }
    }
    if (!foundUserWithVideo) continue;

    const key = `${roomId}\t${row.created_at}\t${(row.body ?? '').slice(0, 120)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      created_at: row.created_at,
      room_id: roomId,
      body: (row.body ?? '').trim(),
    });
    if (hits.length >= max) break;
  }

  return hits;
}

export type QuizMarkerHit = {
  created_at: string;
  room_id: string;
  body: string;
};

/** 【曲クイズ】のシステム行（本文に設問は含まれない想定）を時刻のみ記録 */
export function extractQuizMarkersFromLog(
  rows: readonly RoomChatLogRow[],
  plays: { played_at: string }[],
  roomId: string,
  max: number,
): QuizMarkerHit[] {
  const wins = playWindowsFromPlays(plays, 60_000, 55 * 60_000);
  const hits: QuizMarkerHit[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if ((row.message_type ?? '') !== 'system') continue;
    const body = row.body ?? '';
    if (!body.includes('【曲クイズ】') && !body.includes('曲クイズ')) continue;
    if (!isoInAnyWindow(row.created_at, wins)) continue;
    const key = `${roomId}\t${row.created_at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ created_at: row.created_at, room_id: roomId, body: body.trim() });
    if (hits.length >= max) break;
  }
  return hits;
}

export type AtQaPairWithRoom = AtChatPairFromLog & { room_id: string };

export type SongLookupDateBlock = {
  dateJst: string;
  plays: { room_id: string; played_at: string; title: string | null; artist_name: string | null }[];
  liveCommentaries: LiveCommentaryHit[];
  atQaPairs: AtQaPairWithRoom[];
  quizMarkers: QuizMarkerHit[];
};

export type SongLookupLibraryComment = {
  source: string;
  body: string;
  created_at: string;
};

export type SongLookupRecommendRow = {
  id: string;
  seed_label: string | null;
  recommended_artist: string | null;
  recommended_title: string | null;
  reason: string | null;
  order_index: number | null;
  created_at: string;
  is_active?: boolean;
};

export function buildSongLookupExportText(params: {
  videoId: string;
  displayLabel: string;
  watchUrl: string;
  warnings: string[];
  libraryComments: SongLookupLibraryComment[];
  recommendations: SongLookupRecommendRow[];
  dateBlocks: SongLookupDateBlock[];
}): string {
  const lines: string[] = [];
  const br = () => lines.push('');
  lines.push('='.repeat(78));
  lines.push('曲引き（管理用エクスポート）');
  lines.push('='.repeat(78));
  br();
  lines.push(`YouTube ID: ${params.videoId}`);
  lines.push(`表示: ${params.displayLabel}`);
  lines.push(`URL: ${params.watchUrl}`);
  br();
  if (params.warnings.length) {
    lines.push('【注意】');
    for (const w of params.warnings) lines.push(`- ${w}`);
    br();
  }

  lines.push('-'.repeat(78));
  lines.push('■ ライブラリ（曲解説・comment-pack 系・最大5件）');
  lines.push('-'.repeat(78));
  if (params.libraryComments.length === 0) {
    lines.push('（該当なし）');
  } else {
    for (const c of params.libraryComments) {
      lines.push(`[${c.source}] ${c.created_at}`);
      lines.push(c.body);
      br();
    }
  }
  br();

  lines.push('-'.repeat(78));
  lines.push('■ おすすめ曲（next_song_recommendations）');
  lines.push('-'.repeat(78));
  if (params.recommendations.length === 0) {
    lines.push('（該当なし）');
  } else {
    for (const r of params.recommendations) {
      const pick = [r.recommended_artist, r.recommended_title].filter(Boolean).join(' - ') || '—';
      const act = r.is_active === false ? 'inactive' : 'active';
      lines.push(`- ${pick} (order ${r.order_index ?? '—'}, ${act})`);
      if (r.reason) lines.push(`  理由: ${r.reason}`);
      lines.push(`  登録: ${r.created_at}  id=${r.id}`);
    }
  }
  br();

  lines.push('-'.repeat(78));
  lines.push('■ 曲クイズ');
  lines.push('-'.repeat(78));
  lines.push(
    'room_chat_log には三択の設問・選択肢・正解インデックスが本文で保存されていないため、出題システム行の時刻のみ列挙します。',
  );
  br();

  for (const block of params.dateBlocks) {
    lines.push('='.repeat(78));
    lines.push(`日付（JST）: ${block.dateJst}（新しい日付から順に出力）`);
    lines.push('='.repeat(78));

    lines.push('-- 再生（room_playback_history）');
    if (block.plays.length === 0) lines.push('（なし）');
    else {
      for (const p of block.plays) {
        const label = [p.artist_name, p.title].filter(Boolean).join(' / ') || '—';
        lines.push(`- ${p.played_at}  room=${p.room_id}  ${label}`);
      }
    }
    br();

    lines.push('-- 曲解説（チャット上の [NEW]/[DB]・再生付近・最大5件/日）');
    if (block.liveCommentaries.length === 0) {
      lines.push('（該当なし）');
    } else {
      for (const c of block.liveCommentaries) {
        lines.push(`[${c.created_at}] room=${c.room_id}`);
        lines.push(c.body);
        br();
      }
    }

    lines.push('-- 曲クイズ（システム行の記録のみ）');
    if (block.quizMarkers.length === 0) {
      lines.push('（該当なし）');
    } else {
      for (const q of block.quizMarkers) {
        lines.push(`[${q.created_at}] room=${q.room_id}`);
        lines.push(q.body);
      }
    }
    br();

    lines.push('-- @ 質問と AI 回答（再生付近のペア）');
    if (block.atQaPairs.length === 0) {
      lines.push('（該当なし）');
    } else {
      for (const p of block.atQaPairs) {
        lines.push(`[${p.userCreatedAt}] ${p.userDisplayName} (room=${p.room_id})`);
        lines.push(`Q: ${p.userBody}`);
        lines.push(`[${p.aiCreatedAt}] AI`);
        lines.push(`A: ${p.aiBody}`);
        br();
      }
    }
    br();
  }

  return lines.join('\n').trimEnd() + '\n';
}

export function mergeLibraryComments(params: {
  songCommentary: { body: string; created_at: string } | null;
  tidbits: { source: string; body: string; created_at: string }[];
  max: number;
}): SongLookupLibraryComment[] {
  const out: SongLookupLibraryComment[] = [];
  if (params.songCommentary?.body?.trim()) {
    out.push({
      source: 'song_commentary',
      body: params.songCommentary.body.trim(),
      created_at: params.songCommentary.created_at,
    });
  }
  for (const t of params.tidbits) {
    if (out.length >= params.max) break;
    const body = (t.body ?? '').trim();
    if (!body) continue;
    if (out.some((o) => o.body === body)) continue;
    out.push({ source: t.source, body, created_at: t.created_at });
  }
  return out.slice(0, params.max);
}

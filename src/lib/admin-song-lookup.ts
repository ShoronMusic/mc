/**
 * 管理画面「曲引き」: 日時ユーティリティ・会話ログからの @ ペア用・レポート TEXT 組み立て
 */

import type { AtChatPairFromLog } from '@/lib/room-chat-at-qa-from-log';

export type { RoomChatLogRow } from '@/lib/room-chat-at-qa-from-log';

export const JST = 'Asia/Tokyo';

/** comment-pack 保存ソース（曲解説＋自由4本）— DB 解説の補助取得用 */
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

/** 再生ウィンドウ内の @→AI ペア */
export function filterAtPairsByPlayWindows(
  pairs: AtChatPairFromLog[],
  plays: { played_at: string }[],
): AtChatPairFromLog[] {
  const wins = playWindowsFromPlays(plays, 90_000, 50 * 60_000);
  return pairs.filter((p) => isoInAnyWindow(p.userCreatedAt, wins));
}

export type AtQaPairWithRoom = AtChatPairFromLog & { room_id: string };

export function splitDisplayTitle(raw: string): { artist: string; songTitle: string } {
  const t = raw.trim();
  if (!t) return { artist: '', songTitle: '' };
  const m = /\s+-\s+/.exec(t);
  if (!m || m.index <= 0) return { artist: '', songTitle: t };
  return {
    artist: t.slice(0, m.index).trim(),
    songTitle: t.slice(m.index + m[0].length).trim(),
  };
}

export type SongReportCommentaryDb = {
  body: string;
  source: string;
  updated_at: string;
};

export type SongReportSelectionRow = {
  played_at: string;
  date_jst: string;
  room_id: string;
  room_display_title: string;
  selector_display_name: string;
  snapshot_title: string | null;
  snapshot_artist: string | null;
};

export type SongReportQuizDb = {
  id: string;
  created_at: string;
  date_jst: string;
  room_id: string | null;
  commentary_sha: string | null;
  commentary_preview: string | null;
  quiz: {
    question: string;
    choices: [string, string, string];
    correctIndex: 0 | 1 | 2;
    explanation: string;
    theme?: string;
  };
};

export type SongReportRecommendPick = {
  artist: string;
  title: string;
  reason: string;
  order_index: number;
};

export type SongReportRecommendRound = {
  created_at: string;
  date_jst: string;
  picks: SongReportRecommendPick[];
};

export type SongReportAtRow = {
  date_jst: string;
  user_created_at: string;
  ai_created_at: string;
  room_id: string;
  room_display_title: string;
  questioner: string;
  question: string;
  answer: string;
};

export type SongAdminReport = {
  videoId: string;
  artist: string;
  songTitle: string;
  displayTitle: string;
  watchUrl: string;
  commentaryDb: SongReportCommentaryDb | null;
  selectionHistory: SongReportSelectionRow[];
  quizzesDb: SongReportQuizDb[];
  recommendationRounds: SongReportRecommendRound[];
  atQuestions: SongReportAtRow[];
  warnings: string[];
};

/**
 * `next_song_recommendations` の複数行を、同一 `created_at`（秒まで）のバッチ＝1 回のおすすめ生成とみなしてまとめる。
 * 各バッチは order_index 昇順で最大 `maxPicksPerRound` 件（既定 3）。
 */
export function groupNextSongRecommendationsIntoRounds(
  rows: ReadonlyArray<{
    created_at: string;
    recommended_artist: string | null;
    recommended_title: string | null;
    reason: string | null;
    order_index: number | null;
    is_active?: boolean | null;
  }>,
  maxPicksPerRound = 3,
): SongReportRecommendRound[] {
  const active = rows.filter((r) => r.is_active !== false);
  const sorted = [...active].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const batches: (typeof active)[] = [];
  for (const r of sorted) {
    const sub = (r.created_at || '').slice(0, 19);
    const prev = batches[batches.length - 1];
    if (prev?.[0] && (prev[0].created_at || '').slice(0, 19) === sub) prev.push(r);
    else batches.push([r]);
  }
  return batches.map((g) => {
    const inner = [...g].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    const picks: SongReportRecommendPick[] = inner.slice(0, maxPicksPerRound).map((x) => ({
      artist: (x.recommended_artist ?? '').trim() || '—',
      title: (x.recommended_title ?? '').trim() || '—',
      reason: (x.reason ?? '').trim() || '—',
      order_index: x.order_index ?? 0,
    }));
    const created = g[0]!.created_at;
    return { created_at: created, date_jst: jstYmdFromIso(created), picks };
  });
}

export function buildSongReportExportText(r: SongAdminReport): string {
  const lines: string[] = [];
  const br = () => lines.push('');
  lines.push('='.repeat(78));
  lines.push('曲レポート（管理・曲引き）');
  lines.push('='.repeat(78));
  br();
  lines.push(`動画ID: ${r.videoId}`);
  lines.push(`アーティスト: ${r.artist || '—'}`);
  lines.push(`タイトル: ${r.songTitle || '—'}`);
  lines.push(`表示名: ${r.displayTitle || '—'}`);
  lines.push(`URL: ${r.watchUrl}`);
  br();
  if (r.warnings.length) {
    lines.push('【注意】');
    for (const w of r.warnings) lines.push(`- ${w}`);
    br();
  }

  lines.push('-'.repeat(78));
  lines.push('■ 解説（DB）');
  lines.push('-'.repeat(78));
  if (!r.commentaryDb) {
    lines.push('（該当なし）');
  } else {
    lines.push(`source: ${r.commentaryDb.source}`);
    lines.push(`updated: ${r.commentaryDb.updated_at}`);
    lines.push(r.commentaryDb.body);
  }
  br();

  lines.push('-'.repeat(78));
  lines.push('■ 選曲履歴（日付・部屋名・選曲者）');
  lines.push('-'.repeat(78));
  if (r.selectionHistory.length === 0) {
    lines.push('（該当なし）');
  } else {
    for (const s of r.selectionHistory) {
      lines.push(
        `- ${s.date_jst} ${s.played_at}  部屋:「${s.room_display_title}」(${s.room_id})  選曲者:${s.selector_display_name}`,
      );
      if (s.snapshot_artist || s.snapshot_title) {
        lines.push(`  履歴表記: ${[s.snapshot_artist, s.snapshot_title].filter(Boolean).join(' - ') || '—'}`);
      }
    }
  }
  br();

  lines.push('-'.repeat(78));
  lines.push('■ クイズ（質問・三択・正解・解説）日付順（新しい順）');
  lines.push('-'.repeat(78));
  if (r.quizzesDb.length === 0) {
    lines.push('（該当なし。song_quiz_logs 未作成時や未生成の場合）');
  } else {
    for (const q of r.quizzesDb) {
      lines.push(`--- ${q.date_jst} ${q.created_at} id=${q.id} room=${q.room_id ?? '—'}`);
      if (q.commentary_preview) lines.push(`曲解説コンテキスト先頭: ${q.commentary_preview.replace(/\s+/g, ' ').slice(0, 200)}…`);
      lines.push(`SHA256(曲解説コンテキスト): ${q.commentary_sha ?? '—'}`);
      const sq = q.quiz;
      lines.push(`問題: ${sq.question}`);
      sq.choices.forEach((c, i) => lines.push(`  選択肢${i + 1}: ${c}`));
      lines.push(`正解: 選択肢${sq.correctIndex + 1}（index=${sq.correctIndex}）`);
      if (sq.theme) lines.push(`観点: ${sq.theme}`);
      lines.push(`解説: ${sq.explanation}`);
      br();
    }
  }

  lines.push('-'.repeat(78));
  lines.push('■ おすすめ曲（最大3件／バッチ。日付順・新しいバッチから）');
  lines.push('-'.repeat(78));
  if (r.recommendationRounds.length === 0) {
    lines.push('（該当なし）');
  } else {
    for (const round of r.recommendationRounds) {
      lines.push(`--- ${round.date_jst} ${round.created_at}`);
      for (const p of round.picks) {
        lines.push(`  - ${p.artist} - ${p.title}`);
        lines.push(`    解説: ${p.reason}`);
      }
    }
  }
  br();

  lines.push('-'.repeat(78));
  lines.push('■ @ 質問と回答（再生付近・日付順）');
  lines.push('-'.repeat(78));
  if (r.atQuestions.length === 0) {
    lines.push('（該当なし）');
  } else {
    for (const a of r.atQuestions) {
      lines.push(`--- ${a.date_jst} ${a.user_created_at}  部屋:「${a.room_display_title}」(${a.room_id})`);
      lines.push(`質問者: ${a.questioner}`);
      lines.push(`Q: ${a.question}`);
      lines.push(`(${a.ai_created_at}) A: ${a.answer}`);
      br();
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

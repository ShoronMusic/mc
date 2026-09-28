import { extractUiLabelFromBody } from '@/lib/chat-message-ui-labels';

/** 選曲時の AI 曲解説は最大 5 本（基本1 + 自由4） */
export const SONG_COMMENTARY_SLOT_COUNT = 5;

const SONG_COMMENTARY_LABEL_RE = /^【(?:AI曲解説|AI解説)(\d{2})】/;

type CommentaryMessageLike = {
  id?: string;
  messageType?: string;
  body?: string;
  videoId?: string | null;
  songId?: string | null;
  tidbitId?: string | null;
  aiSource?: string | null;
};

export type SongCommentaryPanelSlot = {
  messageId: string;
  /** パネル本文（UIラベルと先頭 [DB] を除く） */
  text: string;
  /** 評価 API に渡す元の本文 */
  feedbackBody: string;
  songId: string | null;
  videoId: string;
  aiSource: string;
  tidbitId: string | null;
};

/** 0..4。曲解説ラベルでなければ null */
export function songCommentarySlotIndexFromBody(body: string): number | null {
  const m = body.match(SONG_COMMENTARY_LABEL_RE);
  if (!m?.[1]) return null;
  const n = Number.parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 1 || n > SONG_COMMENTARY_SLOT_COUNT) return null;
  return n - 1;
}

export function isSongCommentaryChatMessage(m: CommentaryMessageLike): boolean {
  if (m.messageType !== 'ai') return false;
  return songCommentarySlotIndexFromBody(m.body ?? '') != null;
}

export function songCommentaryPanelText(body: string): string {
  const { text } = extractUiLabelFromBody(body);
  return text.replace(/^\[DB\]\s*/, '').trim();
}

/** 再生中 videoId の解説をスロット 1〜5 に揃える。同じ枠は後着を採用 */
export function collectCurrentSongCommentarySlots(
  messages: readonly CommentaryMessageLike[],
  videoId: string | null | undefined,
): (SongCommentaryPanelSlot | null)[] {
  const slots: (SongCommentaryPanelSlot | null)[] = Array.from(
    { length: SONG_COMMENTARY_SLOT_COUNT },
    () => null,
  );
  const vid = videoId?.trim() ?? '';
  if (!vid) return slots;
  for (const m of messages) {
    if (!isSongCommentaryChatMessage(m)) continue;
    if ((m.videoId ?? '').trim() !== vid) continue;
    const idx = songCommentarySlotIndexFromBody(m.body ?? '');
    if (idx == null) continue;
    const raw = m.body ?? '';
    const text = songCommentaryPanelText(raw);
    if (!text) continue;
    slots[idx] = {
      messageId: m.id?.trim() || `${vid}-${idx}`,
      text,
      feedbackBody: raw,
      songId: m.songId ?? null,
      videoId: vid,
      aiSource: m.aiSource?.trim() || 'tidbit',
      tidbitId: m.tidbitId?.trim() || null,
    };
  }
  return slots;
}

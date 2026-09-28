'use client';

import { HandThumbDownIcon, HandThumbUpIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState } from 'react';
import {
  SONG_COMMENTARY_SLOT_COUNT,
  type SongCommentaryPanelSlot,
} from '@/lib/song-commentary-panel';

type SlotEnabled = readonly [boolean, boolean, boolean, boolean, boolean];

type SongCommentaryTabPanelProps = {
  videoId: string | null;
  slots: readonly (SongCommentaryPanelSlot | null)[];
  slotEnabled?: SlotEnabled;
  canRejectTidbit?: boolean;
  onTidbitLibraryReject?: (messageId: string, tidbitId: string) => void | Promise<void>;
};

function slotIsEnabled(
  slotEnabled: SlotEnabled | undefined,
  index: number,
): boolean {
  if (!slotEnabled) return true;
  return slotEnabled[index] !== false;
}

export default function SongCommentaryTabPanel({
  videoId,
  slots,
  slotEnabled,
  canRejectTidbit = false,
  onTidbitLibraryReject,
}: SongCommentaryTabPanelProps) {
  const [subIndex, setSubIndex] = useState(0);
  const [voteById, setVoteById] = useState<Record<string, 'up' | 'down'>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const seenMessageIdsRef = useRef<string[]>(Array.from({ length: SONG_COMMENTARY_SLOT_COUNT }, () => ''));

  const hasVideo = Boolean(videoId?.trim());
  const safeIndex = subIndex >= 0 && subIndex < SONG_COMMENTARY_SLOT_COUNT ? subIndex : 0;
  const focusMessageId = slots[safeIndex]?.messageId ?? '';

  useEffect(() => {
    seenMessageIdsRef.current = Array.from({ length: SONG_COMMENTARY_SLOT_COUNT }, () => '');
    setSubIndex(0);
  }, [videoId]);

  useEffect(() => {
    let newest = -1;
    for (let i = 0; i < SONG_COMMENTARY_SLOT_COUNT; i += 1) {
      const id = slots[i]?.messageId ?? '';
      if (!id || id === seenMessageIdsRef.current[i]) continue;
      seenMessageIdsRef.current[i] = id;
      newest = i;
    }
    if (newest >= 0) setSubIndex(newest);
  }, [slots]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const el = sectionRefs.current[safeIndex];
    if (!scroller || !el) return;
    const align = () => {
      const top =
        el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      scroller.scrollTo({ top: Math.max(0, top - 4), behavior: 'smooth' });
    };
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(align);
    });
    return () => cancelAnimationFrame(raf);
  }, [safeIndex, focusMessageId, videoId]);

  const sendVote = (slot: SongCommentaryPanelSlot, isUpvote: boolean) => {
    const current = voteById[slot.messageId];
    if ((isUpvote && current === 'up') || (!isUpvote && current === 'down')) {
      setVoteById((prev) => {
        const next = { ...prev };
        delete next[slot.messageId];
        return next;
      });
      return;
    }
    setVoteById((prev) => ({ ...prev, [slot.messageId]: isUpvote ? 'up' : 'down' }));
    void fetch('/api/comment-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songId: slot.songId,
        videoId: slot.videoId,
        aiMessageId: slot.messageId,
        commentBody: slot.feedbackBody,
        source: slot.aiSource,
        isUpvote,
      }),
    }).catch(() => {});
  };

  const visibleIndexes = Array.from({ length: SONG_COMMENTARY_SLOT_COUNT }, (_, i) => i).filter(
    (i) => Boolean(slots[i]?.text) || slotIsEnabled(slotEnabled, i),
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="flex shrink-0 flex-wrap gap-1 border-b border-gray-700 px-2 py-1.5"
        role="tablist"
        aria-label="曲解説の番号"
      >
        {Array.from({ length: SONG_COMMENTARY_SLOT_COUNT }, (_, i) => {
          const filled = Boolean(slots[i]?.text);
          const selected = i === safeIndex;
          const off = !slotIsEnabled(slotEnabled, i);
          return (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setSubIndex(i)}
              className={`rounded px-2 py-0.5 text-xs transition ${
                selected
                  ? 'bg-gray-700 text-white'
                  : off
                    ? 'text-gray-600 hover:bg-gray-700/40 hover:text-gray-400'
                    : filled
                      ? 'text-sky-300 hover:bg-gray-700/50'
                      : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
              }`}
            >
              解説{i + 1}
            </button>
          );
        })}
      </div>
      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-auto px-3 py-2 text-sm leading-relaxed text-gray-200"
      >
        {!hasVideo ? (
          <p>曲を再生すると、AI曲解説がここに表示されます。</p>
        ) : visibleIndexes.length === 0 ? (
          <p>この曲の解説枠はオフです。</p>
        ) : (
          <div className="flex flex-col gap-3">
            {visibleIndexes.map((i) => {
              const slot = slots[i] ?? null;
              const enabled = slotIsEnabled(slotEnabled, i);
              const active = i === safeIndex;
              const vote = slot ? voteById[slot.messageId] : undefined;
              return (
                <section
                  key={slot?.messageId ?? `pending-${i}`}
                  ref={(node) => {
                    sectionRefs.current[i] = node;
                  }}
                  aria-current={active ? 'true' : undefined}
                  className={`rounded-md border px-2.5 py-2 ${
                    active ? 'border-sky-600/80 bg-gray-900/40' : 'border-gray-700/80'
                  }`}
                >
                  {slot?.text ? (
                    <>
                      <p className="whitespace-pre-wrap break-words">{slot.text}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
                        <button
                          type="button"
                          className={`flex items-center justify-center rounded border px-1.5 py-0.5 ${
                            vote === 'up'
                              ? 'border-emerald-400 text-emerald-300'
                              : 'border-gray-500 text-gray-400 hover:bg-gray-800'
                          }`}
                          onClick={() => sendVote(slot, true)}
                          aria-label={`解説${i + 1}にいいね`}
                        >
                          <HandThumbUpIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className={`flex items-center justify-center rounded border px-1.5 py-0.5 ${
                            vote === 'down'
                              ? 'border-rose-400 text-rose-300'
                              : 'border-gray-500 text-gray-400 hover:bg-gray-800'
                          }`}
                          onClick={() => sendVote(slot, false)}
                          aria-label={`解説${i + 1}に良くない評価`}
                        >
                          <HandThumbDownIcon className="h-4 w-4" />
                        </button>
                        {canRejectTidbit && onTidbitLibraryReject && slot.tidbitId ? (
                          <button
                            type="button"
                            disabled={rejectingId === slot.messageId}
                            className="rounded border border-amber-700/80 bg-amber-950/40 px-2 py-0.5 font-medium text-amber-200/95 hover:bg-amber-900/50 disabled:opacity-50"
                            title="この1件を song_tidbits から無効化（再利用されません）"
                            onClick={() => {
                              const tid = slot.tidbitId;
                              if (!tid) return;
                              setRejectingId(slot.messageId);
                              void Promise.resolve(onTidbitLibraryReject(slot.messageId, tid)).finally(() => {
                                setRejectingId((cur) => (cur === slot.messageId ? null : cur));
                              });
                            }}
                          >
                            {rejectingId === slot.messageId ? '処理中…' : 'NG（DBから外す）'}
                          </button>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <p className="text-gray-500">{enabled ? '生成中…' : 'この枠はオフです。'}</p>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import type { CommentPackSlotSelection } from '@/lib/comment-pack-slots';
import type { RoomAiOwnerPolicy } from '@/lib/user-room-ai-features';
import { PersonalAiSettingsPanel } from '@/components/mypage/PersonalAiSettingsPanel';
import { OwnerRoomAiSettingsPanel } from '@/components/mypage/OwnerRoomAiSettingsPanel';

type AiSettingsTab = 'personal' | 'owner';

export type RoomAiSettingsModalProps = {
  onClose: () => void;
  isChatOwner?: boolean;
  showOwnerAiTab: boolean;
  /** true のとき最初に「部屋（オーナー）」タブを表示（オーナー単独・複数参加いずれも） */
  defaultOwnerTab?: boolean;
  roomAiOwnerPolicy?: RoomAiOwnerPolicy;
  ownerAiCharacterJoinEnabled: boolean;
  onOwnerAiCharacterJoinToggle?: () => void;
  ownerAiCharacterName?: string;
  onOwnerAiCharacterNameChange?: (name: string) => void;
  commentPackSlots?: CommentPackSlotSelection;
  onCommentPackSlotsChange?: (slots: CommentPackSlotSelection) => void;
  ownerSongQuizEnabled?: boolean;
  onOwnerSongQuizToggle?: () => void;
  ownerNextSongRecommendEnabled?: boolean;
  onOwnerNextSongRecommendToggle?: () => void;
  jpAiUnlockEnabled?: boolean;
  onJpAiUnlockToggle?: () => void;
  onOpenFullMyPage?: () => void;
};

export function RoomAiSettingsModal({
  onClose,
  isChatOwner = false,
  showOwnerAiTab,
  defaultOwnerTab = false,
  roomAiOwnerPolicy,
  ownerAiCharacterJoinEnabled,
  onOwnerAiCharacterJoinToggle,
  ownerAiCharacterName,
  onOwnerAiCharacterNameChange,
  commentPackSlots,
  onCommentPackSlotsChange,
  ownerSongQuizEnabled,
  onOwnerSongQuizToggle,
  ownerNextSongRecommendEnabled,
  onOwnerNextSongRecommendToggle,
  jpAiUnlockEnabled,
  onJpAiUnlockToggle,
  onOpenFullMyPage,
}: RoomAiSettingsModalProps) {
  const [tab, setTab] = useState<AiSettingsTab>(() =>
    showOwnerAiTab && defaultOwnerTab ? 'owner' : 'personal',
  );

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/75 p-3"
      role="dialog"
      aria-modal="true"
      aria-label="AI 設定"
    >
      <div
        className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-violet-600/50 bg-gray-950 text-left shadow-xl lg:max-w-4xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-violet-900/60 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white sm:text-base">AI 設定</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400 sm:text-xs">
              選曲時の AI（解説・クイズ・おすすめ）と「@」質問向けの趣向メモ。部屋全体の上限はオーナーのみ変更できます。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 shrink-0 items-center justify-center rounded border border-violet-700/60 bg-gray-800 px-3 text-xs text-violet-100 hover:bg-gray-700 sm:text-sm"
          >
            閉じる
          </button>
        </div>

        {showOwnerAiTab ? (
          <div className="flex shrink-0 gap-1 border-b border-gray-800 px-3 pt-2 sm:px-4">
            <button
              type="button"
              onClick={() => setTab('personal')}
              className={`rounded-t px-3 py-2 text-xs font-medium sm:text-sm ${
                tab === 'personal'
                  ? 'border border-b-0 border-violet-700/60 bg-violet-950/40 text-violet-100'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              自分
            </button>
            <button
              type="button"
              onClick={() => setTab('owner')}
              className={`rounded-t px-3 py-2 text-xs font-medium sm:text-sm ${
                tab === 'owner'
                  ? 'border border-b-0 border-amber-700/60 bg-amber-950/30 text-amber-100'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              部屋（オーナー）
            </button>
          </div>
        ) : null}

        <div className="mc-scrollbar-stable min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
          {tab === 'personal' || !showOwnerAiTab ? (
            <div className="flex flex-col gap-3">
              <PersonalAiSettingsPanel
                isGuest={false}
                isChatOwner={isChatOwner}
                showOwnerTabLink={showOwnerAiTab}
                onOpenOwnerTab={() => setTab('owner')}
                roomAiOwnerPolicy={roomAiOwnerPolicy}
                ownerAiCharacterJoinEnabled={ownerAiCharacterJoinEnabled}
                commentPackSlots={commentPackSlots}
                onCommentPackSlotsChange={onCommentPackSlotsChange}
                variant="modal"
              />
            </div>
          ) : (
            <OwnerRoomAiSettingsPanel
              ownerAiCharacterJoinEnabled={ownerAiCharacterJoinEnabled}
              onOwnerAiCharacterJoinToggle={onOwnerAiCharacterJoinToggle}
              ownerAiCharacterName={ownerAiCharacterName}
              onOwnerAiCharacterNameChange={onOwnerAiCharacterNameChange}
              commentPackSlots={commentPackSlots}
              onCommentPackSlotsChange={onCommentPackSlotsChange}
              ownerSongQuizEnabled={ownerSongQuizEnabled}
              onOwnerSongQuizToggle={onOwnerSongQuizToggle}
              ownerNextSongRecommendEnabled={ownerNextSongRecommendEnabled}
              onOwnerNextSongRecommendToggle={onOwnerNextSongRecommendToggle}
              jpAiUnlockEnabled={jpAiUnlockEnabled}
              onJpAiUnlockToggle={onJpAiUnlockToggle}
            />
          )}
        </div>

        {onOpenFullMyPage ? (
          <div className="shrink-0 border-t border-gray-800 px-4 py-2.5">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenFullMyPage();
              }}
              className="text-[11px] text-gray-500 underline decoration-dotted underline-offset-2 hover:text-gray-300 sm:text-xs"
            >
              表示名・マイリストなどその他の設定はマイページへ
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

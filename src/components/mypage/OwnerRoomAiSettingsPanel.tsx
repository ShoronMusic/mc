'use client';

import { useEffect, useState } from 'react';
import {
  COMMENT_PACK_SLOTS_FULL,
  COMMENT_PACK_SLOTS_NONE,
  DEFAULT_COMMENT_PACK_SLOTS,
  toggleCommentPackSlot,
  type CommentPackSlotSelection,
} from '@/lib/comment-pack-slots';

export type OwnerRoomAiSettingsPanelProps = {
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
};

export function OwnerRoomAiSettingsPanel({
  ownerAiCharacterJoinEnabled,
  onOwnerAiCharacterJoinToggle,
  ownerAiCharacterName = 'エージェント1号',
  onOwnerAiCharacterNameChange,
  commentPackSlots = DEFAULT_COMMENT_PACK_SLOTS,
  onCommentPackSlotsChange,
  ownerSongQuizEnabled = false,
  onOwnerSongQuizToggle,
  ownerNextSongRecommendEnabled = false,
  onOwnerNextSongRecommendToggle,
  jpAiUnlockEnabled = false,
  onJpAiUnlockToggle,
}: OwnerRoomAiSettingsPanelProps) {
  const [ownerAiCharacterNameInput, setOwnerAiCharacterNameInput] = useState(ownerAiCharacterName);

  useEffect(() => {
    setOwnerAiCharacterNameInput(ownerAiCharacterName);
  }, [ownerAiCharacterName]);

  const hasAnyControl =
    onOwnerAiCharacterJoinToggle ||
    onCommentPackSlotsChange ||
    onOwnerSongQuizToggle ||
    onOwnerNextSongRecommendToggle ||
    onJpAiUnlockToggle;

  if (!hasAnyControl) {
    return (
      <p className="rounded border border-gray-700/80 bg-gray-800/40 p-3 text-sm text-gray-400">
        部屋全体の AI 設定を変更できるのは、この部屋のオーナーのみです。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded border border-amber-700/50 bg-amber-900/20 p-3">
        <h3 className="text-sm font-medium text-amber-200">部屋全体の AI（全員に効く）</h3>
        <p className="mt-1 text-xs leading-relaxed text-gray-400">
          参加者全員のチャットヘッダーと AI の上限（天井）です。ここを OFF にすると、ユーザー設定で ON にしていても無効です。選曲者個人の
          opt-out は「自分」タブ。AI エージェントはこのタブのみ（個人 ON/OFF なし）。
        </p>
      </div>

      {onOwnerAiCharacterJoinToggle ? (
        <div className="rounded border border-amber-700/50 bg-amber-900/20 p-3">
          <h4 className="mb-2 text-xs font-medium text-gray-300">AIエージェント参加</h4>
          <p className="mb-2 text-xs text-gray-400">
            チャットヘッダーの「AI参加」ピルと連動します。曲解説・曲クイズ・おすすめの部屋上限や、参加者各自の ON/OFF
            とは別の設定です。
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={ownerAiCharacterJoinEnabled ? undefined : onOwnerAiCharacterJoinToggle}
              className={`rounded px-3 py-1.5 text-sm ${ownerAiCharacterJoinEnabled ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              ON
            </button>
            <button
              type="button"
              onClick={!ownerAiCharacterJoinEnabled ? undefined : onOwnerAiCharacterJoinToggle}
              className={`rounded px-3 py-1.5 text-sm ${!ownerAiCharacterJoinEnabled ? 'bg-gray-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              OFF
            </button>
          </div>
          {onOwnerAiCharacterNameChange ? (
            <div className="mt-3 space-y-2">
              <label className="block text-xs text-gray-300">AIエージェント名（部屋に表示）</label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={ownerAiCharacterNameInput}
                  onChange={(e) => setOwnerAiCharacterNameInput(e.target.value)}
                  maxLength={24}
                  placeholder="エージェント1号"
                  className="min-w-0 flex-1 rounded border border-gray-600 bg-gray-800 px-2.5 py-1.5 text-sm text-gray-100 placeholder:text-gray-500 focus:border-amber-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => onOwnerAiCharacterNameChange(ownerAiCharacterNameInput)}
                  className="rounded bg-amber-700 px-3 py-1.5 text-sm text-white hover:bg-amber-600"
                >
                  反映
                </button>
              </div>
              <p className="text-[11px] text-gray-500">空欄で反映するとデフォルト名「エージェント1号」に戻ります。</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {onCommentPackSlotsChange ? (
        <div className="rounded border border-amber-700/50 bg-amber-900/20 p-3">
          <h4 className="mb-2 text-xs font-medium text-gray-300">曲紹介コメント（曲解説の種類）</h4>
          <p className="mb-2 text-xs text-gray-400">
            選曲後に出す AI 解説の種類です。すべてオフにすると解説は出ません。好きな組み合わせ（例: 1 と 4 だけ）が選べます。
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onCommentPackSlotsChange(COMMENT_PACK_SLOTS_NONE)}
              className="rounded bg-gray-700 px-2.5 py-1 text-xs text-gray-200 hover:bg-gray-600"
            >
              まとめてオフ
            </button>
            <button
              type="button"
              onClick={() => onCommentPackSlotsChange(DEFAULT_COMMENT_PACK_SLOTS)}
              className="rounded bg-gray-700 px-2.5 py-1 text-xs text-gray-200 hover:bg-gray-600"
            >
              基本のみ（従来デフォルト）
            </button>
            <button
              type="button"
              onClick={() => onCommentPackSlotsChange(COMMENT_PACK_SLOTS_FULL)}
              className="rounded bg-gray-700 px-2.5 py-1 text-xs text-gray-200 hover:bg-gray-600"
            >
              5 本すべて
            </button>
          </div>
          <ul className="space-y-2 text-xs text-gray-200">
            {(
              [
                { i: 0 as const, label: '1. 曲の基本情報・概要' },
                { i: 1 as const, label: '2. ヒット・受賞・話題（チャート等）' },
                { i: 2 as const, label: '3. 歌詞のテーマ・メッセージ' },
                { i: 3 as const, label: '4. サウンドの特徴' },
                { i: 4 as const, label: '5. アーティスト情報（当時の概要・活動フェーズ）' },
              ] as const
            ).map(({ i, label }) => (
              <li key={i} className="flex items-start gap-2">
                <input
                  id={`ai-modal-comment-pack-slot-${i}`}
                  type="checkbox"
                  checked={commentPackSlots[i]}
                  onChange={() => onCommentPackSlotsChange(toggleCommentPackSlot(commentPackSlots, i))}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-500 bg-gray-800 text-amber-600 focus:ring-amber-500"
                />
                <label htmlFor={`ai-modal-comment-pack-slot-${i}`} className="cursor-pointer select-none leading-snug">
                  {label}
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {onOwnerSongQuizToggle ? (
        <div className="rounded border border-amber-700/50 bg-amber-900/20 p-3">
          <h4 className="mb-2 text-xs font-medium text-gray-300">曲クイズ</h4>
          <p className="mb-2 text-xs text-gray-400">
            部屋全体の曲クイズ ON/OFF です。曲解説が部屋で OFF のときはクイズも出ません。
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={ownerSongQuizEnabled ? undefined : onOwnerSongQuizToggle}
              className={`rounded px-3 py-1.5 text-sm ${ownerSongQuizEnabled ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              ON
            </button>
            <button
              type="button"
              onClick={!ownerSongQuizEnabled ? undefined : onOwnerSongQuizToggle}
              className={`rounded px-3 py-1.5 text-sm ${!ownerSongQuizEnabled ? 'bg-gray-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              OFF
            </button>
          </div>
        </div>
      ) : null}

      {onOwnerNextSongRecommendToggle ? (
        <div className="rounded border border-amber-700/50 bg-amber-900/20 p-3">
          <h4 className="mb-2 text-xs font-medium text-gray-300">おすすめ曲</h4>
          <p className="mb-2 text-xs text-gray-400">部屋全体のおすすめ曲 ON/OFF です。</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={ownerNextSongRecommendEnabled ? undefined : onOwnerNextSongRecommendToggle}
              className={`rounded px-3 py-1.5 text-sm ${ownerNextSongRecommendEnabled ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              ON
            </button>
            <button
              type="button"
              onClick={!ownerNextSongRecommendEnabled ? undefined : onOwnerNextSongRecommendToggle}
              className={`rounded px-3 py-1.5 text-sm ${!ownerNextSongRecommendEnabled ? 'bg-gray-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              OFF
            </button>
          </div>
        </div>
      ) : null}

      {onJpAiUnlockToggle ? (
        <div className="rounded border border-amber-700/50 bg-amber-900/20 p-3">
          <h4 className="mb-2 text-xs font-medium text-gray-300">邦楽AI解説</h4>
          <p className="mb-2 text-xs text-gray-400">
            デフォルトは洋楽推奨（邦楽AI解説なし）です。必要なときだけ邦楽のAI解説を解禁できます。
          </p>
          <button
            type="button"
            onClick={onJpAiUnlockToggle}
            className={`rounded border px-2 py-1.5 text-xs ${
              jpAiUnlockEnabled
                ? 'border-emerald-600 bg-emerald-900/40 text-emerald-200'
                : 'border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
            title={jpAiUnlockEnabled ? '邦楽AI解説を無効化' : '邦楽AI解説を解禁'}
          >
            邦楽AI解説 {jpAiUnlockEnabled ? '解禁中' : '無効（デフォルト）'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

'use client';

import type { CommentPackSlotSelection } from '@/lib/comment-pack-slots';
import { formatCommentPackSlotsSummary } from '@/lib/comment-pack-slots';
import type { RoomAiOwnerPolicy } from '@/lib/user-room-ai-features';
import { isUserRoomAiFeaturesSetupMessage } from '@/lib/user-room-ai-features';
import { IS_MC_PRODUCT } from '@/lib/product-branding';
import { UserRoomAiFeaturesSqlHint } from '@/components/mypage/UserRoomAiFeaturesSqlHint';
import { AiTrialStatusBadge } from '@/components/shared/AiTrialStatusBadge';
import { usePersonalAiSettings } from '@/hooks/usePersonalAiSettings';
import {
  PersonalAiAgentOwnerNote,
  PersonalAiOwnerCeilingNote,
  PersonalAiSettingsPolicySummary,
  PersonalAiUserOnOffButtons,
} from '@/components/mypage/personal-ai-settings-shared';

export type PersonalAiSettingsPanelProps = {
  isGuest: boolean;
  isChatOwner?: boolean;
  showOwnerTabLink: boolean;
  onOpenOwnerTab: () => void;
  roomAiOwnerPolicy?: RoomAiOwnerPolicy;
  ownerAiCharacterJoinEnabled: boolean;
  commentPackSlots?: CommentPackSlotSelection;
  onCommentPackSlotsChange?: (slots: CommentPackSlotSelection) => void;
  /** compact: AI設定モーダル向けに余白を少し詰める */
  variant?: 'mypage' | 'modal';
};

export function PersonalAiSettingsPanel({
  isGuest,
  isChatOwner = false,
  showOwnerTabLink,
  onOpenOwnerTab,
  roomAiOwnerPolicy,
  ownerAiCharacterJoinEnabled,
  commentPackSlots,
  onCommentPackSlotsChange,
  variant = 'mypage',
}: PersonalAiSettingsPanelProps) {
  const settings = usePersonalAiSettings(isGuest, roomAiOwnerPolicy);

  if (IS_MC_PRODUCT || isGuest) return null;

  const ownerLinkLabel = variant === 'modal' ? '部屋（オーナー）タブ' : '部屋設定（オーナー）タブ';

  return (
    <>
      <div className="rounded border border-violet-700/45 bg-violet-950/25 p-3">
        <h3 className="text-sm font-medium text-violet-100">自分の AI 設定（選曲時）</h3>
        <p className="mt-1 text-xs leading-relaxed text-gray-400">
          自分が選曲した 1 回について、この端末から AI を呼ぶかを決めます。部屋が OFF の機能はオンにできません。部屋が
          ON なら、自分だけオフにできます。
        </p>
        <PersonalAiSettingsPolicySummary />
        <div className="mt-3">
          <AiTrialStatusBadge
            status={settings.aiTrialStatus}
            loading={settings.aiTrialState === 'loading'}
            variant="compact"
          />
        </div>
        {showOwnerTabLink ? (
          <p className="mt-2 text-[11px] leading-snug text-gray-500">
            部屋の上限（曲解説の種類・クイズ／おすすめ・邦楽解禁）は{' '}
            <button
              type="button"
              onClick={onOpenOwnerTab}
              className="text-violet-300 underline decoration-dotted underline-offset-2 hover:text-violet-200"
            >
              {ownerLinkLabel}
            </button>
            で変更します。
          </p>
        ) : roomAiOwnerPolicy ? (
          <p className="mt-2 text-[11px] leading-snug text-gray-500">
            部屋の上限はオーナーが決めます。オーナー OFF の機能は自分 ON 不可です。
          </p>
        ) : null}
        {settings.roomAiFeaturesLoading ? (
          <p className="mt-3 text-sm text-gray-500">読み込み中…</p>
        ) : (
          <>
            <p className="mt-4 text-sm text-gray-300">
              AI曲解説（自分）
              {!settings.roomAiCommentaryEnabled && settings.roomCommentaryOn ? (
                <span className="ml-1.5 align-middle text-[10px] font-medium text-gray-400">自分OFF</span>
              ) : null}
            </p>
            {roomAiOwnerPolicy ? (
              <PersonalAiOwnerCeilingNote roomEnabled={settings.roomCommentaryOn} featureLabel="曲解説" />
            ) : (
              <p className="mt-1 text-[11px] text-gray-500">種類（基本・歌詞など）は部屋オーナーが決めます。</p>
            )}
            {isChatOwner && onCommentPackSlotsChange && commentPackSlots ? (
              <p className="mt-0.5 text-[11px] text-gray-500">
                種類: {formatCommentPackSlotsSummary(commentPackSlots)}
              </p>
            ) : null}
            <PersonalAiUserOnOffButtons
              enabled={settings.roomAiCommentaryEnabled}
              saving={settings.roomAiFeaturesSaving}
              disableEnable={!settings.canPersonalCommentaryOn}
              disableEnableTitle="部屋で曲解説が OFF のためオンにできません"
              onEnable={() =>
                void settings.saveRoomAiFeatures({
                  commentaryEnabled: true,
                  songQuizEnabled: settings.roomAiSongQuizEnabled,
                  nextSongRecommendEnabled: settings.roomAiNextSongRecommendEnabled,
                })
              }
              onDisable={() =>
                void settings.saveRoomAiFeatures({
                  commentaryEnabled: false,
                  songQuizEnabled: false,
                  nextSongRecommendEnabled: settings.roomAiNextSongRecommendEnabled,
                })
              }
            />

            <p className="mt-4 text-sm text-gray-300">
              AI曲クイズ（自分）
              {!settings.roomAiSongQuizEnabled && settings.roomCommentaryOn && settings.roomQuizOn ? (
                <span className="ml-1.5 align-middle text-[10px] font-medium text-gray-400">自分OFF</span>
              ) : null}
            </p>
            {!settings.roomCommentaryOn ? (
              <p className="mt-1 text-[11px] text-amber-300/90">
                部屋で曲解説が OFF のため、曲クイズは利用できません。
              </p>
            ) : roomAiOwnerPolicy ? (
              <PersonalAiOwnerCeilingNote roomEnabled={settings.roomQuizOn} featureLabel="曲クイズ" />
            ) : null}
            {!settings.roomAiCommentaryEnabled && settings.roomCommentaryOn && settings.roomQuizOn ? (
              <p className="mt-1 text-[11px] text-amber-300/90">
                自分の解説が OFF のため、クイズをオンにできません。
              </p>
            ) : null}
            <PersonalAiUserOnOffButtons
              enabled={settings.roomAiSongQuizEnabled}
              saving={settings.roomAiFeaturesSaving}
              hideWhenUnavailable={!settings.roomCommentaryOn}
              disableEnable={!settings.canPersonalQuizOn}
              disableEnableTitle={
                !settings.roomQuizOn
                  ? '部屋で曲クイズが OFF のためオンにできません'
                  : '自分の解説をオンにするとクイズもオンにできます'
              }
              onEnable={() =>
                void settings.saveRoomAiFeatures({
                  commentaryEnabled: settings.roomAiCommentaryEnabled,
                  songQuizEnabled: true,
                  nextSongRecommendEnabled: settings.roomAiNextSongRecommendEnabled,
                })
              }
              onDisable={() =>
                void settings.saveRoomAiFeatures({
                  commentaryEnabled: settings.roomAiCommentaryEnabled,
                  songQuizEnabled: false,
                  nextSongRecommendEnabled: settings.roomAiNextSongRecommendEnabled,
                })
              }
            />

            <p className="mt-4 text-sm text-gray-300">
              AIおすすめ曲（自分）
              {!settings.roomAiNextSongRecommendEnabled && settings.roomRecommendOn ? (
                <span className="ml-1.5 align-middle text-[10px] font-medium text-gray-400">自分OFF</span>
              ) : null}
            </p>
            {roomAiOwnerPolicy ? (
              <PersonalAiOwnerCeilingNote roomEnabled={settings.roomRecommendOn} featureLabel="おすすめ曲" />
            ) : null}
            <PersonalAiUserOnOffButtons
              enabled={settings.roomAiNextSongRecommendEnabled}
              saving={settings.roomAiFeaturesSaving}
              disableEnable={!settings.canPersonalRecommendOn}
              disableEnableTitle="部屋でおすすめ曲が OFF のためオンにできません"
              onEnable={() =>
                void settings.saveRoomAiFeatures({
                  commentaryEnabled: settings.roomAiCommentaryEnabled,
                  songQuizEnabled: settings.roomAiSongQuizEnabled,
                  nextSongRecommendEnabled: true,
                })
              }
              onDisable={() =>
                void settings.saveRoomAiFeatures({
                  commentaryEnabled: settings.roomAiCommentaryEnabled,
                  songQuizEnabled: settings.roomAiSongQuizEnabled,
                  nextSongRecommendEnabled: false,
                })
              }
            />
          </>
        )}
        <PersonalAiAgentOwnerNote
          agentJoinEnabled={ownerAiCharacterJoinEnabled}
          inSyncedRoom={Boolean(roomAiOwnerPolicy)}
          showOwnerTabLink={showOwnerTabLink}
          onOpenOwnerTab={onOpenOwnerTab}
        />
        {settings.roomAiFeaturesMessage ? (
          <div className="mt-2">
            <p
              className={`text-xs ${
                settings.roomAiFeaturesMessage.startsWith('保存しました') ? 'text-emerald-400' : 'text-amber-300'
              }`}
            >
              {settings.roomAiFeaturesMessage}
            </p>
            {isUserRoomAiFeaturesSetupMessage(settings.roomAiFeaturesMessage) ? <UserRoomAiFeaturesSqlHint /> : null}
          </div>
        ) : null}
      </div>

      <div className="rounded border border-violet-700/35 bg-violet-950/15 p-3">
        <label className="block text-xs text-gray-500">@ 質問向け（自分の AI）</label>
        <p className="mt-1 text-xs text-gray-400">
          部屋で「@」から AI に話しかけたときの参考になります（通常の雑談には載りません）。他の参加者には表示されません。
          選曲時の AI 機能の ON/OFF は上の「自分の AI 設定」で変更します。
          自動要約は
          <strong className="font-normal text-gray-300">選曲履歴・お気に入り・マイリスト・チャット（DB保存分）・公開プロフィール</strong>
          をまとめて Gemini が短文化します。保存済みの自動要約が無い／薄いときは、公開プロフィールをプレビューに仮表示します。
        </p>
        {settings.aiTasteLoading ? (
          <p className="mt-2 text-sm text-gray-500">読み込み中…</p>
        ) : (
          <>
            <label className="mt-3 block text-xs font-medium text-sky-300/90">「@」時に AI が読む趣向（手動＋自動要約）</label>
            <p className="mt-0.5 text-[11px] text-gray-500">
              読み取り専用のプレビューです。「利用履歴から自動要約を更新」で DB に保存されると「@」応答でも使われます。
              {settings.aiTasteAutoUpdatedAt ? (
                <>
                  {' '}
                  自動要約の最終更新:{' '}
                  {new Date(settings.aiTasteAutoUpdatedAt).toLocaleString('ja-JP', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </>
              ) : null}
            </p>
            <textarea
              readOnly
              value={
                settings.aiTastePromptPreview ??
                '（まだありません。下で手動メモを書いて保存するか、「利用履歴から自動要約を更新」を実行してください）'
              }
              rows={6}
              className="mc-scrollbar-stable mt-1.5 w-full cursor-default resize-none rounded border border-sky-800/60 bg-gray-900/70 px-3 py-2 text-sm text-gray-200"
              aria-label="AIが参照する趣向メモのプレビュー"
            />
            {settings.aiTasteAutoProfileText.trim() &&
            settings.looksTruncatedUserTasteAutoProfile(settings.aiTasteAutoProfileText) ? (
              <p className="mt-1.5 text-xs text-amber-300">
                保存済みの自動要約が途中で切れているため表示していません。「利用履歴から自動要約を更新」を再度お試しください。
              </p>
            ) : settings.aiTasteAutoProfileText.trim() &&
              !settings.isSubstantiveUserTasteAutoProfile(settings.aiTasteAutoProfileText) ? (
              <p className="mt-1.5 text-xs text-amber-300">
                保存済みの自動要約が導入文だけのため表示していません。「利用履歴から自動要約を更新」で選曲履歴などを含めて再生成してください。
              </p>
            ) : !settings.userTasteAutoProfileForUse(settings.aiTasteAutoProfileText) &&
              settings.aiTastePromptPreview &&
              !settings.aiTasteSummary.trim() ? (
              <p className="mt-1.5 text-xs text-gray-500">
                いまは公開プロフィールの仮プレビューです。選曲履歴なども含めて反映するには「利用履歴から自動要約を更新」を押してください。
              </p>
            ) : null}
            <label className="mt-3 block text-xs font-medium text-gray-400">手動メモ（編集して保存）</label>
            <textarea
              value={settings.aiTasteSummary}
              onChange={(e) => settings.setAiTasteSummary(e.target.value)}
              maxLength={settings.aiTasteMaxChars}
              rows={4}
              className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500"
              placeholder="例：2000年代ポップパンク・アヴリル系が好き。バラードよりアップテンポ。英語詞のニュアンスも話したい。"
              aria-label="手動の趣向メモ"
            />
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
              <span>
                手動 {settings.aiTasteSummary.length} / {settings.aiTasteMaxChars} 文字
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void settings.handleRefreshAiTasteAuto()}
                  disabled={settings.aiTasteSaving || settings.aiTasteAutoRefreshing}
                  className="rounded border border-gray-500 bg-gray-700 px-3 py-1.5 text-sm text-gray-100 hover:bg-gray-600 disabled:opacity-50"
                >
                  {settings.aiTasteAutoRefreshing ? '自動要約を生成中…' : '利用履歴から自動要約を更新'}
                </button>
                <button
                  type="button"
                  onClick={() => void settings.handleSaveAiTasteSummary()}
                  disabled={settings.aiTasteSaving || settings.aiTasteAutoRefreshing}
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {settings.aiTasteSaving ? '保存中…' : '手動メモを保存'}
                </button>
              </div>
            </div>
          </>
        )}
        {settings.aiTasteMessage ? (
          <p
            className={`mt-2 text-xs ${
              settings.aiTasteMessage.startsWith('保存しました') || settings.aiTasteMessage.includes('自動要約を更新')
                ? 'text-emerald-400'
                : 'text-amber-300'
            }`}
          >
            {settings.aiTasteMessage}
          </p>
        ) : null}
      </div>
    </>
  );
}

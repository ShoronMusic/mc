/** マイページ／AI設定モーダルで個人 AI 設定を保存したあと、部屋側が再取得する */
export const USER_ROOM_AI_FEATURES_UPDATED_EVENT = 'musicaichat:user-room-ai-features-updated';

export function dispatchUserRoomAiFeaturesUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(USER_ROOM_AI_FEATURES_UPDATED_EVENT));
}

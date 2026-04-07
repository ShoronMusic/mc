/**
 * Chrome 拡張などが MAIN ワールドから発火し、発言欄の React state を更新するためのイベント名。
 * 拡張の `executeScript`（world: 'MAIN'）と値を共有する。
 */
export const MUSICAI_EXTENSION_SET_CHAT_TEXT_EVENT = 'musicai-extension-set-chat-text';

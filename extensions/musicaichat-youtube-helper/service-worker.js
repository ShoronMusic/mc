/**
 * 発言欄連携のイベント名（アプリ側 src/lib/musicai-extension-events.ts と一致させる）
 */
const MUSICAI_EXTENSION_SET_CHAT_TEXT_EVENT = 'musicai-extension-set-chat-text';

function isYouTubePageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /(^https?:\/\/)(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(url);
}

function isMusicAiTabUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    if (u.hostname.endsWith('.vercel.app')) return true;
    return false;
  } catch {
    return false;
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id || !tab.url) return;
  if (!isYouTubePageUrl(tab.url)) return;
  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_MODAL',
      pageUrl: tab.url,
      windowId: tab.windowId,
    });
  } catch {
    // コンテンツスクリプト未注入時など
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'PASTE_TO_MUSICAI' && typeof msg.url === 'string') {
    const windowId =
      typeof msg.windowId === 'number' && msg.windowId >= 0 ? msg.windowId : undefined;
    pasteToMusicAiTab(msg.url, windowId).then(sendResponse);
    return true;
  }
  return false;
});

async function pasteToMusicAiTab(url, windowId) {
  const query = windowId != null ? { windowId } : {};
  const tabs = await chrome.tabs.query(query);
  const candidates = tabs.filter((t) => t.id != null && isMusicAiTabUrl(t.url));
  candidates.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  const target = candidates[0];
  if (!target?.id) {
    return { ok: false, reason: 'no_musicai_tab' };
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: target.id },
      func: (text, eventName) => {
        window.dispatchEvent(
          new CustomEvent(eventName, { detail: { text }, bubbles: false })
        );
      },
      args: [url, MUSICAI_EXTENSION_SET_CHAT_TEXT_EVENT],
      world: 'MAIN',
    });
    await chrome.tabs.update(target.id, { active: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'inject_failed', message: String(e) };
  }
}

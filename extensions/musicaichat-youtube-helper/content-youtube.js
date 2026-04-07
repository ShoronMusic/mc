(function () {
  'use strict';

  /** @type {HTMLElement | null} */
  let host = null;

  /**
   * @param {string} urlString
   * @returns {string}
   */
  function canonicalYouTubeWatchUrl(urlString) {
    try {
      const u = new URL(urlString);
      const h = u.hostname.replace(/^www\./, '');
      if (h === 'youtu.be') {
        const id = u.pathname.replace(/^\//, '').split(/[/?#]/)[0];
        if (id) return `https://www.youtube.com/watch?v=${id}`;
      }
      if (h === 'youtube.com' || h === 'm.youtube.com' || h === 'music.youtube.com') {
        const shorts = u.pathname.match(/^\/shorts\/([^/?#]+)/);
        if (shorts?.[1]) return `https://www.youtube.com/watch?v=${shorts[1]}`;
        const v = u.searchParams.get('v');
        if (v) return `https://www.youtube.com/watch?v=${v}`;
      }
    } catch (_) {}
    return urlString;
  }

  function removeModal() {
    if (host) {
      host.remove();
      host = null;
    }
  }

  /**
   * @param {string} pageUrl
   * @param {number} windowId
   */
  function showModal(pageUrl, windowId) {
    removeModal();
    const canon = canonicalYouTubeWatchUrl(pageUrl);

    function escapeHtml(s) {
      return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    host = document.createElement('div');
    host.id = 'musicaichat-youtube-helper-overlay';
    host.setAttribute('data-musicaichat-ext', '1');

    const shadow = host.attachShadow({ mode: 'open' });

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
        .backdrop {
          position: fixed;
          inset: 0;
          z-index: 2147483646;
          background: rgba(0,0,0,0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .card {
          width: min(400px, 100%);
          background: #111827;
          color: #e5e7eb;
          border-radius: 12px;
          border: 1px solid #374151;
          box-shadow: 0 20px 50px rgba(0,0,0,0.5);
          padding: 20px;
        }
        h2 { margin: 0 0 8px; font-size: 1rem; font-weight: 600; color: #f9fafb; }
        .url {
          font-size: 12px;
          word-break: break-all;
          color: #9ca3af;
          margin-bottom: 16px;
          line-height: 1.4;
        }
        .btn-row { display: flex; flex-direction: column; gap: 10px; }
        button {
          border: none;
          border-radius: 8px;
          padding: 12px 14px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }
        .primary {
          background: #2563eb;
          color: #fff;
        }
        .primary:hover { background: #1d4ed8; }
        .ghost {
          background: transparent;
          color: #9ca3af;
          border: 1px solid #4b5563;
        }
        .ghost:hover { background: #1f2937; color: #e5e7eb; }
        .future {
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px solid #374151;
          font-size: 11px;
          line-height: 1.5;
          color: #6b7280;
        }
        .future strong { color: #9ca3af; }
      </style>
      <div class="backdrop" role="presentation">
        <div class="card" role="dialog" aria-labelledby="mac-ext-title">
          <h2 id="mac-ext-title">洋楽チャット（MUSIC AI CHAT）</h2>
          <div class="url">${escapeHtml(canon)}</div>
          <div class="btn-row">
            <button type="button" class="primary" id="mac-ext-send">この曲を選択</button>
            <button type="button" class="ghost" id="mac-ext-close">閉じる</button>
          </div>
          <div class="future">
            <strong>今後の予定（拡張の更新で追加）</strong><br />
            ・ライブラリへの一時保存<br />
            ・自分専用タグを付けて URL を保存
          </div>
        </div>
      </div>
    `;

    shadow.appendChild(wrap);

    const backdrop = wrap.querySelector('.backdrop');
    const btnSend = wrap.querySelector('#mac-ext-send');
    const btnClose = wrap.querySelector('#mac-ext-close');

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) removeModal();
    });
    btnClose.addEventListener('click', () => removeModal());

    btnSend.addEventListener('click', async () => {
      btnSend.disabled = true;
      try {
        /** @type {{ type: string; url: string; windowId?: number }} */
        const payload = { type: 'PASTE_TO_MUSICAI', url: canon };
        if (typeof windowId === 'number' && windowId >= 0) payload.windowId = windowId;
        const res = await chrome.runtime.sendMessage(payload);
        if (res?.ok) {
          removeModal();
        } else {
          btnSend.disabled = false;
          const hint =
            res?.reason === 'no_musicai_tab'
              ? '同じウィンドウで localhost（洋楽チャット）のタブを開いてから再度お試しください。'
              : '貼り付けに失敗しました。チャットを開き直してから再度お試しください。';
          alert(hint);
        }
      } catch {
        btnSend.disabled = false;
        alert('拡張機能との通信に失敗しました。');
      }
    });

    document.documentElement.appendChild(host);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'SHOW_MODAL' && typeof msg.pageUrl === 'string') {
      const wid = typeof msg.windowId === 'number' ? msg.windowId : -1;
      showModal(msg.pageUrl, wid);
      sendResponse({ ok: true });
    }
    return true;
  });
})();

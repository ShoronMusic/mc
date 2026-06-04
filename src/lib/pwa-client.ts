/** PWA / スマホブラウザ向けのクライアント判定（SSR では false 扱い） */

const DISMISS_STORAGE_KEY = 'mc_pwa_install_hint_dismissed_at';
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;

export function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia('(display-mode: standalone)');
  if (mq.matches) return true;
  // iOS Safari（ホーム画面追加）
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isAndroidDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

/** ざっくりモバイル（タブレット含む） */
export function isMobileUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  return isIosDevice() || isAndroidDevice() || /Mobile/i.test(navigator.userAgent);
}

export function isPwaInstallHintDismissed(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

export function dismissPwaInstallHint(): void {
  try {
    localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** 以前「閉じる」を押したあとでも、URL で案内を出し直す */
export function isPwaInstallForceShowFromUrl(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('pwa_install') === '1';
  } catch {
    return false;
  }
}

export function clearPwaInstallHintDismiss(): void {
  try {
    localStorage.removeItem(DISMISS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getDisplayModeForAnalytics(): string {
  if (typeof window === 'undefined') return 'unknown';
  if (isStandaloneDisplayMode()) return 'standalone';
  if (window.matchMedia('(display-mode: minimal-ui)').matches) return 'minimal-ui';
  if (window.matchMedia('(display-mode: fullscreen)').matches) return 'fullscreen';
  return 'browser';
}

/** 文言改定時はキーを変えて再同意を求められるようにする */
export const TERMS_CONSENT_STORAGE_KEY = 'mc:terms_accepted_v1';

export function readTermsAccepted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(TERMS_CONSENT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeTermsAccepted(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TERMS_CONSENT_STORAGE_KEY, '1');
  } catch {
    /* ignore quota / private mode */
  }
}

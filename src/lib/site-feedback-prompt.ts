const STORAGE_KEY = 'site_feedback_prompt_v1';
const MAX_SHOW_PER_MONTH = 2;

type SiteFeedbackPromptState = {
  lastShownAt: number | null;
  lastAnsweredAt: number | null;
  monthKey: string;
  monthlyShowCount: number;
};

function monthKeyOf(nowMs: number): string {
  const d = new Date(nowMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function defaultState(nowMs: number): SiteFeedbackPromptState {
  return {
    lastShownAt: null,
    lastAnsweredAt: null,
    monthKey: monthKeyOf(nowMs),
    monthlyShowCount: 0,
  };
}

function normalizeState(raw: unknown, nowMs: number): SiteFeedbackPromptState {
  const base = defaultState(nowMs);
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Partial<SiteFeedbackPromptState>;
  const monthKey = typeof obj.monthKey === 'string' ? obj.monthKey : base.monthKey;
  const monthlyShowCount =
    typeof obj.monthlyShowCount === 'number' && Number.isFinite(obj.monthlyShowCount)
      ? Math.max(0, Math.floor(obj.monthlyShowCount))
      : 0;
  const normalized: SiteFeedbackPromptState = {
    lastShownAt: typeof obj.lastShownAt === 'number' ? obj.lastShownAt : null,
    lastAnsweredAt: typeof obj.lastAnsweredAt === 'number' ? obj.lastAnsweredAt : null,
    monthKey,
    monthlyShowCount,
  };
  if (normalized.monthKey !== base.monthKey) {
    normalized.monthKey = base.monthKey;
    normalized.monthlyShowCount = 0;
  }
  return normalized;
}

function readState(nowMs: number): SiteFeedbackPromptState {
  if (typeof window === 'undefined') return defaultState(nowMs);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState(nowMs);
    return normalizeState(JSON.parse(raw), nowMs);
  } catch {
    return defaultState(nowMs);
  }
}

function writeState(state: SiteFeedbackPromptState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function shouldShowLeaveSiteFeedbackPrompt(nowMs: number = Date.now()): boolean {
  const state = readState(nowMs);
  // 一度も回答していないユーザーには、退室時アンケートを表示し続ける。
  if (state.lastAnsweredAt === null) {
    return true;
  }
  if (state.monthlyShowCount >= MAX_SHOW_PER_MONTH) {
    return false;
  }
  return true;
}

export function markLeaveSiteFeedbackShown(nowMs: number = Date.now()): void {
  const state = readState(nowMs);
  state.lastShownAt = nowMs;
  state.monthKey = monthKeyOf(nowMs);
  state.monthlyShowCount = Math.min(MAX_SHOW_PER_MONTH, state.monthlyShowCount + 1);
  writeState(state);
}

export function markLeaveSiteFeedbackAnswered(nowMs: number = Date.now()): void {
  const state = readState(nowMs);
  state.lastAnsweredAt = nowMs;
  state.monthKey = monthKeyOf(nowMs);
  state.monthlyShowCount = 0;
  writeState(state);
}

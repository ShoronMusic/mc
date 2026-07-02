import { extractUiLabelFromBody, stripUiLabelPrefixFromBody } from '@/lib/chat-message-ui-labels';
import type { AiTrialStatus } from '@/lib/ai-trial-status';

export const SONG_OVERVIEW_REQUEST_PROMPT = 'この曲の概要を説明してください';

export const AI_CHARACTER_DEFAULT_ANNOUNCE_NAME = 'エージェント1号';

/** 「〇〇さんの選曲です！」形式なら投稿者名を返す */
export function getSelectorNameFromAnnounceBody(body: string): string | null {
  const text = stripUiLabelPrefixFromBody(body);
  const match = text.match(/^(.+?)さんの選曲(?:\s+お題（[^）]+）チャレンジ)?です！/);
  return match ? match[1].trim() : null;
}

export function isAgentSelectionAnnounceName(
  selectorName: string | null,
  ownerAiCharacterName: string,
): boolean {
  if (!selectorName) return false;
  const agent = (ownerAiCharacterName || AI_CHARACTER_DEFAULT_ANNOUNCE_NAME).trim();
  return selectorName.trim() === agent;
}

/** @質問相当の枠があり、概要リクエストボタンを出せるか */
export function canRequestSongOverviewAtQuestion(status: AiTrialStatus | null | undefined): boolean {
  if (!status) return false;
  if (status.phase === 'developer_unlimited') return true;
  if (status.phase === 'email_unconfirmed' || status.phase === 'trial_exhausted') return false;
  if (status.phase === 'credits_active') return status.creditsRemaining > 0;
  if (status.phase === 'trial_active' || status.phase === 'preview') {
    if (status.phase === 'preview' && !status.enforcementEnabled) return true;
    return status.atQuestionsRemaining > 0;
  }
  return false;
}

export function formatSongOverviewRequestButtonLabel(status: AiTrialStatus): string {
  if (status.phase === 'developer_unlimited') return 'この曲の概要を開く';
  if (status.phase === 'credits_active') return 'この曲の概要を開く（1クレジット消費）';
  return 'この曲の概要を開く（@1回消費）';
}

type MessageLike = {
  messageType?: string;
  body: string;
  videoId?: string | null;
  aiSource?: string;
};

/** 同じ videoId で曲解説（comment-pack）が既に出ているか */
export function hasSongCommentaryForVideo(messages: readonly MessageLike[], videoId: string): boolean {
  const vid = videoId.trim();
  if (!vid) return false;
  for (const m of messages) {
    if ((m.videoId ?? '').trim() !== vid) continue;
    if (m.aiSource === 'commentary') return true;
    if (m.messageType !== 'ai') continue;
    const { label, text } = extractUiLabelFromBody(m.body);
    if (label?.startsWith('AI曲解説')) return true;
    const body = text.replace(/^\[DB\]\s*/, '');
    if (body.startsWith('[NEW]') || body.startsWith('[DB]')) return true;
  }
  return false;
}

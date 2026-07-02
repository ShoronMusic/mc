import assert from 'node:assert/strict';
import {
  canRequestSongOverviewAtQuestion,
  formatSongOverviewRequestButtonLabel,
  getSelectorNameFromAnnounceBody,
  hasSongCommentaryForVideo,
  isAgentSelectionAnnounceName,
} from '@/lib/song-overview-request';
import type { AiTrialStatus } from '@/lib/ai-trial-status';

const trialActive: AiTrialStatus = {
  phase: 'trial_active',
  songsGranted: 10,
  songsRemaining: 3,
  atQuestionsGranted: 5,
  atQuestionsRemaining: 2,
  enforcementEnabled: true,
  creditsEnabled: false,
  creditsRemaining: 0,
};

const creditsActive: AiTrialStatus = {
  phase: 'credits_active',
  songsGranted: 10,
  songsRemaining: 0,
  atQuestionsGranted: 5,
  atQuestionsRemaining: 0,
  enforcementEnabled: true,
  creditsEnabled: true,
  creditsRemaining: 12,
};

assert.equal(
  getSelectorNameFromAnnounceBody('エージェント1号さんの選曲です！\nELO - Mr. Blue Sky'),
  'エージェント1号',
);
assert.equal(isAgentSelectionAnnounceName('エージェント1号', 'エージェント1号'), true);
assert.equal(isAgentSelectionAnnounceName('ハチ', 'エージェント1号'), false);
assert.equal(canRequestSongOverviewAtQuestion(trialActive), true);
assert.equal(canRequestSongOverviewAtQuestion({ ...trialActive, atQuestionsRemaining: 0 }), false);
assert.equal(canRequestSongOverviewAtQuestion(creditsActive), true);
assert.equal(canRequestSongOverviewAtQuestion({ ...creditsActive, creditsRemaining: 0 }), false);
assert.match(formatSongOverviewRequestButtonLabel(creditsActive), /1クレジット消費/);
assert.match(formatSongOverviewRequestButtonLabel(trialActive), /@1回消費/);

assert.equal(
  hasSongCommentaryForVideo(
    [
      {
        messageType: 'ai',
        body: '【AI曲解説】テスト',
        videoId: 'abc',
        aiSource: 'commentary',
      },
    ],
    'abc',
  ),
  true,
);
assert.equal(
  hasSongCommentaryForVideo(
    [
      {
        messageType: 'ai',
        body: '【AI回答】概要です',
        videoId: 'abc',
        aiSource: 'chat_reply',
      },
    ],
    'abc',
  ),
  false,
);

console.log('song-overview-request.unit-test.ts: ok');

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  commentaryBodyHasNewOrDbOriginPrefix,
  formatCommentPackChatOriginPrefix,
  formatGemma4CommentaryHeadPrefix,
  stripGemma4CommentaryHeadPrefix,
} from '@/lib/commentary-model-head-tag';

test('formatGemma4CommentaryHeadPrefix: 31b only', () => {
  assert.equal(formatGemma4CommentaryHeadPrefix('gemma-4-31b-it'), '[G4] ');
  assert.equal(formatGemma4CommentaryHeadPrefix('gemma-4-26b-a4b-it'), '');
  assert.equal(formatGemma4CommentaryHeadPrefix('gemini-3.5-flash-lite'), '');
});

test('formatGemma4CommentaryHeadPrefix: hidden on production and Vercel', () => {
  const prevNode = process.env.NODE_ENV;
  const prevVercel = process.env.VERCEL;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.VERCEL;
    assert.equal(formatGemma4CommentaryHeadPrefix('gemma-4-31b-it'), '');
    assert.equal(formatCommentPackChatOriginPrefix('new', 'gemma-4-31b-it'), '[NEW] ');

    process.env.NODE_ENV = 'development';
    process.env.VERCEL = '1';
    assert.equal(formatGemma4CommentaryHeadPrefix('gemma-4-31b-it'), '');
    assert.equal(formatCommentPackChatOriginPrefix('new', 'gemma-4-31b-it'), '[NEW] ');
  } finally {
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
  }
});

test('formatCommentPackChatOriginPrefix: new gemma 31b at head', () => {
  assert.equal(
    formatCommentPackChatOriginPrefix('new', 'gemma-4-31b-it'),
    '[G4] [NEW] ',
  );
});

test('formatCommentPackChatOriginPrefix: library cache has no G4', () => {
  assert.equal(
    formatCommentPackChatOriginPrefix('library', 'gemma-4-31b-it'),
    '[DB] ',
  );
});

test('commentaryBodyHasNewOrDbOriginPrefix: after G4', () => {
  assert.equal(commentaryBodyHasNewOrDbOriginPrefix('[G4] [NEW] hello'), true);
  assert.equal(commentaryBodyHasNewOrDbOriginPrefix('[NEW] hello'), true);
  assert.equal(stripGemma4CommentaryHeadPrefix('[G4] [NEW] hello'), '[NEW] hello');
});

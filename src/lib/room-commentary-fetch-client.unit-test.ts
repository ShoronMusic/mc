import assert from 'node:assert/strict';
import {
  evaluateCommentaryFetchClient,
  shouldLocalClientFetchSongCommentary,
} from '@/lib/room-commentary-fetch-client';

assert.equal(
  shouldLocalClientFetchSongCommentary({
    myClientId: 'a',
    publisherClientId: 'a',
    aiMode: 'full',
    coordinationClientId: 'b',
    posterInRoom: true,
  }),
  true,
  'selector fetches when in room',
);

assert.equal(
  shouldLocalClientFetchSongCommentary({
    myClientId: 'b',
    publisherClientId: 'a',
    aiMode: 'full',
    coordinationClientId: 'b',
    posterInRoom: true,
  }),
  false,
  'coordinator does not fetch when selector is in room',
);

assert.equal(
  shouldLocalClientFetchSongCommentary({
    myClientId: 'b',
    publisherClientId: 'a',
    aiMode: 'full',
    coordinationClientId: 'b',
    posterInRoom: false,
  }),
  true,
  'coordinator fetches when selector is absent',
);

assert.equal(
  shouldLocalClientFetchSongCommentary({
    myClientId: 'a',
    publisherClientId: 'a',
    aiMode: 'none',
    coordinationClientId: 'b',
    posterInRoom: true,
  }),
  false,
  'none mode: no fetch',
);

assert.equal(
  evaluateCommentaryFetchClient({
    myClientId: 'b',
    publisherClientId: 'a',
    aiMode: 'full',
    coordinationClientId: 'b',
    posterInRoom: true,
  }).reason,
  'skip_not_poster',
);

console.log('room-commentary-fetch-client.unit-test: ok');

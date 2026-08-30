import assert from 'node:assert/strict';
import test from 'node:test';

import { extractSongStyleOptionFromModelText } from '@/lib/gemini';
import { parseUsableSongStyle, pickSongStyleByPriority, shouldCacheAssignedSongStyle } from '@/lib/song-styles';

test('extractSongStyleOptionFromModelText: plain label', () => {
  assert.equal(extractSongStyleOptionFromModelText('Pop'), 'Pop');
  assert.equal(extractSongStyleOptionFromModelText('R&B'), 'R&B');
  assert.equal(extractSongStyleOptionFromModelText('Alternative rock'), 'Alternative rock');
  assert.equal(extractSongStyleOptionFromModelText('Hip-hop'), 'Hip-hop');
});

test('extractSongStyleOptionFromModelText: Gemma preamble then label', () => {
  assert.equal(
    extractSongStyleOptionFromModelText('I think this is Pop because of the melody.'),
    'Pop',
  );
  assert.equal(extractSongStyleOptionFromModelText('* Alternative rock'), 'Alternative rock');
  assert.equal(extractSongStyleOptionFromModelText('The style is R&B.'), 'R&B');
});

test('extractSongStyleOptionFromModelText: Alternative rock wins over Rock', () => {
  assert.equal(
    extractSongStyleOptionFromModelText('This is Alternative rock, not classic Rock.'),
    'Alternative rock',
  );
});

test('extractSongStyleOptionFromModelText: no label → null', () => {
  assert.equal(extractSongStyleOptionFromModelText('スタイルはよく分かりません。'), null);
});

test('shouldCacheAssignedSongStyle: skip Other', () => {
  assert.equal(shouldCacheAssignedSongStyle('Pop'), true);
  assert.equal(shouldCacheAssignedSongStyle('R&B'), true);
  assert.equal(shouldCacheAssignedSongStyle('Other'), false);
});

test('parseUsableSongStyle: empty and Other are unused', () => {
  assert.equal(parseUsableSongStyle(null), null);
  assert.equal(parseUsableSongStyle(''), null);
  assert.equal(parseUsableSongStyle('Other'), null);
  assert.equal(parseUsableSongStyle('New wave'), null);
  assert.equal(parseUsableSongStyle('Rock'), 'Rock');
});

test('pickSongStyleByPriority: songs.style beats Music8 and AI', () => {
  assert.equal(
    pickSongStyleByPriority({
      songMasterStyle: 'Rock',
      videoCacheStyle: 'Pop',
      music8Style: 'Pop',
      aiStyle: 'Jazz',
    }),
    'Rock',
  );
  assert.equal(
    pickSongStyleByPriority({
      songMasterStyle: '',
      videoCacheStyle: 'Jazz',
      music8Style: 'Pop',
    }),
    'Jazz',
  );
  assert.equal(
    pickSongStyleByPriority({
      songMasterStyle: 'Other',
      videoCacheStyle: null,
      music8Style: 'Pop',
    }),
    'Pop',
  );
});

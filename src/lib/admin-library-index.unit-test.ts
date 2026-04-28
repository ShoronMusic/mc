import assert from 'node:assert/strict';
import { indexLetterForArtist, stripLeadingArticleForSort } from '@/lib/admin-library-index';

function run() {
  assert.equal(stripLeadingArticleForSort('The Police'), 'Police');
  assert.equal(stripLeadingArticleForSort('the beatles'), 'beatles');
  assert.equal(indexLetterForArtist('The Police'), 'P');
  assert.equal(indexLetterForArtist('the beatles'), 'B');
  assert.equal(indexLetterForArtist('911'), '9');
  console.log('admin-library-index.unit-test: ok');
}

run();

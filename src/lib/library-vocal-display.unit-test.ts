import assert from 'node:assert/strict';
import { formatLibraryVocalDisplay } from '@/lib/library-vocal-display';

function run() {
  assert.equal(formatLibraryVocalDisplay(null), null);
  assert.equal(formatLibraryVocalDisplay(''), null);
  assert.equal(formatLibraryVocalDisplay('lead'), null);
  assert.equal(formatLibraryVocalDisplay('M'), 'M');
  assert.equal(formatLibraryVocalDisplay('male'), 'M');
  assert.equal(formatLibraryVocalDisplay('Male'), 'M');
  assert.equal(formatLibraryVocalDisplay('F'), 'F');
  assert.equal(formatLibraryVocalDisplay('Female'), 'F');
  assert.equal(formatLibraryVocalDisplay('F, M'), 'F,M');
  assert.equal(formatLibraryVocalDisplay('F,M'), 'F,M');
  assert.equal(formatLibraryVocalDisplay('M,F'), 'F,M');
  assert.equal(formatLibraryVocalDisplay('女性'), 'F');
  assert.equal(formatLibraryVocalDisplay('男性'), 'M');
  console.log('library-vocal-display.unit-test: ok');
}

run();

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  isArtistMasterJsonFileName,
  loadSlugsFromArtistFailureLog,
  slugFromArtistMasterJsonFileName,
} from './import-music8-artists-bulk';

function run() {
  assert.equal(isArtistMasterJsonFileName('abc.json'), true);
  assert.equal(isArtistMasterJsonFileName('a-boogie-wit-da-hoodie.json'), true);
  assert.equal(isArtistMasterJsonFileName('abc_songs.json'), false);
  assert.equal(isArtistMasterJsonFileName('abc_spngs.json'), false);
  assert.equal(slugFromArtistMasterJsonFileName('strokes.json'), 'strokes');
  assert.equal(slugFromArtistMasterJsonFileName('strokes_songs.json'), null);
  const tmpLog = path.resolve(process.cwd(), 'tmp', '_test-artist-fail.jsonl');
  fs.mkdirSync(path.dirname(tmpLog), { recursive: true });
  fs.writeFileSync(
    tmpLog,
    '{"artistSlug":"strokes","stage":"upsert_artist","reason":"x"}\n',
    'utf8',
  );
  assert.deepEqual(loadSlugsFromArtistFailureLog(tmpLog), ['strokes']);
  fs.unlinkSync(tmpLog);

  console.log('import-music8-artists-bulk.unit-test: ok');
}

run();

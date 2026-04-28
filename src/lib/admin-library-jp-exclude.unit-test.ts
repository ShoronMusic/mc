import assert from 'node:assert/strict';
import { songRowLooksJapaneseDomesticForAdminLibrary } from '@/lib/admin-library-jp-exclude';

function run() {
  assert.equal(
    songRowLooksJapaneseDomesticForAdminLibrary({
      main_artist: '米津玄師',
      song_title: 'Lemon',
      display_title: '米津玄師 - Lemon',
    }),
    true,
  );
  assert.equal(
    songRowLooksJapaneseDomesticForAdminLibrary({
      main_artist: 'The Beatles',
      song_title: 'Let It Be',
      display_title: 'The Beatles - Let It Be',
    }),
    false,
  );
  assert.equal(
    songRowLooksJapaneseDomesticForAdminLibrary({
      main_artist: 'ONE OK ROCK',
      song_title: 'The Beginning',
      display_title: 'ONE OK ROCK - The Beginning',
    }),
    false,
  );
  console.log('admin-library-jp-exclude.unit-test: ok');
}

run();

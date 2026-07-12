import {
  musicBrainzMetadataLacksJapaneseScript,
} from './domestic-song-registration';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(
  musicBrainzMetadataLacksJapaneseScript({
    mainArtist: 'Fujii Kaze',
    songTitle: 'Michi Teyu Ku (Overflowing)',
    displayTitle: 'Fujii Kaze - Michi Teyu Ku (Overflowing)',
  }),
  'english-only MB metadata lacks Japanese',
);

assert(
  !musicBrainzMetadataLacksJapaneseScript({
    mainArtist: '米津玄師',
    songTitle: '烏',
    displayTitle: '米津玄師 - 烏',
  }),
  'japanese MB metadata has Japanese script',
);

console.log('domestic-song-registration.unit-test.ts: ok');

import {
  resetDomesticJpArtistCacheForTests,
  setDomesticJpArtistKeysForTests,
} from './domestic-jp-artists';
import { resolveJapaneseDomesticWithMusicBrainz } from './resolve-japanese-economy';
import { resetWesternTreatedJpArtistCacheForTests } from './western-treated-jp-artists';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function run() {
  resetWesternTreatedJpArtistCacheForTests();
  resetDomesticJpArtistCacheForTests();
  setDomesticJpArtistKeysForTests(['mrchildren']);

  const mrChildrenDomestic = await resolveJapaneseDomesticWithMusicBrainz({
    title: 'Mr.Children - Tomorrow never knows',
    artistDisplay: 'Mr.children Official Channel',
    artist: 'Mr.children Official Channel',
    song: 'Tomorrow never knows',
    description: null,
    channelTitle: 'Mr.Children Official Channel',
    defaultAudioLanguage: 'en',
  });
  assert(mrChildrenDomestic, 'Mr.Children official channel is domestic');

  const beatlesDomestic = await resolveJapaneseDomesticWithMusicBrainz({
    title: 'The Beatles - Hey Jude',
    artistDisplay: 'The Beatles',
    artist: 'The Beatles',
    song: 'Hey Jude',
    description: null,
    channelTitle: 'The Beatles',
    defaultAudioLanguage: 'en',
  });
  assert(!beatlesDomestic, 'Beatles not domestic without MB');

  console.log('resolve-japanese-economy.unit-test.ts: ok');
}

void run();

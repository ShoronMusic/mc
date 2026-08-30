import assert from 'node:assert/strict';
import {
  catalogAxisScores,
  clampScore,
  compositeScore,
  likedSongAxisHeatStyle,
  mergeAxisScores,
  releaseYearFromDate,
  scoreEra,
  scoreGenre,
} from '@/lib/liked-song-axis-score';
import type { SongAxisFacts } from '@/lib/liked-song-axis-types';

function facts(partial: Partial<SongAxisFacts>): SongAxisFacts {
  return {
    artist: 'Duran Duran',
    title: 'Hungry Like the Wolf',
    year: 1982,
    genres: ['New wave', 'Pop'],
    style: 'Pop',
    vocal: 'Male',
    recordingKind: 'original',
    ...partial,
  };
}

function run() {
  assert.equal(releaseYearFromDate('1983.05'), 1983);
  assert.equal(releaseYearFromDate('1982-06-01'), 1982);
  assert.equal(releaseYearFromDate(''), null);
  assert.equal(clampScore(140), 100);
  assert.equal(clampScore(-3), 0);

  const seed = facts({});
  const rio = facts({ title: 'Rio', year: 1982, genres: ['New wave', 'Dance'] });
  const era = scoreEra(seed, rio);
  assert.equal(era?.score, 100);
  assert.equal(era?.raw?.yearDelta, 0);

  const later = facts({ title: 'Ordinary World', year: 1993, genres: ['Pop'] });
  const era2 = scoreEra(seed, later);
  assert.ok(era2 && era2.score < 80 && era2.score > 0);

  const missingYear = scoreEra(seed, facts({ year: null }));
  assert.equal(missingYear, null);

  const g = scoreGenre(seed, rio);
  assert.ok(g && g.score > 0 && g.score < 100);
  assert.ok(Array.isArray(g.raw?.overlap) && (g.raw?.overlap as string[]).includes('new wave'));

  const noGenre = scoreGenre(seed, facts({ genres: [] }));
  assert.equal(noGenre, null);

  const catalog = catalogAxisScores(seed, rio);
  assert.equal(catalog.artist?.score, 100);
  assert.equal(catalog.mood, null);

  const merged = mergeAxisScores(catalog, { mood: 88, trend: 70, artist: 0 });
  assert.equal(merged.artist?.source, 'catalog');
  assert.equal(merged.artist?.score, 100);
  assert.equal(merged.mood?.source, 'ai');
  assert.equal(merged.mood?.score, 88);

  const comp = compositeScore(merged);
  assert.ok(comp != null && comp > 50);

  const heat = likedSongAxisHeatStyle(100);
  assert.ok(heat.backgroundColor && heat.backgroundColor.includes('hsl'));
  assert.deepEqual(likedSongAxisHeatStyle(null), {});

  console.log('liked-song-axis-score.unit-test: ok');
}

run();

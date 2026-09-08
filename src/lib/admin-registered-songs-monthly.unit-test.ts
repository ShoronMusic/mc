import assert from 'node:assert/strict';
import {
  buildAdminRegisteredSongsMonthlyDashboard,
  contrastTextOnHex,
  currentJstYear,
  jstYearMonthFromIso,
  monthlyCountClass,
  navSlugForRegisteredSongMonthly,
  parseAdminRegisteredSongsMonthlyYear,
  registrationTimestampIso,
} from '@/lib/admin-registered-songs-monthly';

assert.equal(jstYearMonthFromIso('2026-09-07T16:00:00.000Z')?.month, 9);
assert.equal(jstYearMonthFromIso('2025-12-31T15:00:00.000Z')?.year, 2026);
assert.equal(jstYearMonthFromIso('2025-12-31T14:59:59.000Z')?.year, 2025);
assert.equal(registrationTimestampIso({ catalog_published_at: '2026-03-01', created_at: '2025-01-01' }), '2026-03-01');
assert.equal(registrationTimestampIso({ catalog_published_at: null, created_at: '2026-08-01T00:00:00Z' }), '2026-08-01T00:00:00Z');

assert.equal(navSlugForRegisteredSongMonthly({ catalogStyleSlug: 'pop', songsStyle: 'Rock' }), 'pop');
assert.equal(navSlugForRegisteredSongMonthly({ catalogStyleSlug: null, songsStyle: 'Alternative rock' }), 'alternative');
assert.equal(navSlugForRegisteredSongMonthly({ catalogStyleSlug: null, songsStyle: 'Jazz' }), 'others');
assert.equal(navSlugForRegisteredSongMonthly({ catalogStyleSlug: null, songsStyle: null }), null);

assert.equal(monthlyCountClass(0, 100), 'zero');
assert.equal(monthlyCountClass(70, 100), 'high');
assert.equal(monthlyCountClass(40, 100), 'mid');
assert.equal(contrastTextOnHex('#ffd803'), '#1e293b');
assert.equal(contrastTextOnHex('#f25042'), '#ffffff');

const dash = buildAdminRegisteredSongsMonthlyDashboard({
  year: 2026,
  songs: [
    { id: 'a', style: 'Pop', created_at: '2026-08-10T00:00:00+09:00', catalog_published_at: null },
    { id: 'b', style: 'Pop', created_at: '2026-08-11T00:00:00+09:00', catalog_published_at: null },
    { id: 'c', style: 'Metal', created_at: '2025-01-01T00:00:00+09:00', catalog_published_at: null },
    { id: 'd', style: null, created_at: '2026-08-12T00:00:00+09:00', catalog_published_at: null },
  ],
  catalogStyleBySongId: new Map([['c', 'metal']]),
});
assert.equal(dash.total, 2);
assert.equal(dash.styles.find((s) => s.slug === 'pop')?.months[7], 2);
assert.equal(dash.styles.find((s) => s.slug === 'metal')?.total, 0);
assert.equal(dash.monthTotals[7], 2);
assert.equal(dash.styles[0].label, 'Pop');
assert.equal(dash.styles.find((s) => s.slug === 'metal')?.label, 'metal');

assert.equal(parseAdminRegisteredSongsMonthlyYear('2024'), 2024);
assert.equal(parseAdminRegisteredSongsMonthlyYear('nope', new Date('2026-09-08T00:00:00+09:00')), 2026);
assert.equal(currentJstYear(new Date('2026-01-01T00:00:00+09:00')), 2026);

console.log('admin-registered-songs-monthly.unit-test: ok');

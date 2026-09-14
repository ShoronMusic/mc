import assert from 'node:assert/strict';
import {
  buildAdminRegisteredSongsMonthlyDashboard,
  contrastTextOnHex,
  currentJstYear,
  jstYearMonthFromIso,
  monthlyCountClass,
  adminRegisteredSongStyleBarColor,
  ADMIN_STYLE_MONTHLY_COLORS,
  navSlugForRegisteredSongMonthly,
  parseAdminRegisteredSongsMonthlyYear,
  publicReleaseTimestampIso,
  originalReleaseDateYearBounds,
} from '@/lib/admin-registered-songs-monthly';

assert.equal(jstYearMonthFromIso('2026-09-07T16:00:00.000Z')?.month, 9);
assert.equal(jstYearMonthFromIso('2025-12-31T15:00:00.000Z')?.year, 2026);
assert.equal(jstYearMonthFromIso('2025-12-31T14:59:59.000Z')?.year, 2025);
assert.equal(jstYearMonthFromIso('2026-04-01')?.year, 2026);
assert.equal(jstYearMonthFromIso('2026-04-01')?.month, 4);
assert.equal(jstYearMonthFromIso('1983-05')?.year, 1983);
assert.equal(jstYearMonthFromIso('1983-05')?.month, 5);
assert.deepEqual(originalReleaseDateYearBounds(2026), { gte: '2026-01-01', lte: '2026-12-31' });

assert.equal(publicReleaseTimestampIso({ original_release_date: '2026-03-01' }), '2026-03-01');
assert.equal(publicReleaseTimestampIso({ original_release_date: null }), null);
assert.equal(publicReleaseTimestampIso({ original_release_date: '  ' }), null);

assert.equal(navSlugForRegisteredSongMonthly({ catalogStyleSlug: 'pop', songsStyle: 'Rock' }), 'pop');
assert.equal(navSlugForRegisteredSongMonthly({ catalogStyleSlug: null, songsStyle: 'Alternative rock' }), 'alternative');
assert.equal(navSlugForRegisteredSongMonthly({ catalogStyleSlug: null, songsStyle: 'Jazz' }), 'others');
assert.equal(navSlugForRegisteredSongMonthly({ catalogStyleSlug: null, songsStyle: null }), null);
assert.equal(adminRegisteredSongStyleBarColor('Metal'), ADMIN_STYLE_MONTHLY_COLORS.metal);
assert.equal(adminRegisteredSongStyleBarColor('Pop'), ADMIN_STYLE_MONTHLY_COLORS.pop);
assert.equal(adminRegisteredSongStyleBarColor('Jazz'), ADMIN_STYLE_MONTHLY_COLORS.others);
assert.equal(adminRegisteredSongStyleBarColor(null), ADMIN_STYLE_MONTHLY_COLORS.others);

assert.equal(monthlyCountClass(0, 100), 'zero');
assert.equal(monthlyCountClass(70, 100), 'high');
assert.equal(monthlyCountClass(40, 100), 'mid');
assert.equal(contrastTextOnHex('#ffd803'), '#1e293b');
assert.equal(contrastTextOnHex('#f25042'), '#ffffff');

const dash = buildAdminRegisteredSongsMonthlyDashboard({
  year: 2026,
  songs: [
    { id: 'a', style: 'Pop', original_release_date: '2026-08-10' },
    { id: 'b', style: 'Pop', original_release_date: '2026-08-11' },
    { id: 'c', style: 'Metal', original_release_date: '2025-01-01' },
    { id: 'd', style: null, original_release_date: '2026-08-12' },
    { id: 'e', style: 'Pop', original_release_date: null },
  ],
  catalogStyleBySongId: new Map([['c', 'metal']]),
});
assert.equal(dash.total, 2);
assert.equal(dash.styles.find((s) => s.slug === 'pop')?.months[7], 2);
assert.equal(dash.styles.find((s) => s.slug === 'metal')?.total, 0);
assert.equal(dash.monthTotals[7], 2);
assert.equal(dash.styles[0].label, 'Pop');
assert.equal(dash.styles.find((s) => s.slug === 'metal')?.label, 'metal');

const aprilImportDoesNotInflate = buildAdminRegisteredSongsMonthlyDashboard({
  year: 2026,
  songs: [
    { id: 'imported', style: 'Pop', original_release_date: '1983-05-01' },
    { id: 'new-release', style: 'Pop', original_release_date: '2026-04-12' },
  ],
});
assert.equal(aprilImportDoesNotInflate.total, 1);
assert.equal(aprilImportDoesNotInflate.styles.find((s) => s.slug === 'pop')?.months[3], 1);
assert.equal(aprilImportDoesNotInflate.monthTotals[3], 1);

assert.equal(parseAdminRegisteredSongsMonthlyYear('2024'), 2024);
assert.equal(parseAdminRegisteredSongsMonthlyYear('nope', new Date('2026-09-08T00:00:00+09:00')), 2026);
assert.equal(currentJstYear(new Date('2026-01-01T00:00:00+09:00')), 2026);

console.log('admin-registered-songs-monthly.unit-test: ok');

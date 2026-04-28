import assert from 'node:assert/strict';
import { music8ReleaseYearMonthToPostgresDate } from '@/lib/music8-song-fields';

function run() {
  assert.equal(music8ReleaseYearMonthToPostgresDate('1983.05'), '1983-05-01');
  assert.equal(music8ReleaseYearMonthToPostgresDate('1983-5'), '1983-05-01');
  assert.equal(music8ReleaseYearMonthToPostgresDate('1983-05'), '1983-05-01');
  assert.equal(music8ReleaseYearMonthToPostgresDate('1983'), '1983-01-01');
  assert.equal(music8ReleaseYearMonthToPostgresDate(''), null);
  assert.equal(music8ReleaseYearMonthToPostgresDate('  '), null);
  assert.equal(music8ReleaseYearMonthToPostgresDate('abc'), null);
  assert.equal(music8ReleaseYearMonthToPostgresDate('1983.99'), null);
  assert.equal(music8ReleaseYearMonthToPostgresDate('9999.01'), null);
  console.log('music8-release-date-sql.unit-test: ok');
}

run();

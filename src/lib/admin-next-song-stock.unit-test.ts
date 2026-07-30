import assert from 'node:assert/strict';
import {
  groupAdminNextSongStockRows,
  summarizeAdminNextSongStockRows,
  type AdminNextSongStockRow,
} from '@/lib/admin-next-song-stock';

function row(
  id: string,
  seedVideoId: string,
  createdAt: string,
  artist: string,
  title: string,
  inMcDb: boolean,
  inMusic8: boolean,
  orderIndex = 1,
): AdminNextSongStockRow {
  return {
    id,
    seed_song_id: null,
    seed_video_id: seedVideoId,
    seed_label: `Seed ${seedVideoId}`,
    recommended_artist: artist,
    recommended_title: title,
    reason: 'reason',
    youtube_search_query: `${artist} ${title}`,
    order_index: orderIndex,
    is_active: true,
    created_at: createdAt,
    catalog: {
      inMcDb,
      inMusic8,
      songId: null,
      videoId: null,
      watchUrl: null,
      dbMainArtist: null,
      dbSongTitle: null,
      dbDisplayTitle: null,
    },
  };
}

function run() {
  const rows = [
    row('1', 'aaaaaaaaaaa', '2026-07-29T16:30:00.000Z', 'Artist A', 'Song A', true, false, 2),
    row('2', 'aaaaaaaaaaa', '2026-07-29T16:30:00.000Z', 'Artist B', 'Song B', false, true, 1),
    row('3', 'aaaaaaaaaaa', '2026-07-28T14:00:00.000Z', 'Artist A', 'Song A', true, false),
    row('4', 'bbbbbbbbbbb', '2026-07-30T00:00:00.000Z', 'Artist C', 'Song C', false, false),
  ];

  const groups = groupAdminNextSongStockRows(rows);
  assert.equal(groups.length, 2);
  assert.equal(groups[0]!.seedVideoId, 'bbbbbbbbbbb');
  assert.equal(groups[1]!.seedVideoId, 'aaaaaaaaaaa');
  assert.deepEqual(
    groups[1]!.days.map((day) => day.dateJst),
    ['2026-07-30', '2026-07-28'],
  );
  assert.deepEqual(
    groups[1]!.days[0]!.rows.map((item) => item.order_index),
    [1, 2],
  );

  const summary = summarizeAdminNextSongStockRows(rows);
  assert.equal(summary.seedCount, 2);
  assert.equal(summary.recommendationCount, 4);
  assert.equal(summary.uniqueRecommendationCount, 3);
  assert.equal(summary.libraryTodoCount, 2);
  assert.equal(summary.music8TodoCount, 2);

  console.log('admin-next-song-stock unit tests: OK');
}

run();

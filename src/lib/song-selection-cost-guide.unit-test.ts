import {
  formatSongSelectionBusinessJpyLabel,
  SONG_SELECTION_BUSINESS_MARKUP,
  SONG_SELECTION_COST_SCENARIOS,
} from './song-selection-cost-guide';

const ok =
  SONG_SELECTION_BUSINESS_MARKUP === 1.2 &&
  formatSongSelectionBusinessJpyLabel(1.2) === '約 ¥1.4' &&
  formatSongSelectionBusinessJpyLabel(3, true) === '約 ¥3.6 前後' &&
  SONG_SELECTION_COST_SCENARIOS[0]?.typicalJpyLabel === '約 ¥1.4' &&
  SONG_SELECTION_COST_SCENARIOS[1]?.highJpyLabel === '約 ¥4.8 前後';

if (!ok) {
  console.error('song-selection-cost-guide unit tests: FAILED', {
    participant: SONG_SELECTION_COST_SCENARIOS[0],
    agent: SONG_SELECTION_COST_SCENARIOS[1],
  });
  process.exit(1);
}
console.log('song-selection-cost-guide unit tests: OK');

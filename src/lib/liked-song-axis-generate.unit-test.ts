import assert from 'node:assert/strict';
import { parseLikedSongAxisGenerateJson } from '@/lib/liked-song-axis-generate';

function run() {
  const parsed = parseLikedSongAxisGenerateJson(`{
    "salientAxes": [
      { "id": "mood", "label": "疾走感", "why": "リフ" },
      { "id": "nope", "label": "無視" }
    ],
    "picks": [
      {
        "artist": "Duran Duran",
        "title": "Rio",
        "axis": "artist",
        "polarity": "same",
        "reasonLabel": "同じ人",
        "reason": "同じバンドの別ヒットです。",
        "youtubeSearchQuery": "Duran Duran Rio official",
        "scores": { "artist": 100, "genre": 80, "mood": 70, "vocal": null }
      },
      { "artist": "", "title": "skip" }
    ]
  }`);
  assert.ok(parsed);
  assert.equal(parsed!.salientAxes.length, 1);
  assert.equal(parsed!.salientAxes[0]?.id, 'mood');
  assert.equal(parsed!.picks.length, 1);
  assert.equal(parsed!.picks[0]?.title, 'Rio');
  assert.equal(parsed!.picks[0]?.scores.artist, 100);
  assert.equal(parsed!.picks[0]?.scores.vocal, null);

  const fenced = parseLikedSongAxisGenerateJson(`\`\`\`json
{"picks":[{"artist":"A","title":"B","axis":"genre","polarity":"more_intense","reason":"x","youtubeSearchQuery":"q","scores":{}}]}
\`\`\``);
  assert.ok(fenced && fenced.picks.length === 1);
  assert.equal(fenced!.picks[0]?.polarity, 'more_intense');

  assert.equal(parseLikedSongAxisGenerateJson('not json'), null);

  console.log('liked-song-axis-generate.unit-test: ok');
}

run();

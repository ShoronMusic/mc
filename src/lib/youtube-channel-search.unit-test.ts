import assert from 'node:assert/strict';
import {
  isYoutubeTopicChannelTitle,
  type YoutubeChannelCandidate,
} from '@/lib/youtube-channel-search';

assert.equal(isYoutubeTopicChannelTitle('米津玄師 - Topic'), true);
assert.equal(isYoutubeTopicChannelTitle('Topic'), true);
assert.equal(isYoutubeTopicChannelTitle('米津玄師'), false);

const candidates: YoutubeChannelCandidate[] = [
  {
    channelId: 'UCaaa',
    channelTitle: 'Kenshi Yonezu',
    channelUrl: 'https://www.youtube.com/channel/UCaaa',
    description: null,
  },
  {
    channelId: 'UCbbb',
    channelTitle: '米津玄師',
    channelUrl: 'https://www.youtube.com/channel/UCbbb',
    description: null,
  },
];

// scoring is internal; import via re-search pattern - test topic filter only here
const filtered = candidates.filter((c) => !isYoutubeTopicChannelTitle(c.channelTitle));
assert.equal(filtered.length, 2);

console.log('youtube-channel-search.unit-test: ok');

import {
  findGatheringAtPlayedAt,
  lobbyMapKey,
  resolveAdminRoomDisplayTitle,
  type AdminRoomLabelMaps,
  type GatheringRowForAdminRoomLabel,
} from './admin-room-display-label';
import { PRODUCT_MA, PRODUCT_MC } from './product-mode';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const gatherings: GatheringRowForAdminRoomLabel[] = [
  {
    room_id: '01',
    title: '音楽チャット開発',
    product: PRODUCT_MC,
    started_at: '2026-07-08T01:00:00.000Z',
    ended_at: null,
    status: 'live',
  },
  {
    room_id: '01',
    title: '洋楽愛好の集い',
    product: PRODUCT_MA,
    started_at: '2026-06-01T01:00:00.000Z',
    ended_at: '2026-06-30T23:59:59.000Z',
    status: 'ended',
  },
];

const maps: AdminRoomLabelMaps = {
  lobbyByRoomProduct: new Map([
    [lobbyMapKey(PRODUCT_MA, '01'), '洋楽愛好の集い'],
    [lobbyMapKey(PRODUCT_MC, '01'), ''],
  ]),
  gatherings,
};

const hit = findGatheringAtPlayedAt(gatherings, '01', '2026-07-08T02:13:45.000Z');
assert(hit?.title === '音楽チャット開発', 'mc gathering at play time');

const staleMaOverlap: GatheringRowForAdminRoomLabel[] = [
  {
    room_id: '01',
    title: '洋楽愛好の集い',
    product: PRODUCT_MA,
    started_at: '2020-01-01T00:00:00.000Z',
    ended_at: null,
    status: 'live',
  },
  {
    room_id: '01',
    title: '音楽チャット開発',
    product: PRODUCT_MC,
    started_at: '2026-07-08T01:00:00.000Z',
    ended_at: null,
    status: 'live',
  },
];
const recentMc = findGatheringAtPlayedAt(staleMaOverlap, '01', '2026-07-08T02:13:45.000Z');
assert(recentMc?.title === '音楽チャット開発', 'prefer most recently started gathering');

assert(
  resolveAdminRoomDisplayTitle(maps, '01', '2026-07-08T02:13:45.000Z') === '音楽チャット開発',
  'display title prefers gathering',
);

assert(
  resolveAdminRoomDisplayTitle(maps, '01', '2026-06-15T12:00:00.000Z') === '洋楽愛好の集い',
  'ma gathering in june',
);

console.log('admin-room-display-label.unit-test.ts: ok');

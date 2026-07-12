import {
  buildLegacyRoomAccessLogDedupeKey,
  buildRoomAccessLogDedupeKey,
  normalizeRoomHistoryProduct,
  parseAdminProductFilter,
  productShortLabel,
} from './room-history-product';
import { PRODUCT_MA, PRODUCT_MC } from './product-mode';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(normalizeRoomHistoryProduct('musicchat') === PRODUCT_MC, 'mc normalize');
assert(parseAdminProductFilter('mc') === PRODUCT_MC, 'parse mc');
assert(parseAdminProductFilter(null) === 'all', 'parse all default');
assert(productShortLabel(PRODUCT_MA) === 'ma', 'label ma');

const dedupe = buildRoomAccessLogDedupeKey({
  product: PRODUCT_MC,
  roomId: '01',
  ymd: '2026-07-08',
  sessionUserId: 'abc',
});
assert(dedupe.startsWith('musicchat|01|'), 'dedupe has product prefix');

const legacy = buildLegacyRoomAccessLogDedupeKey({
  roomId: '01',
  ymd: '2026-07-08',
  sessionUserId: 'abc',
});
assert(!legacy.startsWith('musicchat|'), 'legacy no product');

console.log('room-history-product.unit-test.ts: ok');

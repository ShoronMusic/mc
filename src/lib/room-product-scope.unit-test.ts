import {
  getAblyRoomChannelName,
  getGatheringProductId,
  getRoomProductScopedStorageKey,
  isMissingProductColumnError,
} from './room-product-scope';

function withProduct(value: string | undefined, fn: () => void) {
  const prev = process.env.NEXT_PUBLIC_PRODUCT;
  if (value === undefined) delete process.env.NEXT_PUBLIC_PRODUCT;
  else process.env.NEXT_PUBLIC_PRODUCT = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_PRODUCT;
    else process.env.NEXT_PUBLIC_PRODUCT = prev;
  }
}

withProduct('musicaichat', () => {
  if (getGatheringProductId() !== 'musicaichat') throw new Error('ma product');
  if (getAblyRoomChannelName('02') !== 'musicaichat:room:02') throw new Error('ma channel');
});

withProduct('musicchat', () => {
  if (getGatheringProductId() !== 'musicchat') throw new Error('mc product');
  if (getAblyRoomChannelName('09') !== 'musicchat:room:09') throw new Error('mc channel');
  if (getRoomProductScopedStorageKey('mc:last_room_enter_v1:') !== 'mc:last_room_enter_v1:musicchat') {
    throw new Error('mc enter resume key');
  }
  if (getRoomProductScopedStorageKey('mc:room_session_claim:', '02') !== 'mc:room_session_claim:musicchat:02') {
    throw new Error('mc session claim key');
  }
});

withProduct('musicaichat', () => {
  if (getRoomProductScopedStorageKey('mc:last_exit:', '01') !== 'mc:last_exit:musicaichat:01') {
    throw new Error('ma last exit key');
  }
});

if (!isMissingProductColumnError({ code: '42703', message: 'column product does not exist' })) {
  throw new Error('42703 product');
}

console.log('room-product-scope.unit-test.ts: ok');

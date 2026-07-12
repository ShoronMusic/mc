import {
  getProductId,
  isMaProduct,
  isMcBlockedPath,
  isMcGeminiDisabled,
  isMcProduct,
  PRODUCT_MA,
  PRODUCT_MC,
} from './product-mode';

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

withProduct(undefined, () => {
  if (getProductId() !== PRODUCT_MA) throw new Error('default should be ma');
  if (!isMaProduct() || isMcProduct()) throw new Error('default should be ma');
});

withProduct('musicaichat', () => {
  if (!isMaProduct()) throw new Error('musicaichat => ma');
  if (isMcGeminiDisabled()) throw new Error('ma allows gemini gate');
});

withProduct('musicchat', () => {
  if (!isMcProduct()) throw new Error('musicchat => mc');
  if (!isMcGeminiDisabled()) throw new Error('mc gemini disabled');
  if (!isMcBlockedPath('/api/ai/chat')) throw new Error('ai chat blocked');
  if (!isMcBlockedPath('/admin/gathering-history')) throw new Error('admin blocked');
  if (isMcBlockedPath('/api/my-list')) throw new Error('my-list allowed');
});

console.log('product-mode.unit-test.ts: ok');

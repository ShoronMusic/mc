import { IS_MC_PRODUCT } from '@/lib/product-branding';

/** 選曲アナウンス API（mc は `/api/ai/*` ブロックを避けて room 配下） */
export function getAnnounceSongApiPath(): string {
  return IS_MC_PRODUCT ? '/api/room/announce-song' : '/api/ai/announce-song';
}

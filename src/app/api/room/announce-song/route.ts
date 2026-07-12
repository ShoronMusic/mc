import { handleAnnounceSongPost } from '@/lib/room-announce-song-server';

export const dynamic = 'force-dynamic';

/** mc 向け選曲アナウンス（Gemini 不使用・`/api/ai/*` ブロック外） */
export async function POST(request: Request) {
  return handleAnnounceSongPost(request, 'room/announce-song');
}

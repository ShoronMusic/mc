import { handleAnnounceSongPost } from '@/lib/room-announce-song-server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleAnnounceSongPost(request, 'ai/announce-song');
}

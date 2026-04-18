import { JoinGate } from '@/components/auth/JoinGate';

/** 静的パス収集・不完全キャッシュ起因の不整合を避け、部屋は常に動的レンダリング */
export const dynamic = 'force-dynamic';

interface RoomPageProps {
  params: { roomId: string };
}

export default function RoomPage({ params }: RoomPageProps) {
  return <JoinGate roomId={params.roomId} />;
}

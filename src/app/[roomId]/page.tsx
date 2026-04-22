import nextDynamic from 'next/dynamic';

const JoinGate = nextDynamic(() => import('@/components/auth/JoinGate'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-gray-950">
      <p className="text-gray-400">読み込み中…</p>
    </div>
  ),
});

/** 静的パス収集・不完全キャッシュ起因の不整合を避け、部屋は常に動的レンダリング */
export const dynamic = 'force-dynamic';

interface RoomPageProps {
  params: { roomId: string };
}

export default function RoomPage({ params }: RoomPageProps) {
  return <JoinGate roomId={params.roomId} />;
}

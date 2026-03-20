import { JoinGate } from '@/components/auth/JoinGate';

interface RoomPageProps {
  params: { roomId: string };
}

export default function RoomPage({ params }: RoomPageProps) {
  return <JoinGate roomId={params.roomId} />;
}

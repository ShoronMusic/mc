import type { Metadata } from 'next';
import Link from 'next/link';
import { HomeRoomLinks } from '@/components/home/HomeRoomLinks';

export const metadata: Metadata = {
  title: '開催中の部屋一覧 | 洋楽AIチャット（β版）',
  description: 'いま参加者がいる部屋の一覧です。状況の確認用です。',
};

type LiveRoomsPageProps = {
  searchParams?: {
    modal?: string | string[];
  };
};

export default function LiveRoomsPage({ searchParams }: LiveRoomsPageProps) {
  const isModal =
    (Array.isArray(searchParams?.modal) ? searchParams?.modal[0] : searchParams?.modal) === '1';

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {!isModal ? (
        <header className="border-b border-gray-800 bg-gray-900/50">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="text-sm text-gray-300 transition hover:text-white">
              ← トップへ
            </Link>
          </div>
        </header>
      ) : null}

      <main className="mx-auto max-w-lg px-4 py-6">
        <header className="mb-4 space-y-2">
          <h1 className="text-xl font-bold text-white">開催中の部屋一覧</h1>
          <p className="text-sm leading-relaxed text-gray-300">
            {isModal
              ? 'いま開催中の会の状況だけを表示しています。別の部屋に入室する場合は、この案内を閉じてから退室してトップへお戻りください。'
              : 'いま参加者がいる部屋です。入室する場合は部屋名を選んでください。'}
          </p>
        </header>
        <HomeRoomLinks viewOnly={isModal} />
      </main>
    </div>
  );
}

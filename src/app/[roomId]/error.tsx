'use client';

/**
 * 部屋ページ（/02 等）で RSC/SSR またはクライアント起動時に例外が出たときのフォールバック。
 * digest 付き 500 の多くは .next の不完全ビルドや HMR 不整合が原因のことがある。
 */
export default function RoomSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const digest = typeof error?.digest === 'string' ? error.digest : '';
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 p-6 text-center">
      <h1 className="text-lg font-semibold text-rose-200">部屋の表示でエラーが発生しました</h1>
      <p className="max-w-md text-sm leading-relaxed text-gray-400">
        開発中は Next のキャッシュ不整合で一時的に起きることがあります。ターミナルで dev サーバーを止め、プロジェクト直下の{' '}
        <code className="rounded bg-gray-800 px-1 text-gray-200">.next</code> フォルダを削除してから{' '}
        <code className="rounded bg-gray-800 px-1 text-gray-200">npm run dev</code> を再起動してください。
      </p>
      {digest ? (
        <p className="font-mono text-[11px] text-gray-600">
          digest: <span className="text-gray-500">{digest}</span>
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => reset()}
        className="rounded border border-gray-600 bg-gray-800 px-4 py-2 text-sm text-gray-100 hover:bg-gray-700"
      >
        再試行
      </button>
    </div>
  );
}

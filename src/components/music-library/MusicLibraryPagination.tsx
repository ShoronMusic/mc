import Link from 'next/link';
import { isMcProduct } from '@/lib/product-mode';

export function MusicLibraryPagination({
  page,
  totalPages,
  hrefForPage,
}: {
  page: number;
  totalPages: number;
  hrefForPage: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  const mc = isMcProduct();
  const pages: number[] = [];
  const start = Math.max(1, page - 3);
  const end = Math.min(totalPages, page + 3);
  for (let n = start; n <= end; n += 1) pages.push(n);
  const linkClass = (active: boolean) =>
    active
      ? mc
        ? 'rounded bg-gray-900 px-2.5 py-1 text-sm text-white'
        : 'rounded bg-amber-400/90 px-2.5 py-1 text-sm text-gray-950'
      : mc
        ? 'rounded px-2.5 py-1 text-sm text-gray-600 hover:text-gray-900'
        : 'rounded px-2.5 py-1 text-sm text-gray-300 hover:text-white';

  return (
    <nav className="mt-8 flex flex-wrap items-center justify-center gap-1" aria-label="ページ">
      {page > 1 ? (
        <Link href={hrefForPage(page - 1)} className={linkClass(false)}>
          前へ
        </Link>
      ) : null}
      {start > 1 ? (
        <Link href={hrefForPage(1)} className={linkClass(false)}>
          1
        </Link>
      ) : null}
      {start > 2 ? <span className="px-1 text-gray-500">…</span> : null}
      {pages.map((n) => (
        <Link key={n} href={hrefForPage(n)} className={linkClass(n === page)} aria-current={n === page ? 'page' : undefined}>
          {n}
        </Link>
      ))}
      {end < totalPages - 1 ? <span className="px-1 text-gray-500">…</span> : null}
      {end < totalPages ? (
        <Link href={hrefForPage(totalPages)} className={linkClass(false)}>
          {totalPages}
        </Link>
      ) : null}
      {page < totalPages ? (
        <Link href={hrefForPage(page + 1)} className={linkClass(false)}>
          次へ
        </Link>
      ) : null}
    </nav>
  );
}

'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { GUIDE_SECTIONS } from '@/lib/guide-nav';
import { getSafeInternalReturnPath } from '@/lib/safe-return-path';

function guideLinkHref(href: string, returnSegment: string | null): string {
  if (!returnSegment || !href.startsWith('/guide')) return href;
  return `${href}?returnTo=${encodeURIComponent(returnSegment)}`;
}

function GuideSidebarInner({ returnSegment }: { returnSegment: string | null }) {
  const pathname = usePathname();

  return (
    <nav
      className="rounded-xl border border-gray-700 bg-gray-900/80 p-4 md:sticky md:top-6"
      aria-label="ガイド目次"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
        ご利用上の注意
      </p>
      <ul className="space-y-1 text-sm">
        {GUIDE_SECTIONS.map((item) => {
          const active = pathname === item.href;
          const href =
            item.href.startsWith('/guide') && returnSegment
              ? guideLinkHref(item.href, returnSegment)
              : item.href;
          return (
            <li key={item.href}>
              <Link
                href={href}
                className={`block rounded-lg px-3 py-2 transition ${
                  active
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <span className="font-medium">{item.title}</span>
                {item.slug ? (
                  <span className="mt-0.5 block text-xs font-normal text-gray-500">
                    {item.short}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function GuideSidebarWithSearchParams() {
  const searchParams = useSearchParams();
  const back = getSafeInternalReturnPath(searchParams.get('returnTo'));
  const returnSegment = back ? back.slice(1) : null;
  return <GuideSidebarInner returnSegment={returnSegment} />;
}

export function GuideSidebar() {
  return (
    <Suspense fallback={<GuideSidebarInner returnSegment={null} />}>
      <GuideSidebarWithSearchParams />
    </Suspense>
  );
}

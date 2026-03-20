'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GUIDE_SECTIONS } from '@/lib/guide-nav';

export function GuideSidebar() {
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
          return (
            <li key={item.href}>
              <Link
                href={item.href}
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

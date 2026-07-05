import Link from 'next/link';
import {
  SITE_MAP_INTRO,
  SITE_MAP_RELATED_LINKS,
  SITE_MAP_SECTIONS,
} from '@/lib/site-map';
import { sitemapItemLinkProps, shouldBreakOutOfPolicyModalIframe } from '@/lib/policy-modal-link';
import { LIVE_ROOMS_PREVIEW_PATH } from '@/lib/site-map';

type SiteMapIndexProps = {
  policyModal?: boolean;
};

export function SiteMapIndex({ policyModal = false }: SiteMapIndexProps) {
  return (
    <div className="space-y-8 text-sm leading-relaxed text-gray-300">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Music AI Chat</p>
        <h1 className="text-2xl font-bold text-white">{SITE_MAP_INTRO.title}</h1>
        <p className="text-gray-300">{SITE_MAP_INTRO.lead}</p>
      </header>

      {SITE_MAP_SECTIONS.map((section) => (
        <section key={section.id} className="space-y-3" aria-labelledby={`sitemap-${section.id}`}>
          <div>
            <h2 id={`sitemap-${section.id}`} className="text-lg font-semibold text-white">
              {section.title}
            </h2>
            {section.lead ? <p className="mt-1 text-sm text-gray-400">{section.lead}</p> : null}
          </div>
          <ul className="divide-y divide-gray-800 overflow-hidden rounded-xl border border-gray-800 bg-gray-900/30">
            {section.items.map((item) => {
              const link = sitemapItemLinkProps(item.href, policyModal);
              const isLiveRoomsPreview = policyModal && item.href === '/';
              const breaksOut = policyModal && shouldBreakOutOfPolicyModalIframe(item.href);
              return (
              <li key={`${section.id}-${item.href}-${item.label}`} className="px-4 py-3.5">
                <Link
                  href={link.href}
                  target={link.target}
                  className="font-medium text-amber-400/95 underline-offset-2 hover:text-amber-300 hover:underline"
                >
                  {item.label}
                </Link>
                <p className="mt-1 text-sm text-gray-300">{item.description}</p>
                {isLiveRoomsPreview ? (
                  <p className="mt-1 text-xs text-gray-400">
                    モーダル内で開催状況だけを表示します（入室はしません）。
                  </p>
                ) : breaksOut ? (
                  <p className="mt-1 text-xs text-gray-400">部屋の画面を出て、通常のページで開きます。</p>
                ) : null}
                <p className="mt-1 font-mono text-[11px] text-gray-500">
                  {isLiveRoomsPreview ? LIVE_ROOMS_PREVIEW_PATH : item.href}
                </p>
              </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section
        className="rounded-xl border border-gray-800 bg-gray-900/40 p-4"
        aria-labelledby="sitemap-quick"
      >
        <h2 id="sitemap-quick" className="text-base font-semibold text-white">
          よく使うページ
        </h2>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {SITE_MAP_RELATED_LINKS.map((link) => {
            const props = sitemapItemLinkProps(link.href, policyModal);
            return (
            <li key={link.href}>
              <Link
                href={props.href}
                target={props.target}
                className="text-amber-400/90 underline-offset-2 hover:underline"
              >
                {link.label}
              </Link>
            </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

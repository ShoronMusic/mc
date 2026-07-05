import Link from 'next/link';
import {
  SERVICE_CATALOG_INTRO,
  SERVICE_CATALOG_PRICING_LABELS,
  SERVICE_CATALOG_RELATED_LINKS,
  SERVICE_CATALOG_SECTIONS,
  SERVICE_CATALOG_SUMMARY,
  type ServiceCatalogPricing,
} from '@/lib/service-catalog';
import { withPolicyModalQuery } from '@/lib/policy-modal-link';

type ServiceCatalogProps = {
  policyModal?: boolean;
};

function hrefForModal(href: string, policyModal: boolean): string {
  return withPolicyModalQuery(href, policyModal);
}

function PricingBadge({ pricing }: { pricing: ServiceCatalogPricing }) {
  const label = SERVICE_CATALOG_PRICING_LABELS[pricing];
  const tone =
    pricing === 'free'
      ? 'border-emerald-800/50 bg-emerald-950/40 text-emerald-200'
      : pricing === 'credits'
        ? 'border-violet-800/50 bg-violet-950/40 text-violet-200'
        : pricing === 'site'
          ? 'border-sky-800/50 bg-sky-950/40 text-sky-200'
          : pricing === 'login'
            ? 'border-amber-800/50 bg-amber-950/40 text-amber-200'
            : 'border-gray-600 bg-gray-800/80 text-gray-300';

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border px-2 py-0.5 text-[11px] font-medium leading-none ${tone}`}
    >
      {label}
    </span>
  );
}

export function ServiceCatalog({ policyModal = false }: ServiceCatalogProps) {
  return (
    <div className="space-y-8 text-sm leading-relaxed text-gray-300">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Music AI Chat</p>
        <h1 className="text-2xl font-bold text-white">{SERVICE_CATALOG_INTRO.title}</h1>
        <p className="text-gray-400">{SERVICE_CATALOG_INTRO.lead}</p>
      </header>

      <section aria-label="料金区分の概要">
        <ul className="grid gap-3 sm:grid-cols-3">
          {SERVICE_CATALOG_SUMMARY.map((item) => (
            <li
              key={item.pricing}
              className="rounded-xl border border-gray-800 bg-gray-900/50 p-4"
            >
              <div className="mb-2">
                <PricingBadge pricing={item.pricing} />
              </div>
              <h2 className="font-semibold text-white">{item.title}</h2>
              <p className="mt-2 text-sm text-gray-400">{item.description}</p>
            </li>
          ))}
        </ul>
      </section>

      {SERVICE_CATALOG_SECTIONS.map((section) => (
        <section key={section.id} className="space-y-3" aria-labelledby={`catalog-${section.id}`}>
          <div>
            <h2 id={`catalog-${section.id}`} className="text-lg font-semibold text-white">
              {section.title}
            </h2>
            <p className="mt-1 text-sm text-gray-500">{section.lead}</p>
          </div>
          <ul className="divide-y divide-gray-800 overflow-hidden rounded-xl border border-gray-800 bg-gray-900/30">
            {section.items.map((item) => (
              <li
                key={item.name}
                className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-gray-100">{item.name}</h3>
                    <PricingBadge pricing={item.pricing} />
                  </div>
                  <p className="mt-1.5 text-sm text-gray-400">{item.summary}</p>
                  {item.href ? (
                    <p className="mt-2">
                      <Link
                        href={hrefForModal(item.href, policyModal)}
                        className="text-sm text-amber-400/90 underline-offset-2 hover:underline"
                      >
                        {item.hrefLabel ?? '詳しく'} →
                      </Link>
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section
        className="rounded-xl border border-gray-800 bg-gray-900/40 p-4"
        aria-labelledby="catalog-related"
      >
        <h2 id="catalog-related" className="text-base font-semibold text-white">
          関連ページ
        </h2>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {SERVICE_CATALOG_RELATED_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={hrefForModal(link.href, policyModal)}
                className="text-amber-400/90 underline-offset-2 hover:underline"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

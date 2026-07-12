'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { PolicyDocsModal, type PolicyDocsTab } from '@/components/legal/PolicyDocsModal';
import { SiteGuideModal, type SiteGuideTab } from '@/components/site/SiteGuideModal';
import { PwaInstallHelpLink } from '@/components/pwa/PwaInstallHelpLink';
import { SisterSiteAccountNote } from '@/components/home/SisterSiteAccountNote';
import { IS_MC_PRODUCT } from '@/lib/product-branding';

type StartPageFooterProps = {
  /** ログイン後トップなど：リンクの代わりにモーダルで開く */
  usePolicyModal?: boolean;
};

function FooterLinkButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="underline-offset-2 hover:text-gray-300 hover:underline"
    >
      {children}
    </button>
  );
}

export function StartPageFooter({ usePolicyModal = false }: StartPageFooterProps) {
  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [policyModalTab, setPolicyModalTab] = useState<PolicyDocsTab>('guide');
  const [siteGuideModalOpen, setSiteGuideModalOpen] = useState(false);
  const [siteGuideModalTab, setSiteGuideModalTab] = useState<SiteGuideTab>('enjoy');

  const openPolicyModal = (tab: PolicyDocsTab) => {
    setPolicyModalTab(tab);
    setPolicyModalOpen(true);
  };

  const openSiteGuideModal = (tab: SiteGuideTab) => {
    setSiteGuideModalTab(tab);
    setSiteGuideModalOpen(true);
  };

  return (
    <>
      <p className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-gray-500 lg:justify-start lg:text-left">
        {usePolicyModal ? (
          <FooterLinkButton onClick={() => openSiteGuideModal('enjoy')}>楽しみ方</FooterLinkButton>
        ) : (
          <Link href="/guide/enjoy" className="underline-offset-2 hover:text-gray-300 hover:underline">
            楽しみ方
          </Link>
        )}
        <span aria-hidden className="text-gray-600">
          |
        </span>
        {usePolicyModal ? (
          <FooterLinkButton onClick={() => openSiteGuideModal('sitemap')}>サイトマップ</FooterLinkButton>
        ) : (
          <Link href="/sitemap" className="underline-offset-2 hover:text-gray-300 hover:underline">
            サイトマップ
          </Link>
        )}
        <span aria-hidden className="text-gray-600">
          |
        </span>
        {usePolicyModal ? (
          <FooterLinkButton onClick={() => openSiteGuideModal('services')}>サービス一覧</FooterLinkButton>
        ) : (
          <Link href="/services" className="underline-offset-2 hover:text-gray-300 hover:underline">
            サービス一覧
          </Link>
        )}
        <span aria-hidden className="text-gray-600">
          |
        </span>
        {usePolicyModal ? (
          <FooterLinkButton onClick={() => openPolicyModal('guide')}>ご利用上の注意</FooterLinkButton>
        ) : (
          <Link href="/guide" className="underline-offset-2 hover:text-gray-300 hover:underline">
            ご利用上の注意
          </Link>
        )}
        <span aria-hidden className="text-gray-600">
          |
        </span>
        {usePolicyModal ? (
          <FooterLinkButton onClick={() => openPolicyModal('terms')}>利用規約</FooterLinkButton>
        ) : (
          <Link href="/terms" className="underline-offset-2 hover:text-gray-300 hover:underline">
            利用規約
          </Link>
        )}
        <span aria-hidden className="text-gray-600">
          |
        </span>
        {usePolicyModal ? (
          <FooterLinkButton onClick={() => openPolicyModal('privacy')}>プライバシー</FooterLinkButton>
        ) : (
          <Link href="/privacy" className="underline-offset-2 hover:text-gray-300 hover:underline">
            プライバシー
          </Link>
        )}
        {IS_MC_PRODUCT ? null : (
          <>
            <span aria-hidden className="text-gray-600">
              |
            </span>
            <Link
              href="/guide/ai-pricing"
              className="underline-offset-2 hover:text-gray-300 hover:underline"
            >
              AI利用料金
            </Link>
          </>
        )}
        <span aria-hidden className="text-gray-600">
          |
        </span>
        <Link
          href="/commercial-transactions"
          className="underline-offset-2 hover:text-gray-300 hover:underline"
        >
          特定商取引法に基づく表示
        </Link>
      </p>
      <div className="mt-3 max-w-xl">
        <SisterSiteAccountNote variant="compact" />
      </div>
      <PwaInstallHelpLink />
      <p className="mt-3 text-center text-[11px] text-gray-600 lg:text-left">
        スマホ・PC どちらからでもご利用いただけます
      </p>
      {usePolicyModal ? (
        <>
          <SiteGuideModal
            open={siteGuideModalOpen}
            onClose={() => setSiteGuideModalOpen(false)}
            initialTab={siteGuideModalTab}
          />
          <PolicyDocsModal
            open={policyModalOpen}
            onClose={() => setPolicyModalOpen(false)}
            initialTab={policyModalTab}
          />
        </>
      ) : null}
    </>
  );
}

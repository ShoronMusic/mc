'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { PolicyDocsModal, type PolicyDocsTab } from '@/components/legal/PolicyDocsModal';
import { PwaInstallHelpLink } from '@/components/pwa/PwaInstallHelpLink';

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
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<PolicyDocsTab>('enjoy');

  const openModal = (tab: PolicyDocsTab) => {
    setModalTab(tab);
    setModalOpen(true);
  };

  return (
    <>
      <p className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-gray-500 lg:justify-start lg:text-left">
        {usePolicyModal ? (
          <FooterLinkButton onClick={() => openModal('enjoy')}>楽しみ方</FooterLinkButton>
        ) : (
          <Link href="/guide/enjoy" className="underline-offset-2 hover:text-gray-300 hover:underline">
            楽しみ方
          </Link>
        )}
        <span aria-hidden className="text-gray-600">
          |
        </span>
        {usePolicyModal ? (
          <FooterLinkButton onClick={() => openModal('guide')}>ご利用上の注意</FooterLinkButton>
        ) : (
          <Link href="/guide" className="underline-offset-2 hover:text-gray-300 hover:underline">
            ご利用上の注意
          </Link>
        )}
        <span aria-hidden className="text-gray-600">
          |
        </span>
        {usePolicyModal ? (
          <FooterLinkButton onClick={() => openModal('terms')}>利用規約</FooterLinkButton>
        ) : (
          <Link href="/terms" className="underline-offset-2 hover:text-gray-300 hover:underline">
            利用規約
          </Link>
        )}
      </p>
      <PwaInstallHelpLink />
      <p className="mt-3 text-center text-[11px] text-gray-600 lg:text-left">
        スマホ・PC どちらからでもご利用いただけます
      </p>
      {usePolicyModal ? (
        <PolicyDocsModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          initialTab={modalTab}
        />
      ) : null}
    </>
  );
}

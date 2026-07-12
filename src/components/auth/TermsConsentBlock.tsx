'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { writeTermsAccepted } from '@/lib/terms-consent';
import { IS_MC_PRODUCT } from '@/lib/product-branding';

interface TermsConsentBlockProps {
  /** 同意後の遷移先（同一オリジン・検証済みパス） */
  nextPath: string;
}

export function TermsConsentBlock({ nextPath }: TermsConsentBlockProps) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleProceed = useCallback(() => {
    if (!agreed) return;
    writeTermsAccepted();
    router.push(nextPath);
  }, [agreed, nextPath, router]);

  const footer = IS_MC_PRODUCT
    ? 'border-t border-gray-200 bg-white p-4'
    : 'border-t border-gray-700 bg-gray-900/95 p-4';
  const hint = IS_MC_PRODUCT
    ? 'mb-3 text-xs leading-relaxed text-gray-500'
    : 'mb-3 text-xs leading-relaxed text-gray-500';
  const link = IS_MC_PRODUCT
    ? 'text-emerald-700 underline-offset-2 hover:underline'
    : 'text-amber-400/90 underline-offset-2 hover:underline';
  const label = IS_MC_PRODUCT
    ? 'flex cursor-pointer items-start gap-3 text-sm text-gray-800'
    : 'flex cursor-pointer items-start gap-3 text-sm text-gray-300';
  const checkbox = IS_MC_PRODUCT
    ? 'mt-1 h-4 w-4 shrink-0 rounded border-gray-300 bg-white text-emerald-600 focus:ring-emerald-500'
    : 'mt-1 h-4 w-4 shrink-0 rounded border-gray-600 bg-gray-800 text-amber-600 focus:ring-amber-500';
  const backBtn = IS_MC_PRODUCT
    ? 'rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50'
    : 'rounded-lg border border-gray-600 px-4 py-2.5 text-sm font-medium text-gray-200 transition hover:bg-gray-800';
  const proceedBtn = IS_MC_PRODUCT
    ? 'rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-emerald-600'
    : 'rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-amber-600';

  return (
    <div className={footer}>
      <p className={hint}>
        本サービスは、初回アクセス時から Cookie 等により利用状況を分析することがあります（部屋入室前の規約同意とは別枠です）。詳細は{' '}
        <Link href="/privacy" className={link}>
          プライバシーポリシー
        </Link>
        （Cookie および端末内保存・外部送信）をご確認ください。
      </p>
      <label className={label}>
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className={checkbox}
        />
        <span>上記の内容を読み、同意します</span>
      </label>
      <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={handleBack} className={backBtn}>
          戻る
        </button>
        <button type="button" disabled={!agreed} onClick={handleProceed} className={proceedBtn}>
          進める
        </button>
      </div>
    </div>
  );
}

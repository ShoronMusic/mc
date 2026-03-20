'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { writeTermsAccepted } from '@/lib/terms-consent';

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

  return (
    <div className="border-t border-gray-700 bg-gray-900/95 p-4">
      <label className="flex cursor-pointer items-start gap-3 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 rounded border-gray-600 bg-gray-800 text-amber-600 focus:ring-amber-500"
        />
        <span>上記の内容を読み、同意します</span>
      </label>
      <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={handleBack}
          className="rounded-lg border border-gray-600 px-4 py-2.5 text-sm font-medium text-gray-200 transition hover:bg-gray-800"
        >
          戻る
        </button>
        <button
          type="button"
          disabled={!agreed}
          onClick={handleProceed}
          className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-amber-600"
        >
          進める
        </button>
      </div>
    </div>
  );
}

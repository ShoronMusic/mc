'use client';

import {
  getSisterSiteAccountNote,
  getSisterSiteNameJa,
  getSisterSiteOrigin,
  IS_MC_PRODUCT,
} from '@/lib/product-branding';

type SisterSiteAccountNoteProps = {
  className?: string;
  /** compact=1段落 / default=lead+account */
  variant?: 'default' | 'compact';
};

/** トップ・同意画面など：姉妹サイトと同一アカウント案内 */
export function SisterSiteAccountNote({
  className = '',
  variant = 'default',
}: SisterSiteAccountNoteProps) {
  const { lead, account } = getSisterSiteAccountNote();
  const sisterName = getSisterSiteNameJa();
  const sisterOrigin = getSisterSiteOrigin();

  const box = IS_MC_PRODUCT
    ? 'rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs leading-relaxed text-gray-700 shadow-sm'
    : 'rounded-lg border border-gray-700 bg-gray-900/50 px-3 py-2.5 text-xs leading-relaxed text-gray-300';
  const link = IS_MC_PRODUCT
    ? 'font-medium text-gray-900 underline underline-offset-2 hover:text-black'
    : 'font-medium text-sky-300 underline underline-offset-2 hover:text-sky-200';
  const muted = IS_MC_PRODUCT ? 'text-gray-600' : 'text-gray-400';

  if (variant === 'compact') {
    return (
      <p className={`${muted} ${className}`.trim()} role="note">
        姉妹サイトの{' '}
        <a href={sisterOrigin} className={link} target="_blank" rel="noopener noreferrer">
          {sisterName}
        </a>
        {' '}
        と同じ Google アカウント（または同じメール）で利用でき、マイリストなども共通です。両方を同時に開いて使うこともできます。
      </p>
    );
  }

  return (
    <div className={`${box} ${className}`.trim()} role="note">
      <p>
        {lead}{' '}
        <a href={sisterOrigin} className={link} target="_blank" rel="noopener noreferrer">
          {sisterName}
        </a>
      </p>
      <p className={`mt-1.5 ${muted}`}>{account}</p>
    </div>
  );
}

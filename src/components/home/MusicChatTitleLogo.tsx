'use client';

import Image from 'next/image';
import { MUSICCHAT_TITLE_LOGO_SRC, getRoomServiceTagline } from '@/lib/product-branding';

type MusicChatTitleLogoVariant = 'header' | 'title';

const VARIANTS: Record<
  MusicChatTitleLogoVariant,
  { width: number; height: number; className: string }
> = {
  header: {
    width: 40,
    height: 40,
    className: 'h-10 w-10 shrink-0 object-contain object-left',
  },
  title: {
    width: 120,
    height: 120,
    className: 'h-24 w-24 shrink-0 object-contain lg:h-20 lg:w-20',
  },
};

type MusicChatTitleLogoProps = {
  variant?: MusicChatTitleLogoVariant;
  className?: string;
  priority?: boolean;
};

/** mc 用タイトルロゴ（部屋ヘッダー・トップ等） */
export function MusicChatTitleLogo({
  variant = 'header',
  className = '',
  priority = variant === 'header',
}: MusicChatTitleLogoProps) {
  const size = VARIANTS[variant];
  return (
    <Image
      src={MUSICCHAT_TITLE_LOGO_SRC}
      alt="Music Chat"
      width={size.width}
      height={size.height}
      className={`${size.className} ${className}`.trim()}
      priority={priority}
    />
  );
}

type MusicChatTitleBrandProps = {
  variant?: MusicChatTitleLogoVariant;
  className?: string;
  labelClassName?: string;
  taglineClassName?: string;
  logoClassName?: string;
};

/** ロゴ + 「ミュージックチャット」+ キャッチフレーズ（トップ・参加方法選択等） */
export function MusicChatTitleBrand({
  variant = 'title',
  className = '',
  labelClassName = '',
  taglineClassName = '',
  logoClassName = '',
}: MusicChatTitleBrandProps) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`.trim()}>
      <MusicChatTitleLogo variant={variant} className={logoClassName} priority />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span
          className={`text-xl font-bold leading-tight tracking-tight text-gray-900 sm:text-2xl ${labelClassName}`.trim()}
        >
          ミュージックチャット
        </span>
        <span
          className={`text-sm leading-snug text-gray-600 sm:text-base ${taglineClassName}`.trim()}
        >
          {getRoomServiceTagline()}
        </span>
      </span>
    </span>
  );
}

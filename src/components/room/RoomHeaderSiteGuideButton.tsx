'use client';

import { Squares2X2Icon, StarIcon } from '@heroicons/react/24/outline';
import { SiteTreeOutlineIcon } from '@/components/icons/SiteTreeOutlineIcon';
import { roomHeaderActionBtnClass, roomHeaderMenuItemClass } from '@/lib/product-branding';
import { SITE_GUIDE_TAB_LABELS, type SiteGuideTab } from '@/lib/site-guide-modal';

function tabIcon(tab: SiteGuideTab) {
  switch (tab) {
    case 'enjoy':
      return StarIcon;
    case 'sitemap':
      return SiteTreeOutlineIcon;
    default:
      return Squares2X2Icon;
  }
}

type RoomHeaderSiteGuideButtonProps = {
  tab: SiteGuideTab;
  variant?: 'header' | 'menu-item';
  onNavigate?: () => void;
  onOpen: (tab: SiteGuideTab) => void;
};

export function RoomHeaderSiteGuideButton({
  tab,
  variant = 'header',
  onNavigate,
  onOpen,
}: RoomHeaderSiteGuideButtonProps) {
  const label = SITE_GUIDE_TAB_LABELS[tab];
  const Icon = tabIcon(tab);

  const handleOpen = () => {
    onNavigate?.();
    onOpen(tab);
  };

  if (variant === 'menu-item') {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className={roomHeaderMenuItemClass()}
      >
        <span>{label}</span>
        <Icon className="h-4 w-4" aria-hidden />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleOpen}
      className={roomHeaderActionBtnClass()}
      title={label}
      aria-label={label}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

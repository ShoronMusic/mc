'use client';

import { Squares2X2Icon, StarIcon } from '@heroicons/react/24/outline';
import { SiteTreeOutlineIcon } from '@/components/icons/SiteTreeOutlineIcon';
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
  const tone =
    tab === 'enjoy'
      ? 'border-violet-700 bg-violet-900/35 text-violet-100 hover:bg-violet-800/55'
      : 'border-emerald-700/80 bg-emerald-950/35 text-emerald-100 hover:bg-emerald-900/50';

  const handleOpen = () => {
    onNavigate?.();
    onOpen(tab);
  };

  if (variant === 'menu-item') {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-gray-800/80 ${
          tab === 'enjoy' ? 'text-violet-200 hover:bg-violet-900/30' : 'text-emerald-200 hover:bg-emerald-900/30'
        }`}
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
      className={`inline-flex h-10 w-10 items-center justify-center gap-0 rounded border px-0 py-0 sm:w-auto sm:gap-1 sm:px-2.5 sm:py-1.5 ${tone}`}
      title={label}
      aria-label={label}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

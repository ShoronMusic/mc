type Props = {
  className?: string;
};

export function domesticSongBadgeClass(): string {
  return 'rounded bg-rose-900/50 px-1.5 py-0.5 text-[10px] font-medium text-rose-200';
}

export function AdminDomesticSongBadge({ className = '' }: Props) {
  return <span className={`${domesticSongBadgeClass()} ${className}`.trim()}>邦楽</span>;
}

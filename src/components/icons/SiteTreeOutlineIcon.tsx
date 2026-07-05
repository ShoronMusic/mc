/** サイトマップ（1親＋2子のツリー）— Heroicons outline と同系の 24px アイコン */
export function SiteTreeOutlineIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      <rect x="9.25" y="2.75" width="5.5" height="5.5" />
      <path strokeLinecap="round" d="M12 8.25v1.75" />
      <path strokeLinecap="round" d="M6.5 10h11" />
      <path strokeLinecap="round" d="M6.5 10v1.75M17.5 10v1.75" />
      <rect x="3.75" y="11.75" width="5.5" height="5.5" />
      <rect x="14.75" y="11.75" width="5.5" height="5.5" />
    </svg>
  );
}

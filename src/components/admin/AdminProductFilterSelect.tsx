'use client';

type AdminProductFilterValue = 'all' | 'musicaichat' | 'musicchat';

type Props = {
  value: AdminProductFilterValue;
  onChange: (value: AdminProductFilterValue) => void;
  className?: string;
};

export function AdminProductFilterSelect({ value, onChange, className = '' }: Props) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-gray-400 ${className}`.trim()}>
      プロダクト
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as AdminProductFilterValue)}
        className="rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-gray-100"
      >
        <option value="all">すべて（ma + mc）</option>
        <option value="musicaichat">ma（Music AI Chat）</option>
        <option value="musicchat">mc（Music Chat）</option>
      </select>
    </label>
  );
}

export function productBadgeClass(product: string): string {
  return product === 'musicchat'
    ? 'rounded bg-sky-900/50 px-1.5 py-0.5 text-[10px] font-medium text-sky-200'
    : 'rounded bg-violet-900/50 px-1.5 py-0.5 text-[10px] font-medium text-violet-200';
}

export function productBadgeLabel(product: string): string {
  return product === 'musicchat' ? 'mc' : 'ma';
}

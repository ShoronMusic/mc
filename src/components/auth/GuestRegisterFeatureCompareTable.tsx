'use client';

import {
  GUEST_REGISTER_FEATURE_COMPARE_ROWS,
  formatGuestRegisterFeatureAvailability,
} from '@/lib/guest-register-feature-compare';

export function GuestRegisterFeatureCompareTable({ className = 'mt-4' }: { className?: string }) {
  return (
    <div className={`overflow-x-auto rounded-lg border border-gray-700 bg-gray-800/50 ${className}`}>
      <table className="w-full min-w-[280px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-gray-700 bg-gray-800/80">
            <th
              scope="col"
              className="px-2.5 py-2 font-medium text-gray-400"
            >
              機能
            </th>
            <th
              scope="col"
              className="w-[4.5rem] px-2 py-2 text-center font-medium text-gray-400"
            >
              ゲスト
            </th>
            <th
              scope="col"
              className="w-[5.5rem] px-2 py-2 text-center font-medium text-amber-200/90"
            >
              登録
            </th>
          </tr>
        </thead>
        <tbody>
          {GUEST_REGISTER_FEATURE_COMPARE_ROWS.map((row) => (
            <tr key={row.feature} className="border-b border-gray-700/80 last:border-b-0">
              <td className="px-2.5 py-2 text-gray-200">
                <span className="block leading-snug">{row.feature}</span>
                {row.detail ? (
                  <span className="mt-0.5 block text-[10px] leading-snug text-gray-500">
                    {row.detail}
                  </span>
                ) : null}
              </td>
              <td className="px-2 py-2 text-center text-gray-300 tabular-nums">
                {formatGuestRegisterFeatureAvailability(row.guest)}
              </td>
              <td className="px-2 py-2 text-center text-amber-100/90 tabular-nums">
                {formatGuestRegisterFeatureAvailability(row.registered, row.registeredNote)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-gray-700/80 px-2.5 py-1.5 text-[10px] leading-relaxed text-gray-500">
        ○＝利用可　お試し＝登録後の無料お試し枠　—＝利用不可
      </p>
    </div>
  );
}

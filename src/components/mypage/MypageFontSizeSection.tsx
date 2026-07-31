'use client';

import {
  MC_UI_FONT_SIZE_OPTIONS,
  type McUiFontSize,
} from '@/lib/mc-ui-font-size-preference';
import {
  mypageBodyTextClass,
  mypagePanelClass,
  mypageSectionTitleClass,
  mypageTabBtnClass,
} from '@/lib/product-branding';

type MypageFontSizeSectionProps = {
  value: McUiFontSize;
  onChange: (next: McUiFontSize) => void;
};

/** マイページ — 表示文字サイズ（端末ローカル保存） */
export function MypageFontSizeSection({ value, onChange }: MypageFontSizeSectionProps) {
  return (
    <div className={mypagePanelClass()}>
      <h3 className={mypageSectionTitleClass()}>文字サイズ</h3>
      <p className={`mb-2 ${mypageBodyTextClass()}`}>
        部屋画面（チャット・視聴履歴の表など）とマイページの文字を大きく表示できます。設定はこの端末に保存されます。
        「特大」は標準のおよそ1.45倍です。
      </p>
      <div className="flex flex-wrap gap-2">
        {MC_UI_FONT_SIZE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={mypageTabBtnClass(value === opt.id)}
            aria-pressed={value === opt.id}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

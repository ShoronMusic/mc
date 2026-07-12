'use client';

import {
  MC_UI_ACCENT_THEME_OPTIONS,
  type McUiAccentTheme,
} from '@/lib/mc-ui-accent-theme-preference';
import {
  mypageBodyTextClass,
  mypagePanelClass,
  mypageSectionTitleClass,
} from '@/lib/product-branding';

type McUiAccentThemeSectionProps = {
  value: McUiAccentTheme;
  onChange: (next: McUiAccentTheme) => void;
};

/** mc マイページ — キーカラー（線・主ボタン等） */
export function McUiAccentThemeSection({ value, onChange }: McUiAccentThemeSectionProps) {
  return (
    <div className={mypagePanelClass()}>
      <h3 className={mypageSectionTitleClass()}>キーカラー</h3>
      <p className={`mb-3 ${mypageBodyTextClass()}`}>
        部屋画面とマイページで使う線・ボタン・選択中の強調色を変更できます。設定はこの端末に保存されます。
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {MC_UI_ACCENT_THEME_OPTIONS.map((opt) => {
          const selected = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              aria-pressed={selected}
              className={`flex items-center gap-2 rounded border px-2.5 py-2 text-left text-sm transition ${
                selected
                  ? 'border-gray-400 bg-gray-50 ring-2 ring-gray-300 ring-offset-1'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <span
                className="h-5 w-5 shrink-0 rounded-full border border-black/10 shadow-sm"
                style={{ backgroundColor: opt.swatch }}
                aria-hidden
              />
              <span className="min-w-0 truncate font-medium text-gray-800">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

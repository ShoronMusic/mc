'use client';

import {
  formatSongSelectionCostRange,
  SONG_SELECTION_COST_GUIDE_CONDITIONS,
  SONG_SELECTION_COST_GUIDE_FOOTNOTE,
  SONG_SELECTION_COST_GUIDE_TITLE,
  SONG_SELECTION_COST_SCENARIOS,
} from '@/lib/song-selection-cost-guide';

type SongSelectionCostGuideProps = {
  className?: string;
  /** 部屋（violet） / マイページ（gray-violet） */
  variant?: 'room' | 'mypage';
};

export function SongSelectionCostGuide({ className = '', variant = 'room' }: SongSelectionCostGuideProps) {
  const isRoom = variant === 'room';
  const boxClass = isRoom
    ? 'rounded border border-violet-900/40 bg-violet-950/35'
    : 'rounded border border-violet-800/45 bg-violet-950/25';
  const titleClass = isRoom ? 'text-sm font-medium text-violet-200' : 'text-sm font-medium text-violet-200/95';
  const bodyClass = isRoom ? 'text-xs text-violet-100/90' : 'text-xs text-gray-200';
  const mutedClass = isRoom ? 'text-xs text-violet-200/80' : 'text-xs text-gray-400';
  const priceClass = isRoom ? 'text-emerald-200/95' : 'text-emerald-300/95';
  const tagClass = isRoom
    ? 'rounded bg-violet-900/45 px-1.5 py-0.5 text-xs text-violet-100/90'
    : 'rounded bg-gray-800/90 px-1.5 py-0.5 text-xs text-gray-300';

  return (
    <div className={`${boxClass} p-3 text-xs leading-relaxed ${className}`}>
      <p className={titleClass}>{SONG_SELECTION_COST_GUIDE_TITLE}</p>
      <p className={`mt-1.5 ${mutedClass}`}>{SONG_SELECTION_COST_GUIDE_CONDITIONS}</p>
      <ul className={`mt-2 space-y-2 ${bodyClass}`}>
        {SONG_SELECTION_COST_SCENARIOS.map((scenario) => (
          <li key={scenario.id}>
            <p>
              <span className="font-medium">{scenario.labelJa}: </span>
              <span className={priceClass}>{formatSongSelectionCostRange(scenario)}</span>
            </p>
            <p className={`mt-1 flex flex-wrap gap-1 ${mutedClass}`}>
              {scenario.includes.map((item) => (
                <span key={item} className={tagClass}>
                  {item}
                </span>
              ))}
            </p>
          </li>
        ))}
      </ul>
      <p className={`mt-2.5 leading-relaxed ${mutedClass}`}>{SONG_SELECTION_COST_GUIDE_FOOTNOTE}</p>
    </div>
  );
}

import {
  AI_USER_AUDIENCE_COLUMNS,
  AI_USER_AUDIENCE_MATRIX_INTRO,
  AI_USER_AUDIENCE_MATRIX_ROWS,
  AI_USER_AUDIENCE_MATRIX_TITLE,
  formatAiAudienceCell,
} from '@/lib/ai-credits-pricing-guide';

type UserAudienceServiceMatrixProps = {
  className?: string;
  /** 見出しレベル（ページ側で h1 がある場合は h2） */
  headingLevel?: 'h2' | 'h3';
};

export function UserAudienceServiceMatrix({
  className = '',
  headingLevel = 'h2',
}: UserAudienceServiceMatrixProps) {
  const Heading = headingLevel;

  return (
    <section className={`space-y-3 ${className}`} aria-labelledby="user-audience-matrix-title">
      <div>
        <Heading id="user-audience-matrix-title" className="text-lg font-semibold text-white">
          {AI_USER_AUDIENCE_MATRIX_TITLE}
        </Heading>
        <p className="mt-2 text-sm leading-relaxed text-gray-400">{AI_USER_AUDIENCE_MATRIX_INTRO}</p>
      </div>

      <ul className="grid gap-2 sm:grid-cols-3">
        {AI_USER_AUDIENCE_COLUMNS.map((col) => (
          <li
            key={col.id}
            className="rounded-lg border border-gray-700/80 bg-gray-900/40 px-3 py-2.5"
          >
            <p className="text-sm font-medium text-gray-100">{col.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">{col.blurb}</p>
          </li>
        ))}
      </ul>

      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-800/80">
              <th className="px-3 py-2.5 font-semibold text-gray-200">サービス</th>
              {AI_USER_AUDIENCE_COLUMNS.map((col) => (
                <th key={col.id} className="px-3 py-2.5 font-semibold text-gray-200">
                  <span className="block sm:hidden">
                    {col.id === 'guest' ? 'ゲスト' : col.id === 'trial' ? 'お試し' : '購入後'}
                  </span>
                  <span className="hidden sm:block">{col.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {AI_USER_AUDIENCE_MATRIX_ROWS.map((row) => (
              <tr key={row.feature} className="border-b border-gray-800 align-top last:border-0">
                <th scope="row" className="px-3 py-2.5 font-medium text-gray-300">
                  {row.feature}
                </th>
                {AI_USER_AUDIENCE_COLUMNS.map((col) => {
                  const formatted = formatAiAudienceCell(row.cells[col.id]);
                  return (
                    <td key={col.id} className="px-3 py-2.5 text-gray-400">
                      <span
                        className={
                          formatted.mark === '○'
                            ? 'font-semibold text-emerald-300/95'
                            : formatted.mark === '×'
                              ? 'font-semibold text-gray-500'
                              : 'font-medium text-violet-200/90'
                        }
                      >
                        {formatted.mark}
                      </span>
                      {formatted.note ? (
                        <span className="mt-0.5 block text-xs leading-snug text-gray-500">
                          {formatted.note}
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-gray-500">
        「初回クレジット付き」は登録時に付くお試し枠（回数）です。枠を使い切っても、同時視聴・AIなし選曲・通常チャットは無料のまま続けられます。AI
        を続ける場合はクレジットを購入してください。
      </p>
    </section>
  );
}

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'チャットのマナー | ご利用上の注意',
  description: 'チャット参加時の基本的なマナーと注意事項です。',
};

export default function GuideChatPage() {
  return (
    <article className="space-y-6 text-sm leading-relaxed text-gray-300">
      <h1 className="text-2xl font-bold text-white">チャットのマナー</h1>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">相手と部屋への敬意</h2>
        <ul className="list-disc space-y-2 pl-5 text-gray-400">
          <li>誹謗中傷・差別・煽り・荒らしは行わないでください。</li>
          <li>相手の趣味や好みを否定する発言は避け、建設的な会話を心がけてください。</li>
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">スパム・宣伝・連投</h2>
        <ul className="list-disc space-y-2 pl-5 text-gray-400">
          <li>同じ内容の連投や、無関係な宣伝・外部誘導はご遠慮ください。</li>
          <li>リンクを貼る場合は、相手や部屋の文脈に合うものにしてください。</li>
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">トピック</h2>
        <p className="text-gray-400">
          本サービスは洋楽を楽しむ場です。部屋の雰囲気に大きく反する話題は控えめにするか、別の場を検討してください。
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">トラブル時</h2>
        <p className="text-gray-400">
          不適切な利用を見かけた場合は、運営が用意している通報・お問い合わせ手段があればご利用ください（運用に応じて整備されます）。
        </p>
      </section>
    </article>
  );
}

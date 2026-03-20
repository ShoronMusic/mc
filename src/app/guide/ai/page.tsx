import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI について | ご利用上の注意',
  description: 'AI が参加するチャットでの注意事項です。',
};

export default function GuideAiPage() {
  return (
    <article className="space-y-6 text-sm leading-relaxed text-gray-300">
      <h1 className="text-2xl font-bold text-white">AI について</h1>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">回答の性質</h2>
        <p className="text-gray-400">
          AI の返答は参考用です。事実誤認・古い情報・文脈の取り違えが含まれることがあります。重要な判断は必ずご自身で確認してください。
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">楽曲・著作権まわり</h2>
        <p className="text-gray-400">
          アーティスト名・曲名・歌詞・解説などについても、AI の説明は正確である保証はありません。公式情報や権利者の表記を優先してください。
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">入力内容とプライバシー</h2>
        <ul className="list-disc space-y-2 pl-5 text-gray-400">
          <li>パスワード、住所、電話番号など、機微な個人情報を AI に送らないでください。</li>
          <li>サービスの仕様上、会話がログや学習に使われる可能性がある場合は、別途ポリシーで示されます。</li>
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">生成文の利用</h2>
        <p className="text-gray-400">
          AI の出力をそのまま他サイトに転載したり商用利用したりする場合は、利用規約・著作権・出典の扱いにご注意ください。
        </p>
      </section>
    </article>
  );
}

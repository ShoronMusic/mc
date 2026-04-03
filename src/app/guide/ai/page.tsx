import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI について | ご利用上の注意',
  description: 'AI が参加するチャットでの注意事項です。',
};

export default function GuideAiPage() {
  return (
    <article className="space-y-6 text-sm leading-relaxed text-gray-300">
      <h1 className="text-2xl font-bold text-white">AI について</h1>
      <p className="text-xs leading-relaxed text-gray-500">
        部屋内チャットのリンクから開いた場合、画面上部に「← チャットの部屋に戻る」が表示されます。表示されない場合は、ブラウザの戻るでも直前の画面に戻れます。
      </p>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">回答の性質</h2>
        <p className="text-gray-400">
          AI の返答は参考用です。事実誤認・古い情報・文脈の取り違えが含まれることがあります。重要な判断は必ずご自身で確認してください。
        </p>
        <p className="text-gray-400">
          AI に質問したい場合は、発言の先頭に <code className="rounded bg-gray-800 px-1 py-0.5 text-gray-200">@</code> を付けてください
          （例: <code className="rounded bg-gray-800 px-1 py-0.5 text-gray-200">@ おすすめの洋楽を1つ教えて</code>）。
        </p>
        <p className="text-gray-400">
          AI への質問は音楽（洋楽）関連を前提にしています。音楽以外の質問や会話は控えてください。
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">AI への質問（@）と違反時の対応</h2>
        <p className="text-gray-400">
          次の自動チェックは、<strong className="text-gray-300">発言の先頭が「@」で始まるAI宛ての質問のみ</strong>が対象です。通常のチャット（@なし）の不適切な発言については、チャットオーナーによる強制退出などで対応します。
        </p>
        <p className="text-gray-400">
          音楽（洋楽）に関係ない内容とシステムが判断した場合、次の段階で警告・制限がかかることがあります。
        </p>
        <ul className="list-disc space-y-2 pl-5 text-gray-400">
          <li>1回目: システムから注意メッセージが表示されます。</li>
          <li>2回目: イエローカード1枚が付与され、参加者一覧の当該ユーザー名の前に表示されます。</li>
          <li>3回目: イエローカード2枚目が付与され、次の違反で退場となる旨の警告が表示されます。</li>
          <li>4回目相当: 部屋から強制退場となり、一定期間（現在は約3時間）部屋およびサイトへの入室が制限される場合があります。</li>
        </ul>
        <p className="text-gray-400">
          判定は自動のため、意図と異なる結果になることがあります。繰り返し問題になる場合は、チャットオーナーや運営の案内に従ってください。
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

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'アカウントと安全 | ご利用上の注意',
  description: 'ゲスト・登録・個人情報など、安全に使うための注意です。',
};

export default function GuideSafetyPage() {
  return (
    <article className="space-y-6 text-sm leading-relaxed text-gray-300">
      <h1 className="text-2xl font-bold text-white">アカウントと安全</h1>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">参加方法</h2>
        <p className="text-gray-400">
          入室後、ゲスト・簡易登録・Google 認証などから参加方法を選べます。方式によって表示名の扱いや再入室時の挙動が異なる場合があります。
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">個人情報</h2>
        <ul className="list-disc space-y-2 pl-5 text-gray-400">
          <li>本名・住所・電話番号・勤務先など、特定につながる情報はチャットに書かないでください。</li>
          <li>他者になりすます行為は禁止です。</li>
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">ルームの指定</h2>
        <p className="text-gray-400">
          トップから 01〜03 に入るほか、URL で <code className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-200">/04</code>、
          <code className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-200">/05</code> のようにルーム番号を指定できます。知らないリンクからの入室には注意してください。
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">外部とのやり取り</h2>
        <p className="text-gray-400">
          チャット内で知り合った相手と個人的に連絡を取る場合は、詐欺・なりすましに十分注意し、無理な個人情報の開示はしないでください。
        </p>
      </section>
    </article>
  );
}

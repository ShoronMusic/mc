import type { Metadata } from 'next';
import { YouTubeDataApiQuotaCallout } from '@/components/guide/YouTubeDataApiQuotaCallout';

export const metadata: Metadata = {
  title: '曲・コメント | ご利用上の注意',
  description: '楽曲や再生に関するコメント、および画面に表示されるアーティスト・楽曲情報の注意です。',
};

export default function GuideMusicPage() {
  return (
    <article className="space-y-6 text-sm leading-relaxed text-gray-300">
      <h1 className="text-2xl font-bold text-white">曲・コメント</h1>
      <YouTubeDataApiQuotaCallout />
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">再生と著作権</h2>
        <p className="text-gray-400">
          動画・音声の再生は YouTube 等の配信元の利用規約に従います。違法アップロードの助長になる行為は行わないでください。
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">画面のアーティスト・楽曲情報について</h2>
        <p className="text-gray-400">
          部屋内のタブ等に表示されるアーティストや楽曲の説明・経歴・リリース情報などは、
          <strong className="text-gray-300">外部の参照データを自動で照合して表示している場合</strong>
          があります。取得の成否、内容の
          <strong className="text-gray-300">正確性・真偽・網羅性・最新性</strong>、ならびに
          <strong className="text-gray-300">いま再生中の動画・楽曲と必ずしも一致するか</strong>
          について、運営は保証しません。重要な事実は公式サイトや権利者の発表などでご確認ください。
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">アーティスト・作品への言及</h2>
        <ul className="list-disc space-y-2 pl-5 text-gray-400">
          <li>アーティストや他のリスナーへの中傷、過度な罵倒は避けてください。</li>
          <li>好みの違いは「好き嫌い」として尊重し、押し付けや論争の火種にならない表現を心がけてください。</li>
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">歌詞・引用</h2>
        <p className="text-gray-400">
          歌詞の長文引用は著作権上の問題になることがあります。必要最小限にとどめるか、公式の歌詞ページへの誘導を検討してください。
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">コメントのトーン</h2>
        <p className="text-gray-400">
          批評やネタも歓迎ですが、場が和やかに続くよう、ユーモアと敬意のバランスを意識してください。
        </p>
      </section>
    </article>
  );
}

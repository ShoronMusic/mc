import Image from 'next/image';
import Link from 'next/link';

const BASE = '/images/first-time-song-selection';

export type FirstSongMobileGuideArticleProps = {
  variant?: 'page' | 'modal';
  guideIndexHref?: string;
  desktopGuideHref?: string;
};

/**
 * スマホ向け選曲手順（YouTube アプリ：共有 → コピー → 貼り付け → 送信）
 */
export function FirstSongMobileGuideArticle({
  variant = 'page',
  guideIndexHref,
  desktopGuideHref,
}: FirstSongMobileGuideArticleProps) {
  const modal = variant === 'modal';

  const stepTitle = modal
    ? 'flex items-baseline gap-2 text-base font-bold text-white'
    : 'flex items-baseline gap-2 text-lg font-bold text-white sm:text-xl';
  const badge = modal
    ? 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/90 text-sm text-gray-950'
    : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/90 text-base text-gray-950';

  return (
    <article
      className={modal ? 'space-y-6 text-sm text-gray-200' : 'space-y-10 text-base text-gray-200'}
    >
      {!modal ? (
        <header className="space-y-3">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">選曲のしかた（スマホ）</h1>
          <p className="text-sm font-semibold text-amber-200 sm:text-base">YouTubeアプリの場合</p>
          <p className="text-sm leading-relaxed text-gray-400 sm:text-base">
            YouTube アプリで動画のリンクをコピーし、部屋の<strong className="text-gray-300">発言欄</strong>から
            <strong className="text-gray-300">送信</strong>します（共有 → コピー → 貼り付け → 送信）。
          </p>
        </header>
      ) : (
        <p className="text-xs font-semibold text-amber-200">YouTubeアプリの場合</p>
      )}

      <ol className="list-none space-y-8 sm:space-y-10">
        <li className="space-y-2 sm:space-y-3">
          <p className={stepTitle}>
            <span className={badge}>1</span>
            YouTube で<strong className="text-amber-200">共有</strong>ボタンをタップ
          </p>
          <div className="overflow-hidden rounded-lg border border-gray-700 bg-black/40">
            <Image
              src={`${BASE}/m01.png`}
              alt="YouTube アプリで共有ボタンをタップ"
              width={720}
              height={1280}
              className="h-auto w-full"
              sizes="(max-width: 1024px) 100vw, 448px"
              priority={!modal}
            />
          </div>
        </li>

        <li className="space-y-2 sm:space-y-3">
          <p className={stepTitle}>
            <span className={badge}>2</span>
            <strong className="text-amber-200">コピー</strong>ボタンをタップ
          </p>
          <div className="overflow-hidden rounded-lg border border-gray-700 bg-black/40">
            <Image
              src={`${BASE}/m02.png`}
              alt="YouTube の共有メニューでコピーをタップ"
              width={720}
              height={1280}
              className="h-auto w-full"
              sizes="(max-width: 1024px) 100vw, 448px"
            />
          </div>
        </li>

        <li className="space-y-2 sm:space-y-3">
          <p className={stepTitle}>
            <span className={badge}>3</span>
            チャットの発言欄に<strong className="text-sky-200">貼り付け（ペースト）</strong>
            →<strong className="text-sky-200">送信</strong>をタップ
          </p>
          <div className="overflow-hidden rounded-lg border border-gray-700 bg-black/40">
            <Image
              src={`${BASE}/m03.png`}
              alt="発言欄に貼り付けて送信をタップ"
              width={720}
              height={1280}
              className="h-auto w-full"
              sizes="(max-width: 1024px) 100vw, 448px"
            />
          </div>
        </li>

        <li className="space-y-2 sm:space-y-3">
          <p className={stepTitle}>
            <span className={badge}>4</span>
            曲が再生され、<strong className="text-emerald-200">AI による解説</strong>がチャットに出ます
          </p>
          <div className="overflow-hidden rounded-lg border border-gray-700 bg-black/40">
            <Image
              src={`${BASE}/m04.png`}
              alt="再生中と AI の解説がチャットに表示"
              width={720}
              height={1280}
              className="h-auto w-full"
              sizes="(max-width: 1024px) 100vw, 448px"
            />
          </div>
        </li>
      </ol>

      {!modal && (guideIndexHref || desktopGuideHref) ? (
        <nav className="flex flex-col gap-3 border-t border-gray-800 pt-6 text-sm sm:text-base">
          {desktopGuideHref ? (
            <Link
              href={desktopGuideHref}
              className="font-medium text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline"
            >
              ← パソコン向けの手順（別ページ）
            </Link>
          ) : null}
          {guideIndexHref ? (
            <Link
              href={guideIndexHref}
              className="font-medium text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline"
            >
              ← ご利用上の注意の目次
            </Link>
          ) : null}
        </nav>
      ) : null}
    </article>
  );
}

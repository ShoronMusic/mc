'use client';

import Image from 'next/image';
import Link from 'next/link';

const BASE = '/images/first-time-song-selection';

function Fig({
  src,
  alt,
  caption,
  priority = false,
  compact,
}: {
  src: string;
  alt: string;
  caption: string;
  priority?: boolean;
  compact?: boolean;
}) {
  return (
    <figure className={compact ? 'space-y-2' : 'space-y-3'}>
      <p
        className={
          compact
            ? 'text-xs font-medium leading-snug text-gray-200'
            : 'text-base font-medium leading-snug text-gray-200 md:text-lg'
        }
      >
        {caption}
      </p>
      <div className="overflow-hidden rounded-lg border border-gray-700 bg-black/40">
        <Image
          src={src}
          alt={alt}
          width={1280}
          height={720}
          className="h-auto w-full"
          sizes={compact ? '(max-width: 448px) 100vw, 448px' : '(max-width: 768px) 100vw, 672px'}
          priority={priority}
        />
      </div>
    </figure>
  );
}

export type FirstSongGuideArticleProps = {
  variant?: 'page' | 'modal';
  /** ページ下部「ご利用上の注意の目次」用。未指定なら非表示（モーダルなど） */
  guideIndexHref?: string;
  /** スマホ向け手順ページへのリンク（パソコン用ページのみ） */
  mobileGuideHref?: string;
};

/**
 * /guide/first-song と同一の選曲ガイド本文（ページ・モーダルで共有）
 */
export function FirstSongGuideArticle({
  variant = 'page',
  guideIndexHref,
  mobileGuideHref,
}: FirstSongGuideArticleProps) {
  const modal = variant === 'modal';

  return (
    <article
      className={
        modal
          ? 'space-y-8 text-sm text-gray-200'
          : 'space-y-12 text-base text-gray-200 md:text-lg'
      }
    >
      {!modal ? (
        <header className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">選曲のしかた</h1>
          <p className="text-lg font-medium text-gray-300 md:text-xl">
            YouTube で URL をコピーし、MusicAi の発言欄から<strong className="text-white">送信</strong>
            します。
          </p>
        </header>
      ) : null}

      <section className="space-y-6">
        <h2
          className={
            modal
              ? 'border-b border-gray-700 pb-1.5 text-base font-bold text-white'
              : 'border-b border-gray-700 pb-2 text-2xl font-bold text-white md:text-3xl'
          }
        >
          YouTube で URL をコピー
        </h2>
        <p
          className={
            modal
              ? 'rounded-lg border-2 border-amber-500/50 bg-amber-950/40 px-3 py-2 text-sm font-bold text-amber-100'
              : 'rounded-lg border-2 border-amber-500/50 bg-amber-950/40 px-4 py-3 text-lg font-bold text-amber-100 md:text-xl'
          }
        >
          コピーのしかたは <span className="text-white">2 種類</span>あります。
          <span
            className={
              modal
                ? 'mt-0.5 block text-xs font-semibold text-amber-200/90'
                : 'mt-1 block text-base font-semibold text-amber-200/90 md:text-lg'
            }
          >
            どちらか一方だけでかまいません。
          </span>
        </p>

        <div className="space-y-8">
          <div className="space-y-3">
            <h3
              className={
                modal ? 'text-sm font-bold text-white' : 'text-xl font-bold text-white md:text-2xl'
              }
            >
              <span
                className={
                  modal
                    ? 'mr-1.5 inline-block rounded bg-blue-600 px-1.5 py-0.5 text-xs text-white'
                    : 'mr-2 inline-block rounded bg-blue-600 px-2.5 py-0.5 text-lg text-white md:text-xl'
                }
              >
                方法1
              </span>
              アドレスバーからコピー
            </h3>
            <ol
              className={
                modal
                  ? 'list-decimal space-y-2 pl-5 text-sm font-medium text-gray-100 marker:font-bold marker:text-amber-400'
                  : 'list-decimal space-y-3 pl-6 text-lg font-medium text-gray-100 marker:font-bold marker:text-amber-400 md:text-xl md:pl-7'
              }
            >
              <li>
                画面上部の<strong className="text-white">アドレスバー</strong>に表示されている URL
                をクリックするか、ドラッグして<strong className="text-white">すべて選択</strong>
                します。
              </li>
              <li>
                <strong className="text-white">右クリック</strong>して「
                <strong className="text-white">コピー</strong>」を選びます。
                <span className="mt-0.5 block text-xs font-normal text-gray-400 md:mt-1 md:text-base md:text-lg">
                  （キーボードなら{' '}
                  <kbd className="rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-xs text-gray-200 md:text-sm">
                    Ctrl
                  </kbd>{' '}
                  +{' '}
                  <kbd className="rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-xs text-gray-200 md:text-sm">
                    C
                  </kbd>{' '}
                  でもコピーできます）
                </span>
              </li>
            </ol>
            <div className="pt-1">
              <Fig
                src={`${BASE}/sc-01.png`}
                alt="YouTube アドレスバーから URL をコピー（丸印は操作箇所）"
                caption="アドレスバーで URL を選択し、右クリック →「コピー」（または Ctrl+C）。丸印は操作箇所の目印です。"
                priority
                compact={modal}
              />
            </div>
          </div>

          <div className="space-y-3 border-t border-gray-800 pt-6">
            <h3
              className={
                modal ? 'text-sm font-bold text-white' : 'text-xl font-bold text-white md:text-2xl'
              }
            >
              <span
                className={
                  modal
                    ? 'mr-1.5 inline-block rounded bg-emerald-600 px-1.5 py-0.5 text-xs text-white'
                    : 'mr-2 inline-block rounded bg-emerald-600 px-2.5 py-0.5 text-lg text-white md:text-xl'
                }
              >
                方法2
              </span>
              「共有」からコピー
            </h3>
            <ol
              className={
                modal
                  ? 'list-decimal space-y-2 pl-5 text-sm font-medium text-gray-100 marker:font-bold marker:text-amber-400'
                  : 'list-decimal space-y-3 pl-6 text-lg font-medium text-gray-100 marker:font-bold marker:text-amber-400 md:text-xl md:pl-7'
              }
            >
              <li>
                動画の下のボタン列から<strong className="text-white">「共有」</strong>
                を押します（いいね・高く評価の横あたり）。
              </li>
              <li>
                出てきた画面で、リンクの横にある
                <strong className="text-blue-300">青い「コピー」</strong>ボタンを押します。
              </li>
            </ol>
            <div className="space-y-4 pt-1">
              <Fig
                src={`${BASE}/sc-02.png`}
                alt="YouTube の共有ボタンの位置（丸印は操作箇所）"
                caption="① 動画の下のボタン列にある「共有」の位置です（丸印は操作箇所の目印）。"
                compact={modal}
              />
              <Fig
                src={`${BASE}/sc-03.png`}
                alt="YouTube の共有ウィンドウとコピー（丸印は操作箇所）"
                caption="② 共有ウィンドウを開き、青い「コピー」で URL を取得します（丸印は操作箇所の目印）。"
                compact={modal}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2
          className={
            modal
              ? 'border-b border-gray-700 pb-1.5 text-base font-bold text-white'
              : 'border-b border-gray-700 pb-2 text-2xl font-bold text-white md:text-3xl'
          }
        >
          MusicAi で再生
        </h2>
        <ol
          className={
            modal
              ? 'list-decimal space-y-2 pl-5 text-sm font-medium text-gray-100 marker:font-bold marker:text-sky-400'
              : 'list-decimal space-y-4 pl-6 text-lg font-medium text-gray-100 marker:font-bold marker:text-sky-400 md:text-xl md:pl-7'
          }
        >
          <li>
            画面の<strong className="text-white">下の白い発言欄</strong>をクリックします。
          </li>
          <li>
            コピーした URL を<strong className="text-white">貼り付け</strong>ます（
            <kbd className="rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-xs text-gray-200 md:text-sm">
              Ctrl
            </kbd>{' '}
            +{' '}
            <kbd className="rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-xs text-gray-200 md:text-sm">
              V
            </kbd>
            ）。続けて青い<strong className="text-white">「送信」</strong>ボタンを押します。
          </li>
          <li>
            <strong className="text-white">再生が始まり</strong>、チャットには{' '}
            <strong className="text-white">AI による曲解説</strong>
            が出ます。左のプレイヤーに動画が表示されれば
            <strong className="text-white">完了</strong>です。
          </li>
        </ol>
        <div className="space-y-4 pt-2">
          <Fig
            src={`${BASE}/sc-04.png`}
            alt="発言欄に URL を貼り送信ボタン（丸印は操作箇所）"
            caption="URL を貼り付け、続けて「送信」を押します（丸印は操作箇所の目印）。"
            compact={modal}
          />
          <Fig
            src={`${BASE}/sc-05.png`}
            alt="再生とチャットの AI 曲解説"
            caption="再生が始まり、チャットには AI による曲解説が出ます。"
            compact={modal}
          />
        </div>
      </section>

      {!modal && mobileGuideHref ? (
        <p>
          <Link
            href={mobileGuideHref}
            className="text-base font-medium text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline md:text-lg"
          >
            スマホ・タブレット向けの手順（別ページ）
          </Link>
        </p>
      ) : null}

      {guideIndexHref ? (
        <p>
          <Link
            href={guideIndexHref}
            className={
              modal
                ? 'text-sm font-medium text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline'
                : 'text-lg font-medium text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline md:text-xl'
            }
          >
            ← ご利用上の注意の目次
          </Link>
        </p>
      ) : null}
    </article>
  );
}

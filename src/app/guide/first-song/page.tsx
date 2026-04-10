import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '選曲のしかた | ご利用上の注意',
  description: 'MusiAiチャットで YouTube の曲を流す手順です。',
};

const BASE = '/images/first-time-song-selection';

function Fig({
  src,
  alt,
  caption,
  priority = false,
}: {
  src: string;
  alt: string;
  caption: string;
  priority?: boolean;
}) {
  return (
    <figure className="space-y-3">
      <p className="text-base font-medium leading-snug text-gray-200 md:text-lg">{caption}</p>
      <div className="overflow-hidden rounded-lg border border-gray-700 bg-black/40">
        <Image
          src={src}
          alt={alt}
          width={1280}
          height={720}
          className="h-auto w-full"
          sizes="(max-width: 768px) 100vw, 672px"
          priority={priority}
        />
      </div>
    </figure>
  );
}

export default function GuideFirstSongPage() {
  return (
    <article className="space-y-12 text-base text-gray-200 md:text-lg">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">選曲のしかた</h1>
        <p className="text-lg font-medium text-gray-300 md:text-xl">
          YouTube で URL をコピーし、MusiAi の発言欄から<strong className="text-white">送信</strong>
          します。
        </p>
      </header>

      <section className="space-y-8">
        <h2 className="border-b border-gray-700 pb-2 text-2xl font-bold text-white md:text-3xl">
          YouTube で URL をコピー
        </h2>
        <p className="rounded-lg border-2 border-amber-500/50 bg-amber-950/40 px-4 py-3 text-lg font-bold text-amber-100 md:text-xl">
          コピーのしかたは <span className="text-white">2 種類</span>あります。
          <span className="mt-1 block text-base font-semibold text-amber-200/90 md:text-lg">
            どちらか一方だけでかまいません。
          </span>
        </p>

        <div className="space-y-10">
          <div className="space-y-5">
            <h3 className="text-xl font-bold text-white md:text-2xl">
              <span className="mr-2 inline-block rounded bg-blue-600 px-2.5 py-0.5 text-lg text-white md:text-xl">
                方法1
              </span>
              アドレスバーからコピー
            </h3>
            <ol className="list-decimal space-y-3 pl-6 text-lg font-medium text-gray-100 marker:font-bold marker:text-amber-400 md:text-xl md:pl-7">
              <li>画面上部の<strong className="text-white">アドレスバー</strong>に表示されている URL をクリックするか、ドラッグして<strong className="text-white">すべて選択</strong>します。</li>
              <li>
                <strong className="text-white">右クリック</strong>して「<strong className="text-white">コピー</strong>」を選びます。
                <span className="mt-1 block text-base font-normal text-gray-400 md:text-lg">
                  （キーボードなら <kbd className="rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-sm text-gray-200">Ctrl</kbd>{' '}
                  + <kbd className="rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-sm text-gray-200">C</kbd> でもコピーできます）
                </span>
              </li>
            </ol>
            <div className="space-y-8 pt-2">
              <Fig
                src={`${BASE}/youtube-01-video-page.png`}
                alt="YouTube 動画ページのアドレスバー"
                caption="① アドレスバーに動画の URL が表示されています。"
                priority
              />
              <Fig
                src={`${BASE}/youtube-02-address-bar-copy.png`}
                alt="アドレスバーでコピー"
                caption="② 選択したうえで右クリック →「コピー」。"
              />
            </div>
          </div>

          <div className="space-y-5 border-t border-gray-800 pt-10">
            <h3 className="text-xl font-bold text-white md:text-2xl">
              <span className="mr-2 inline-block rounded bg-emerald-600 px-2.5 py-0.5 text-lg text-white md:text-xl">
                方法2
              </span>
              「共有」からコピー
            </h3>
            <ol className="list-decimal space-y-3 pl-6 text-lg font-medium text-gray-100 marker:font-bold marker:text-amber-400 md:text-xl md:pl-7">
              <li>
                動画の下のボタン列から<strong className="text-white">「共有」</strong>を押します（いいね・高く評価の横あたり）。
              </li>
              <li>
                出てきた画面で、リンクの横にある<strong className="text-blue-300">青い「コピー」</strong>ボタンを押します。
              </li>
            </ol>
            <div className="space-y-8 pt-2">
              <Fig
                src={`${BASE}/youtube-03-address-bar-full.png`}
                alt="YouTube 動画の下の共有ボタンの位置"
                caption="① 動画プレイヤーのすぐ下、タイトル付近のボタン列の中に「共有」があります。"
              />
              <Fig
                src={`${BASE}/youtube-04-share-copy.png`}
                alt="共有ダイアログの青いコピーボタン"
                caption="② 共有を開いたあと、青い「コピー」で URL を取得します。"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="border-b border-gray-700 pb-2 text-2xl font-bold text-white md:text-3xl">
          MusiAi で再生
        </h2>
        <ol className="list-decimal space-y-4 pl-6 text-lg font-medium text-gray-100 marker:font-bold marker:text-sky-400 md:text-xl md:pl-7">
          <li>
            画面の<strong className="text-white">下の白い発言欄</strong>をクリックします。
          </li>
          <li>
            コピーした URL を<strong className="text-white">貼り付け</strong>ます（
            <kbd className="rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-sm text-gray-200">Ctrl</kbd>{' '}
            + <kbd className="rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-sm text-gray-200">V</kbd>
            ）。
          </li>
          <li>
            青い<strong className="text-white">「送信」</strong>ボタンを押します。
          </li>
          <li>
            左のプレイヤーに動画が表示されれば<strong className="text-white">完了</strong>です。
          </li>
        </ol>
        <div className="space-y-8 pt-4">
          <Fig
            src={`${BASE}/musicai-01-paste-url-send.png`}
            alt="発言欄に URL を貼り送信ボタン"
            caption="貼り付けたあと「送信」を押します。"
          />
          <Fig
            src={`${BASE}/musicai-02-playing-announce.png`}
            alt="再生とチャットの案内"
            caption="再生が始まり、チャットに案内が出ることがあります。"
          />
          <Fig
            src={`${BASE}/musicai-03-history-table.png`}
            alt="視聴履歴"
            caption="視聴履歴にも残ります。"
          />
        </div>
      </section>

      <p>
        <Link
          href="/guide"
          className="text-lg font-medium text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline md:text-xl"
        >
          ← ご利用上の注意の目次
        </Link>
      </p>
    </article>
  );
}

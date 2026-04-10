'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { FirstSongGuideArticle } from '@/components/guide/FirstSongGuideArticle';
import { FirstSongMobileGuideArticle } from '@/components/guide/FirstSongMobileGuideArticle';
import { useIsLgViewport } from '@/hooks/useLgViewport';

const BASE = '/images/first-time-song-selection';

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * マイページと同じ max-w-md のシェル。PC とスマホで簡易版・詳細の内容を切り替え（ページ遷移なし）。
 */
export function SongSelectionHowtoModal({ open, onClose }: Props) {
  const [detail, setDetail] = useState(false);
  const isLg = useIsLgViewport();

  useEffect(() => {
    if (!open) {
      setDetail(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[91] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={detail ? 'song-howto-detail-title' : 'song-howto-modal-title'}
      onClick={onClose}
    >
      <div
        className="max-h-full w-full max-w-md overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-5 text-left text-gray-200 shadow-xl">
          {detail ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-gray-700 pb-2">
                <h2 id="song-howto-detail-title" className="text-base font-semibold text-white">
                  {isLg ? '選曲のしかた（詳しい説明）' : '選曲のしかた（スマホ・詳しい説明）'}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDetail(false)}
                    className="rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
                  >
                    ← 簡易版
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
                  >
                    閉じる
                  </button>
                </div>
              </div>
              {isLg ? (
                <FirstSongGuideArticle variant="modal" />
              ) : (
                <FirstSongMobileGuideArticle variant="modal" />
              )}
            </>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-2 border-b border-gray-700 pb-2">
                <h2 id="song-howto-modal-title" className="text-base font-semibold text-white">
                  選曲の仕方
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
                >
                  閉じる
                </button>
              </div>

              {isLg ? (
                <>
                  <p className="mb-4 text-xs text-gray-400">
                    YouTube で URL をコピー → 下の欄に貼って <span className="text-gray-300">送信</span>。
                  </p>

                  <section className="mb-4 space-y-2">
                    <h3 className="text-xs font-semibold text-gray-300">YouTube（どちらか）</h3>
                    <p className="text-[11px] text-gray-500">方法1 アドレスバー</p>
                    <div className="overflow-hidden rounded border border-gray-700 bg-black/30">
                      <Image
                        src={`${BASE}/sc-01.png`}
                        alt="YouTube アドレスバーから URL をコピー"
                        width={720}
                        height={405}
                        className="h-auto w-full"
                        sizes="(max-width: 448px) 100vw, 448px"
                      />
                    </div>
                    <p className="text-[11px] text-gray-500">方法2 共有</p>
                    <div className="overflow-hidden rounded border border-gray-700 bg-black/30">
                      <Image
                        src={`${BASE}/sc-02.png`}
                        alt="YouTube 共有ボタン"
                        width={720}
                        height={405}
                        className="h-auto w-full"
                        sizes="(max-width: 448px) 100vw, 448px"
                      />
                    </div>
                    <div className="overflow-hidden rounded border border-gray-700 bg-black/30">
                      <Image
                        src={`${BASE}/sc-03.png`}
                        alt="YouTube 共有ウィンドウでコピー"
                        width={720}
                        height={405}
                        className="h-auto w-full"
                        sizes="(max-width: 448px) 100vw, 448px"
                      />
                    </div>
                  </section>

                  <section className="mb-4 space-y-2">
                    <h3 className="text-xs font-semibold text-gray-300">MusicAi</h3>
                    <div className="overflow-hidden rounded border border-gray-700 bg-black/30">
                      <Image
                        src={`${BASE}/sc-04.png`}
                        alt="発言欄に URL を貼って送信"
                        width={720}
                        height={405}
                        className="h-auto w-full"
                        sizes="(max-width: 448px) 100vw, 448px"
                      />
                    </div>
                    <div className="overflow-hidden rounded border border-gray-700 bg-black/30">
                      <Image
                        src={`${BASE}/sc-05.png`}
                        alt="再生とチャットの曲解説"
                        width={720}
                        height={405}
                        className="h-auto w-full"
                        sizes="(max-width: 448px) 100vw, 448px"
                      />
                    </div>
                  </section>
                </>
              ) : (
                <>
                  <p className="mb-4 text-xs text-gray-400">
                    YouTube アプリで<strong className="text-gray-300">共有</strong>→
                    <strong className="text-gray-300">コピー</strong>→ 発言欄に
                    <strong className="text-gray-300">貼り付け</strong>→
                    <strong className="text-gray-300">送信</strong>。
                  </p>

                  <section className="mb-4 space-y-2">
                    <h3 className="text-xs font-semibold text-gray-300">YouTubeアプリの場合</h3>
                    <p className="text-[11px] text-gray-500">1 共有</p>
                    <div className="overflow-hidden rounded border border-gray-700 bg-black/30">
                      <Image
                        src={`${BASE}/m01.png`}
                        alt="共有ボタンをタップ"
                        width={720}
                        height={1280}
                        className="h-auto w-full"
                        sizes="(max-width: 448px) 100vw, 448px"
                      />
                    </div>
                    <p className="text-[11px] text-gray-500">2 コピー</p>
                    <div className="overflow-hidden rounded border border-gray-700 bg-black/30">
                      <Image
                        src={`${BASE}/m02.png`}
                        alt="コピーをタップ"
                        width={720}
                        height={1280}
                        className="h-auto w-full"
                        sizes="(max-width: 448px) 100vw, 448px"
                      />
                    </div>
                    <p className="text-[11px] text-gray-500">3 貼り付け → 送信</p>
                    <div className="overflow-hidden rounded border border-gray-700 bg-black/30">
                      <Image
                        src={`${BASE}/m03.png`}
                        alt="発言欄に貼り付けて送信"
                        width={720}
                        height={1280}
                        className="h-auto w-full"
                        sizes="(max-width: 448px) 100vw, 448px"
                      />
                    </div>
                    <p className="text-[11px] text-gray-500">4 再生と AI 解説</p>
                    <div className="overflow-hidden rounded border border-gray-700 bg-black/30">
                      <Image
                        src={`${BASE}/m04.png`}
                        alt="再生と AI 解説"
                        width={720}
                        height={1280}
                        className="h-auto w-full"
                        sizes="(max-width: 448px) 100vw, 448px"
                      />
                    </div>
                  </section>
                </>
              )}

              <p className="text-center">
                <button
                  type="button"
                  onClick={() => setDetail(true)}
                  className="text-xs text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline"
                >
                  詳しい説明ページ
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

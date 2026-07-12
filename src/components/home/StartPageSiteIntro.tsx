'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { hasGuestRoomPersistence } from '@/lib/guest-room-persistence';
import { ConsentPageLiveChats } from '@/components/home/ConsentPageLiveChats';
import { loadBrowserSupabaseClient } from '@/lib/supabase/load-browser-client';
import { MusicChatTitleBrand } from '@/components/home/MusicChatTitleLogo';
import { IS_MC_PRODUCT } from '@/lib/product-branding';

/** サイト紹介動画（トップ・ご利用にあたっての説明内） */
const SITE_INTRO_YOUTUBE_VIDEO_ID = 'gtwgUAcV3rE';

const INTRO_IMAGE_SIZES = '(max-width: 1024px) 100vw, 42vw';

/**
 * 未ログイン・ゲスト未確定のときだけサービス説明とイメージを表示する。
 * ログイン後やゲスト参加確定後は TopPageAuthBar と同様に非表示。
 */
interface StartPageSiteIntroProps {
  /** 同意画面などで未ログイン判定をスキップして常時表示する */
  forceShow?: boolean;
  /** 同意ページなど: 先頭カバー画像の直後に開催中一覧を差し込む */
  liveChatsAfterHero?: boolean;
  /** all=縦積み（同意画面等） / content=右カラム（カバー・説明・図解・動画） */
  section?: 'all' | 'content';
}

export function useStartPageIntroVisible(forceShow = false) {
  const [show, setShow] = useState<boolean | null>(null);

  useEffect(() => {
    if (forceShow) {
      setShow(true);
      return;
    }
    if (typeof window === 'undefined') return;
    if (hasGuestRoomPersistence()) {
      setShow(false);
      return;
    }
    void loadBrowserSupabaseClient().then(({ client, configured }) => {
      if (!configured || !client) {
        setShow(true);
        return;
      }
      void client.auth.getUser().then(({ data: { user } }) => {
        setShow(!user);
      });
    });
  }, [forceShow]);

  return show;
}

function SiteIntroVideo({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`.trim()}>
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-gray-700 bg-black">
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube.com/embed/${SITE_INTRO_YOUTUBE_VIDEO_ID}`}
          title="洋楽AIチャット（β版）の紹介動画"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
      <p className="text-center text-xs text-gray-500 lg:text-left">
        紹介動画（YouTubeで視聴できます）
      </p>
    </div>
  );
}

export function StartPageSiteIntro({
  forceShow = false,
  liveChatsAfterHero = false,
  section = 'all',
}: StartPageSiteIntroProps) {
  const show = useStartPageIntroVisible(forceShow);

  if (show !== true) return null;

  if (IS_MC_PRODUCT) {
    const mcIntro = (
      <>
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm">
          <p className="mb-2 font-medium text-gray-900">みんなで YouTube を同期視聴しながらチャット</p>
          <ul className="list-disc space-y-1 pl-5 leading-relaxed">
            <li>邦楽・洋楽どちらも選曲 OK</li>
            <li>完全無料（登録・ゲスト参加）</li>
            <li>同期視聴 × チャットに特化したサービスです</li>
          </ul>
        </div>
        <figure className="space-y-1.5">
          <Image
            src="/mc-service-sync-chat-musicchat.png"
            alt="同じタイミングで YouTube を視聴し、チャットで交流するイメージ"
            width={920}
            height={518}
            className="w-full rounded-lg border border-gray-200 bg-white"
            sizes={INTRO_IMAGE_SIZES}
          />
          <figcaption className="text-center text-xs text-gray-500 lg:text-left">
            みんなで同じタイミング視聴 × チャット
          </figcaption>
        </figure>
      </>
    );

    if (section === 'content') {
      return mcIntro;
    }

    return (
      <>
        <h1 className="mb-2 flex justify-center">
          <MusicChatTitleBrand />
        </h1>
        {mcIntro}
      </>
    );
  }

  const coverAndDescription = (
    <>
      <figure className="mb-4">
        <Image
          src="/musicaichat_cover_l_2.png"
          alt="洋楽AIチャット：同じタイミングでYouTubeを視聴し、チャットで交流するイメージ"
          width={1920}
          height={1071}
          className="w-full rounded-lg border border-gray-700 bg-gray-950"
          sizes={INTRO_IMAGE_SIZES}
          priority
        />
      </figure>
      {liveChatsAfterHero ? <ConsentPageLiveChats /> : null}
      <div className="mb-4 rounded-lg border border-gray-700 bg-gray-900/40 p-3 text-sm text-gray-300">
        <p className="mb-2 leading-relaxed">
          YouTubeの曲を参加者みんなで同じタイミングで聴きながら、チャットで交流できる洋楽サロンです。
        </p>
        <ul className="mb-2 list-disc space-y-1 pl-5 leading-relaxed">
          <li>みんなでYouTubeを同時視聴しながらチャットで会話</li>
          <li>ライブラリから洋楽を探して選曲</li>
          <li>曲を順番に選ぶときにAIが進行をサポート</li>
          <li>選曲した曲をAIが解説</li>
          <li>音楽に関する「@」質問にAIが回答</li>
        </ul>
        <p className="leading-relaxed text-gray-400">
          仲間と曲を共有しながら交流するのもよし！ひとりで解説や質問を通して理解を深めるのもよし！洋楽をより楽しむためのサービスです。
          {' '}
          <Link href="/guide/enjoy" className="text-sky-400 underline-offset-2 hover:underline">
            機能の一覧はこちら
          </Link>
        </p>
      </div>
      <div className={`space-y-5 ${section === 'content' ? '' : 'mb-6'}`}>
        <figure className="space-y-1.5">
          <Image
            src="/mc-service-sync-chat.png"
            alt="同じタイミングでYouTubeを視聴し、チャットで交流する洋楽サロンのイメージ"
            width={920}
            height={518}
            className="w-full rounded-lg border border-gray-700 bg-gray-950"
            sizes={INTRO_IMAGE_SIZES}
          />
          <figcaption className="text-center text-xs text-gray-500 lg:text-left">
            みんなで同じタイミング視聴 × チャット
          </figcaption>
        </figure>
        <figure className="space-y-1.5">
          <Image
            src="/mc-service-ai-roles.png"
            alt="AIが選曲の進行・曲の解説・音楽の質問に応えるイメージ"
            width={920}
            height={518}
            className="w-full rounded-lg border border-gray-700 bg-gray-950"
            sizes={INTRO_IMAGE_SIZES}
          />
          <figcaption className="text-center text-xs text-gray-500 lg:text-left">
            AIの主な役割（進行・解説・質問対応）
          </figcaption>
        </figure>
      </div>
    </>
  );

  if (section === 'content') {
    return (
      <>
        {coverAndDescription}
        <SiteIntroVideo />
      </>
    );
  }

  return (
    <>
      <h1 className="mb-2 text-center text-xl font-bold text-white">洋楽AIチャット（β版）</h1>
      {coverAndDescription}
      <SiteIntroVideo />
    </>
  );
}

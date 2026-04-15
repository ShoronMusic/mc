'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { GUEST_STORAGE_KEY } from '@/components/auth/JoinChoice';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

/**
 * 未ログイン・ゲスト未確定のときだけサービス説明とイメージを表示する。
 * ログイン後やゲスト参加確定後は TopPageAuthBar と同様に非表示。
 */
interface StartPageSiteIntroProps {
  /** 同意画面などで未ログイン判定をスキップして常時表示する */
  forceShow?: boolean;
}

export function StartPageSiteIntro({ forceShow = false }: StartPageSiteIntroProps) {
  const [show, setShow] = useState<boolean | null>(null);

  useEffect(() => {
    if (forceShow) {
      setShow(true);
      return;
    }
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(GUEST_STORAGE_KEY)) {
      setShow(false);
      return;
    }
    const supabase = createClient();
    if (!isSupabaseConfigured() || !supabase) {
      setShow(true);
      return;
    }
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setShow(!session?.user);
    });
  }, [forceShow]);

  if (show !== true) return null;

  return (
    <>
      <h1 className="mb-2 text-center text-xl font-bold text-white">洋楽AIチャット（β版）</h1>
      <figure className="mb-4">
        <Image
          src="/musicaichat_cover_l.png"
          alt="洋楽AIチャット：同じタイミングでYouTubeを視聴し、チャットで交流するイメージ"
          width={1920}
          height={1071}
          className="w-full rounded-lg border border-gray-700 bg-gray-950"
          sizes="(max-width: 512px) 100vw, 448px"
          priority
        />
      </figure>
      <div className="mb-4 rounded-lg border border-gray-700 bg-gray-900/40 p-3 text-sm text-gray-300">
        <p className="mb-2 leading-relaxed">
          YouTubeの曲を参加者みんなで同じタイミングで聴きながら、チャットで交流できる洋楽サロンです。
        </p>
        <ul className="mb-2 list-disc space-y-1 pl-5 leading-relaxed">
          <li>みんなでYouTubeを同時視聴しながらチャットで会話</li>
          <li>曲を順番に選ぶときにAIが進行をサポート</li>
          <li>選曲した曲をAIが解説</li>
          <li>音楽に関する「@」質問にAIが回答</li>
        </ul>
        <p className="leading-relaxed text-gray-400">
          仲間と曲を共有しながら交流するのもよし！ひとりで解説や質問を通して理解を深めるのもよし！洋楽をより楽しむためのサービスです。
        </p>
      </div>
      <div className="mb-6 space-y-5">
        <figure className="space-y-1.5">
          <Image
            src="/mc-service-sync-chat.png"
            alt="同じタイミングでYouTubeを視聴し、チャットで交流する洋楽サロンのイメージ"
            width={920}
            height={518}
            className="w-full rounded-lg border border-gray-700 bg-gray-950"
            sizes="(max-width: 512px) 100vw, 448px"
          />
          <figcaption className="text-center text-xs text-gray-500">
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
            sizes="(max-width: 512px) 100vw, 448px"
          />
          <figcaption className="text-center text-xs text-gray-500">
            AIの主な役割（進行・解説・質問対応）
          </figcaption>
        </figure>
      </div>
    </>
  );
}

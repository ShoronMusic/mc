'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { GUEST_STORAGE_KEY } from '@/components/auth/JoinChoice';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

/**
 * 未ログイン・ゲスト未確定のときだけサービス説明とイメージを表示する。
 * ログイン後やゲスト参加確定後は TopPageAuthBar と同様に非表示。
 */
export function StartPageSiteIntro() {
  const [show, setShow] = useState<boolean | null>(null);

  useEffect(() => {
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
  }, []);

  if (show !== true) return null;

  return (
    <>
      <h1 className="mb-2 text-center text-xl font-bold text-white">洋楽AIチャット</h1>
      <p className="mb-4 text-center text-sm leading-relaxed text-gray-300">
        YouTubeの曲を参加者みんなで同じタイミングで聴きながら、チャットで交流する洋楽サロンです。AIの大きな役割は、順番に選曲していく進行のサポートと、選ばれた曲の解説です。おひとりでも解説で楽しめ、音楽のことなら「@」の質問にも応じます。まだ未熟なところもありますが、一緒に洋楽を楽しむ時間に少しでも役立てば──という試みのサービスです。
      </p>
      <div className="mb-6 space-y-5">
        <figure className="space-y-1.5">
          <Image
            src="/mc-service-sync-chat.png"
            alt="同じタイミングでYouTubeを視聴し、チャットで交流する洋楽サロンのイメージ"
            width={920}
            height={518}
            className="w-full rounded-lg border border-gray-700 bg-gray-950"
            sizes="(max-width: 512px) 100vw, 448px"
            priority
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

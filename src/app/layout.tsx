import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import './globals.css';
import GoogleAnalytics from '@/components/analytics/GoogleAnalytics';
import PwaDisplayModeAnalytics from '@/components/pwa/PwaDisplayModeAnalytics';
import PwaInstallHint from '@/components/pwa/PwaInstallHint';
import { McUiAccentThemeSync } from '@/components/mc/McUiAccentThemeSync';
import { getProductId, getProductTheme, isMcProduct } from '@/lib/product-mode';

/** OAuth 戻りが Site URL 直下に ?code= で付いたとき、React・同意ゲートより先に /auth/callback へ送る */
const OAUTH_STRAY_CODE_SCRIPT = `
(function(){
  try {
    var path = window.location.pathname || '';
    if (path.indexOf('/auth/callback') === 0) return;
    var sp = new URLSearchParams(window.location.search);
    var hasCode = !!sp.get('code');
    var hasState = !!sp.get('state');
    if (!hasCode) return;
    if (!hasState && path !== '/') return;
    var cb = new URL('/auth/callback', window.location.origin);
    sp.forEach(function(v, k) { cb.searchParams.set(k, v); });
    var next = cb.searchParams.get('next');
    if (!next || next.charAt(0) !== '/') {
      cb.searchParams.set('next', path === '/' ? '/' : path);
    }
    next = cb.searchParams.get('next');
    if (path === '/' && next === '/') {
      var parts = ('; ' + document.cookie).split('; mc_oauth_next=');
      if (parts.length === 2) {
        var c = decodeURIComponent(parts.pop().split(';').shift() || '');
        if (c && c.charAt(0) === '/' && c.indexOf('//') !== 0 && (c === '/' || /^\\/[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(c))) {
          cb.searchParams.set('next', c);
        }
      }
    }
    document.cookie = 'mc_oauth_next=; Path=/; Max-Age=0';
    window.location.replace(cb.pathname + cb.search);
  } catch (e) {}
})();
`.trim();

export function generateMetadata(): Metadata {
  if (isMcProduct()) {
    return {
      title: 'Music Chat（β版）',
      description:
        '邦楽も洋楽も、YouTube同期視聴×チャット。完全無料。みんなで選曲して一緒に聴こう。',
      manifest: '/manifest.webmanifest',
      appleWebApp: {
        capable: true,
        title: 'Music Chat',
        statusBarStyle: 'default',
      },
      icons: {
        icon: [{ url: '/musicchat_icon.png', type: 'image/png' }],
        apple: '/musicchat_icon.png',
      },
    };
  }

  return {
    title: '洋楽AIチャット（β版）',
    description:
      'YouTube同時視聴×チャットで洋楽を楽しむ。AIが選曲の進行と曲解説をサポート。おひとりでも、音楽の質問でも。',
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      title: '洋楽AIチャット',
      statusBarStyle: 'black-translucent',
    },
    icons: {
      icon: [{ url: '/Music_AI_Chat_logo_fabicon.png', type: 'image/png' }],
      apple: '/Music_AI_Chat_logo_fabicon.png',
    },
  };
}

export function generateViewport(): Viewport {
  return {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor: isMcProduct() ? '#fafafa' : '#222222',
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? '';
  const theme = getProductTheme();
  const product = getProductId();

  return (
    <html lang="ja" data-theme={theme} data-product={product}>
      <body className="antialiased min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        {/* next/script の beforeInteractive はルート layout ＋ dev で RSC 経由時に undefined 参照になることがあるため素の script で出す */}
        <script
          id="oauth-stray-code-fix"
          dangerouslySetInnerHTML={{ __html: OAUTH_STRAY_CODE_SCRIPT }}
        />
        <Suspense fallback={null}>
          <GoogleAnalytics measurementId={gaMeasurementId} />
        </Suspense>
        <Suspense fallback={null}>
          <PwaDisplayModeAnalytics />
        </Suspense>
        {children}
        {isMcProduct() ? <McUiAccentThemeSync /> : null}
        <PwaInstallHint />
      </body>
    </html>
  );
}

/** @type {import('next').NextConfig} */
const product = process.env.NEXT_PUBLIC_PRODUCT?.trim().toLowerCase();
/**
 * ローカルで ma/mc 同時 dev するときだけ .next-mc を使う。
 * Vercel は常に .next を探すため、本番/プレビューでは distDir を変えない。
 */
const distDir =
  process.env.VERCEL !== '1' && product === 'musicchat' ? '.next-mc' : '.next';

const nextConfig = {
  distDir,
  // CI / Vercel では npm run lint を別途実行するため、next build 内の ESLint を省略してメモリ・時間を節約
  eslint: {
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [{ source: '/favicon.ico', destination: '/musicAI_icon.png', permanent: false }];
  },
  // 開発時にページチャンクが破棄→再コンパイル待ちで ChunkLoadError になるのを緩和
  onDemandEntries: {
    maxInactiveAge: 60 * 60 * 1000,
    pagesBufferLength: 8,
  },
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/wp/**',
          '**/.next/**',
          '**/.next-mc/**',
          '**/_work/**',
          '**/videosozai/**',
        ],
      };
    }
    if (dev && !isServer) {
      // 既定 120s。Windows で初回コンパイルが遅いと app/layout.js が timeout する
      config.output = config.output || {};
      config.output.chunkLoadTimeout = 300000;
    }
    return config;
  },
  // Supabase をサーバーバンドルから外し、vendor-chunks 欠落（Cannot find module './vendor-chunks/@supabase.js'）を防ぐ
  experimental: {
    serverComponentsExternalPackages: [
      '@supabase/supabase-js',
      '@supabase/ssr',
      '@supabase/realtime-js',
      '@supabase/postgrest-js',
      '@supabase/storage-js',
      '@supabase/functions-js',
      // vendor-chunks/ably.js 欠落（不完全ビルド・分割不整合）を避ける
      'ably',
      // vendor-chunks/@heroicons.js 欠落（.next 不整合時に [roomId] SSR で再現することがある）
      '@heroicons/react',
    ],
  },
};

export default nextConfig;

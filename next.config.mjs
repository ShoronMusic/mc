/** @type {import('next').NextConfig} */
const nextConfig = {
  // CI / Vercel では npm run lint を別途実行するため、next build 内の ESLint を省略してメモリ・時間を節約
  eslint: {
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [{ source: '/favicon.ico', destination: '/musicAI_icon.png', permanent: false }];
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

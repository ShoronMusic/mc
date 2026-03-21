/** @type {import('next').NextConfig} */
const nextConfig = {
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
    ],
  },
};

export default nextConfig;

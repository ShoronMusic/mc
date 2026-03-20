import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '洋楽AIチャット',
  description: 'AIと語る、YouTube同時視聴型・洋楽サロン',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        {children}
      </body>
    </html>
  );
}

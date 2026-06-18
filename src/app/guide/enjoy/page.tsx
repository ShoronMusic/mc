import type { Metadata } from 'next';
import { Suspense } from 'react';
import { GuideEnjoyFeatureList } from '@/components/guide/GuideEnjoyFeatureList';

export const metadata: Metadata = {
  title: '楽しみ方 | 洋楽AIチャット（β版）',
  description:
    '洋楽AIチャット（Music AI Chat）の基本機能・ライブラリ・AI機能・マイページなど、楽しみ方を分類して紹介します。',
};

export default function GuideEnjoyPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">読み込み中…</p>}>
      <GuideEnjoyFeatureList />
    </Suspense>
  );
}

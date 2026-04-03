import type { ReactNode } from 'react';
import { GuideLayoutShell } from '@/components/guide/GuideLayoutShell';

export default function GuideLayout({ children }: { children: ReactNode }) {
  return <GuideLayoutShell>{children}</GuideLayoutShell>;
}

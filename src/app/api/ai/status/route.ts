import { NextResponse } from 'next/server';
import { buildAiStatusSnapshot } from '@/lib/ai-status-snapshot';
import { renderAiStatusHtmlPage } from '@/lib/ai-status-html-page';

export const dynamic = 'force-dynamic';

function prefersHtmlResponse(request: Request): boolean {
  const format = new URL(request.url).searchParams.get('format');
  if (format === 'json') return false;
  if (format === 'html') return true;
  const accept = request.headers.get('accept') ?? '';
  if (accept.includes('application/json') && !accept.includes('text/html')) return false;
  return accept.includes('text/html');
}

export async function GET(request: Request) {
  const snapshot = await buildAiStatusSnapshot();

  if (prefersHtmlResponse(request)) {
    const pageUrl = new URL(request.url);
    pageUrl.searchParams.delete('format');
    const html = renderAiStatusHtmlPage(snapshot, pageUrl.pathname + pageUrl.search);
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.json(snapshot, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

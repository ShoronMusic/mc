import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';

export const dynamic = 'force-dynamic';

const PAGE = 500;
const MAX_ROWS = 20_000;

function csvEscapeCell(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

type Row = Record<string, unknown>;

function rowToCsvLine(row: Row, columns: string[]): string {
  return columns
    .map((col) => {
      const v = row[col];
      if (v == null) return '';
      if (typeof v === 'string') return csvEscapeCell(v);
      if (typeof v === 'number' || typeof v === 'boolean') return csvEscapeCell(String(v));
      return csvEscapeCell(JSON.stringify(v));
    })
    .join(',');
}

/**
 * STYLE_ADMIN + service_role。チューニング報告の一括エクスポート。
 */
export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const sp = new URL(request.url).searchParams;
  const format = (sp.get('format') || 'json').toLowerCase();
  if (format !== 'json' && format !== 'csv') {
    return NextResponse.json({ error: 'format は json または csv を指定してください。' }, { status: 400 });
  }

  const rows: Row[] = [];
  let offset = 0;
  while (rows.length < MAX_ROWS) {
    const { data, error } = await admin
      .from('ai_chat_conversation_tuning_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1);

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json(
          {
            error: 'ai_chat_conversation_tuning_reports テーブルがありません。',
            hint: 'docs/supabase-setup.md の「11.2 AI チャットチューニング報告」の SQL を実行してください。',
          },
          { status: 503 },
        );
      }
      console.error('[admin/ai-chat-tuning-reports/export]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'json') {
    const body = JSON.stringify(rows, null, 2);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="ai_chat_conversation_tuning_reports_${stamp}.json"`,
      },
    });
  }

  const columns = [
    'id',
    'created_at',
    'reporter_user_id',
    'reporter_email',
    'room_id',
    'anchor_message_id',
    'anchor_message_type',
    'current_video_id',
    'moderator_note',
    'conversation_snapshot',
    'reviewed_at',
    'reviewed_by',
    'admin_note',
  ];
  const header = columns.join(',');
  const lines = [header, ...rows.map((r) => rowToCsvLine(r, columns))];
  const csv = '\uFEFF' + lines.join('\r\n');
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ai_chat_conversation_tuning_reports_${stamp}.csv"`,
    },
  });
}

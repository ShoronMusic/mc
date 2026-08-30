import type { AiStatusSnapshot } from '@/lib/ai-status-snapshot';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatJpy(n: number): string {
  if (n < 1) return `¥${n.toFixed(2)}`;
  return `¥${Math.round(n).toLocaleString('ja-JP')}`;
}

function formatJst(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  } catch {
    return iso;
  }
}

function reasonLabelJa(reason: AiStatusSnapshot['aiOperations']['reason']): string {
  if (reason === 'manual_kill_switch') return '手動キルスイッチ';
  if (reason === 'monthly_budget_exceeded') return '月次変動費上限超過';
  return '—';
}

function boolJa(v: boolean): string {
  return v ? 'ON' : 'OFF';
}

export function renderAiStatusHtmlPage(snapshot: AiStatusSnapshot, pageUrl: string): string {
  const ops = snapshot.aiOperations;
  const halted = ops.halted;
  const statusClass = halted ? 'halted' : 'ok';
  const statusLabel = halted ? 'AI 停止中' : 'AI 稼働中';
  const barWidth = ops.usagePercent != null ? Math.max(0, Math.min(100, ops.usagePercent)) : 0;
  const barTone = barWidth >= 90 ? 'danger' : barWidth >= 70 ? 'warn' : 'ok';

  const rows: { label: string; value: string }[] = [
    { label: 'Gemini', value: boolJa(snapshot.gemini) },
    { label: 'YouTube 検索 API', value: boolJa(snapshot.youtube) },
    {
      label: '生成モデル',
      value: esc(snapshot.geminiGeneration.primaryModel ?? '—'),
    },
    {
      label: 'エージェント選曲モデル',
      value: esc(snapshot.geminiGeneration.characterSongPickModel ?? '—'),
    },
    {
      label: '月次リミッター',
      value: ops.monthlyBudgetEnabled ? '有効' : '無効',
    },
    { label: '対象月 (JST)', value: esc(ops.monthKeyJst) },
    {
      label: '当月変動費（試算）',
      value: formatJpy(ops.variableCostJpyApprox),
    },
    {
      label: '上限',
      value: ops.monthlyBudgetEnabled ? formatJpy(ops.budgetJpy) : '—',
    },
    {
      label: '次に聴くなら',
      value: boolJa(snapshot.nextSongRecommend.masterEnabled),
    },
    {
      label: 'セキュリティ警告',
      value:
        snapshot.securityHardening.warnings.length > 0
          ? esc(snapshot.securityHardening.warnings.join(' / '))
          : 'なし',
    },
    { label: '集計更新', value: formatJst(ops.checkedAtIso) },
    { label: 'ページ取得', value: formatJst(snapshot.fetchedAtIso) },
  ];

  if (halted) {
    rows.splice(4, 0, { label: '停止理由', value: reasonLabelJa(ops.reason) });
  }

  const tableRows = rows
    .map(
      (r) =>
        `<tr><th scope="row">${esc(r.label)}</th><td>${r.value}</td></tr>`,
    )
    .join('');

  const budgetBlock = ops.monthlyBudgetEnabled
    ? `<div class="meter-wrap">
        <div class="meter-label">
          <span>当月使用率（試算）</span>
          <span>${ops.usagePercent != null ? `${ops.usagePercent.toFixed(1)}%` : '—'}</span>
        </div>
        <div class="meter" role="progressbar" aria-valuenow="${barWidth.toFixed(1)}" aria-valuemin="0" aria-valuemax="100">
          <div class="meter-fill ${barTone}" style="width:${barWidth.toFixed(2)}%"></div>
        </div>
      </div>`
    : `<p class="note">月次変動費リミッターは無効です（<code>AI_MONTHLY_VARIABLE_BUDGET_ENABLED=1</code> で有効化）。</p>`;

  const alertBlock =
    halted && ops.messageJa
      ? `<div class="alert">${esc(ops.messageJa)}</div>`
      : '';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="60" />
  <title>AI 稼働ステータス — musicaichat</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0f1419;
      --card: #1a2332;
      --border: #2d3a4d;
      --text: #e8eef7;
      --muted: #94a3b8;
      --ok: #22c55e;
      --warn: #f59e0b;
      --danger: #ef4444;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", "Hiragino Sans", "Yu Gothic UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 1.25rem;
    }
    main { max-width: 40rem; margin: 0 auto; }
    h1 { font-size: 1.25rem; margin: 0 0 0.25rem; font-weight: 600; }
    .sub { color: var(--muted); font-size: 0.875rem; margin-bottom: 1.25rem; }
    .badge {
      display: inline-block;
      padding: 0.35rem 0.75rem;
      border-radius: 999px;
      font-size: 0.95rem;
      font-weight: 700;
      margin-bottom: 1rem;
    }
    .badge.ok { background: rgba(34, 197, 94, 0.15); color: #86efac; border: 1px solid rgba(34, 197, 94, 0.35); }
    .badge.halted { background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.35); }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1rem 1.1rem;
      margin-bottom: 1rem;
    }
    table { width: 100%; border-collapse: collapse; font-size: 0.9375rem; }
    th, td { text-align: left; padding: 0.45rem 0; vertical-align: top; border-bottom: 1px solid var(--border); }
    tr:last-child th, tr:last-child td { border-bottom: none; }
    th { width: 42%; color: var(--muted); font-weight: 500; }
    td code { font-size: 0.85em; }
    .meter-wrap { margin-top: 0.25rem; }
    .meter-label { display: flex; justify-content: space-between; font-size: 0.875rem; color: var(--muted); margin-bottom: 0.35rem; }
    .meter { height: 10px; background: #0f1419; border-radius: 999px; overflow: hidden; border: 1px solid var(--border); }
    .meter-fill { height: 100%; border-radius: 999px; transition: width 0.3s ease; }
    .meter-fill.ok { background: linear-gradient(90deg, #16a34a, #22c55e); }
    .meter-fill.warn { background: linear-gradient(90deg, #d97706, #f59e0b); }
    .meter-fill.danger { background: linear-gradient(90deg, #dc2626, #ef4444); }
    .alert {
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.35);
      color: #fecaca;
      padding: 0.75rem 0.9rem;
      border-radius: 8px;
      margin-bottom: 1rem;
      font-size: 0.9rem;
    }
    .note { color: var(--muted); font-size: 0.875rem; margin: 0; }
    .links { font-size: 0.8125rem; color: var(--muted); }
    .links a { color: #93c5fd; }
  </style>
</head>
<body>
  <main>
    <h1>AI 稼働ステータス</h1>
    <p class="sub">musicaichat 運用確認用 · 60秒ごとに自動更新</p>
    <div class="badge ${statusClass}">${esc(statusLabel)}</div>
    ${alertBlock}
    <section class="card">
      ${budgetBlock}
    </section>
    <section class="card">
      <table>${tableRows}</table>
    </section>
    <p class="links">
      <a href="${esc(pageUrl)}?format=json">JSON</a>
      · <a href="/admin/gemini-usage">Gemini 利用ログ</a>
      · <a href="/admin/room-cost-summary">部屋原価</a>
    </p>
  </main>
</body>
</html>`;
}

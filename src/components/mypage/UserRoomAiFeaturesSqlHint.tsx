'use client';

import { useCallback, useState } from 'react';
import {
  USER_ROOM_AI_FEATURES_ADD_COLUMN_SQL,
  USER_ROOM_AI_FEATURES_FULL_SETUP_SQL,
} from '@/lib/user-room-ai-features';

function SqlCopyBlock({
  label,
  description,
  sql,
}: {
  label: string;
  description: string;
  sql: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [sql]);

  return (
    <div className="rounded border border-amber-800/50 bg-gray-950/80 p-2">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-amber-100">{label}</p>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="shrink-0 rounded border border-amber-700/60 bg-amber-950/50 px-2 py-1 text-[11px] text-amber-100 hover:bg-amber-900/40"
        >
          {copied ? 'コピーしました' : 'SQLをコピー'}
        </button>
      </div>
      <p className="mb-1.5 text-[11px] leading-relaxed text-gray-400">{description}</p>
      <pre className="mc-scrollbar-stable max-h-40 overflow-auto whitespace-pre-wrap break-all rounded border border-gray-800 bg-gray-900/90 p-2 font-mono text-[10px] leading-relaxed text-gray-200 select-all">
        {sql}
      </pre>
    </div>
  );
}

export function UserRoomAiFeaturesSqlHint() {
  return (
    <div className="mt-2 space-y-2">
      <SqlCopyBlock
        label="列の追加だけ（まずこちら）"
        description="テーブルはあるが policy already exists で止まった場合など。Supabase SQL Editor に貼って実行してください。"
        sql={USER_ROOM_AI_FEATURES_ADD_COLUMN_SQL}
      />
      <SqlCopyBlock
        label="初回セットアップ用（全文・再実行可）"
        description="テーブル自体が無いとき、または上記だけでは直らないとき。詳細は docs/supabase-setup.md 第 17 章。"
        sql={USER_ROOM_AI_FEATURES_FULL_SETUP_SQL}
      />
    </div>
  );
}

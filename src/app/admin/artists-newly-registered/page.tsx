'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import type {
  ArtistsNewlyRegisteredDay,
} from '@/app/api/admin/artists-newly-registered/route';

function fmtJst(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  } catch {
    return iso;
  }
}

type AutoMergePair = {
  keepId: string;
  keepName: string | null;
  loseId: string;
  loseName: string | null;
  reasons: string[];
};

type AutoMergeResponse = {
  ok?: boolean;
  error?: string;
  dryRun?: boolean;
  pairsFound?: number;
  pairs?: AutoMergePair[];
  merged?: Array<{
    keepId: string;
    loseId: string;
    loseDeleted: boolean;
    mainArtistUpdated: number;
    songsArtistIdUpdated: number;
    skippedReason?: string;
  }>;
};

export default function AdminArtistsNewlyRegisteredPage() {
  const [days, setDays] = useState(14);
  const [pendingOnly, setPendingOnly] = useState(true);
  const [hideSuperseded, setHideSuperseded] = useState(true);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mergeMsg, setMergeMsg] = useState<string | null>(null);
  const [dayGroups, setDayGroups] = useState<ArtistsNewlyRegisteredDay[]>([]);
  const [total, setTotal] = useState(0);
  const [hiddenSuperseded, setHiddenSuperseded] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        days: String(days),
        pending_wp: pendingOnly ? '1' : '0',
        hide_superseded: hideSuperseded ? '1' : '0',
      });
      const res = await fetch(`/api/admin/artists-newly-registered?${q}`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : '取得に失敗しました。');
        setDayGroups([]);
        return;
      }
      setDayGroups(Array.isArray(data.days) ? data.days : []);
      setTotal(typeof data.total_items === 'number' ? data.total_items : 0);
      setHiddenSuperseded(typeof data.hidden_superseded === 'number' ? data.hidden_superseded : 0);
    } catch {
      setError('取得に失敗しました。');
      setDayGroups([]);
    } finally {
      setLoading(false);
    }
  }, [days, pendingOnly, hideSuperseded]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAutoMerge = async (dryRun: boolean) => {
    if (!dryRun) {
      const ok = window.confirm(
        '高信頼の重複アーティストを自動マージします。\n（空白差・同一 Spotify/m8・日本語名↔英語名の一致）\n続行しますか？',
      );
      if (!ok) return;
    }
    setMerging(true);
    setMergeMsg(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/artists/merge', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'auto', dryRun, sinceDays: Math.max(days, 90) }),
      });
      const data = (await res.json().catch(() => ({}))) as AutoMergeResponse;
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'マージに失敗しました。');
        return;
      }
      const pairs = data.pairs ?? [];
      const lines = pairs.slice(0, 12).map(
        (p) => `・${p.loseName ?? p.loseId} → ${p.keepName ?? p.keepId}（${p.reasons.join(', ')}）`,
      );
      const more = pairs.length > 12 ? `\n…他 ${pairs.length - 12} 組` : '';
      if (dryRun) {
        setMergeMsg(
          `プレビュー: ${data.pairsFound ?? 0} 組\n${lines.join('\n')}${more}\n（まだDBは変更していません）`,
        );
      } else {
        const deleted = (data.merged ?? []).filter((m) => m.loseDeleted).length;
        setMergeMsg(
          `マージ完了: ${data.pairsFound ?? 0} 組（削除 ${deleted}）\n${lines.join('\n')}${more}`,
        );
        await load();
      }
    } catch {
      setError('マージに失敗しました。');
    } finally {
      setMerging(false);
    }
  };

  const deleteUnusedArtist = async (item: { id: string; name: string | null }) => {
    const name = (item.name ?? '').trim();
    if (!name) {
      setError('表示名が空のため削除できません。');
      return;
    }
    const ok = window.confirm(
      `「${name}」を artists から削除します。\n曲参照（songs.artist_id / main_artist）がある場合は拒否されます。\nよろしいですか？`,
    );
    if (!ok) return;

    setDeletingId(item.id);
    setError(null);
    setMergeMsg(null);
    try {
      const res = await fetch('/api/admin/artists/delete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId: item.id, confirmName: name }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : '削除に失敗しました。');
        return;
      }
      setMergeMsg(`削除しました: ${name}`);
      await load();
    } catch {
      setError('削除に失敗しました。');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <AdminMenuBar />
      <div className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="text-xl font-semibold">選曲登録アーティスト（日別）</h1>
        <p className="mt-1 text-sm text-gray-400">
          選曲時に新規 insert された artists の確認用です（未整備のスタブ洗い出し）。
          「WP 未照会のみ」は Music8 未照会かつ、邦楽登録のプロフィール／Spotify 等が未入力の行だけを表示します。
          ライブラリ詳細は閲覧のみ。プロフィール整備は「邦楽登録で編集」から。
          正本がある別名行は既定で非表示。レーベル名などの誤登録は各行の「削除」から。
        </p>
        <div className="mt-3 rounded-lg border border-sky-900/50 bg-sky-950/30 px-3 py-2 text-xs leading-relaxed text-sky-100/90">
          <p className="font-medium text-sky-200">邦楽アーティストを整備する手順</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-gray-300">
            <li>
              この一覧の行から「邦楽登録で編集」→ 内容確認 → DB 保存
              （選曲でできた行をそのまま育てる）
            </li>
            <li>
              ゼロから作る場合は{' '}
              <Link href="/admin/domestic-artist-register/new" className="text-sky-300 hover:underline">
                邦楽アーティスト新規登録
              </Link>
              → 名前入力 → 「① 既存を読込」または「② AIで生成」→ 保存
            </li>
            <li>
              登録済み一覧は{' '}
              <Link href="/admin/domestic-artist-register" className="text-sky-300 hover:underline">
                邦楽アーティスト登録
              </Link>
            </li>
          </ol>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            日数
            <input
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || 14)}
              className="ml-2 w-16 rounded border border-gray-700 bg-gray-900 px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={pendingOnly}
              onChange={(e) => setPendingOnly(e.target.checked)}
            />
            WP 未照会・未整備のみ
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hideSuperseded}
              onChange={(e) => setHideSuperseded(e.target.checked)}
            />
            正本がある重複を隠す
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded bg-sky-700 px-3 py-1.5 text-sm hover:bg-sky-600 disabled:opacity-50"
          >
            {loading ? '読込中…' : '再読込'}
          </button>
          <button
            type="button"
            onClick={() => void runAutoMerge(true)}
            disabled={merging}
            className="rounded border border-amber-700/70 bg-amber-950/40 px-3 py-1.5 text-sm text-amber-100 hover:bg-amber-900/50 disabled:opacity-50"
          >
            {merging ? '処理中…' : '重複プレビュー'}
          </button>
          <button
            type="button"
            onClick={() => void runAutoMerge(false)}
            disabled={merging}
            className="rounded bg-emerald-800 px-3 py-1.5 text-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            高信頼を自動マージ
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        {mergeMsg && (
          <pre className="mt-3 whitespace-pre-wrap rounded border border-gray-700 bg-gray-900/60 p-3 text-xs text-gray-200">
            {mergeMsg}
          </pre>
        )}
        <p className="mt-2 text-sm text-gray-500">
          合計 {total} 件
          {hiddenSuperseded > 0 ? `（正本ありの重複を ${hiddenSuperseded} 件非表示）` : ''}
        </p>
        <div className="mt-6 space-y-8">
          {dayGroups.map((g) => (
            <section key={g.date}>
              <h2 className="border-b border-gray-800 pb-1 text-lg font-medium">{g.date}</h2>
              <ul className="mt-2 divide-y divide-gray-800">
                {g.items.map((item) => (
                  <li key={item.id} className="py-2 text-sm">
                    <div className="font-medium">{item.name ?? '—'}</div>
                    <div className="text-gray-500">
                      slug: <code className="text-gray-400">{item.music8_artist_slug ?? '—'}</code>
                      {item.name_base && (
                        <>
                          {' '}
                          · base: {item.name_base}
                          {item.the_prefix ? ` · prefix: ${item.the_prefix}` : ''}
                        </>
                      )}
                    </div>
                    <div className="text-gray-600">{fmtJst(item.created_at)}</div>
                    {item.superseded_by ? (
                      <p className="mt-1 text-xs text-amber-200/90">
                        ※ 正本ありの重複候補 → {item.superseded_by.name ?? item.superseded_by.id}
                        （「高信頼を自動マージ」で整理できます）
                      </p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Link
                        href={`/admin/domestic-artist-register/${item.id}`}
                        className="font-medium text-emerald-400 hover:underline"
                      >
                        邦楽登録で編集
                      </Link>
                      {item.admin_artist_href ? (
                        <Link href={item.admin_artist_href} className="text-sky-400 hover:underline">
                          ライブラリ（閲覧）
                        </Link>
                      ) : null}
                      {item.name ? (
                        <Link
                          href={`/admin/domestic-artist-register/new?name=${encodeURIComponent(item.name)}&autoload=1`}
                          className="text-gray-400 hover:underline"
                        >
                          名前で新規画面を開く
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        disabled={deletingId === item.id || merging || loading}
                        onClick={() => void deleteUnusedArtist(item)}
                        className="text-red-400 hover:underline disabled:opacity-50"
                        title="曲参照が無いスタブ（レーベル名の誤登録など）向け"
                      >
                        {deletingId === item.id ? '削除中…' : '削除'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

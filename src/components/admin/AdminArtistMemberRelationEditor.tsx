'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { AdminMemberHintStatus, ArtistMemberLink } from '@/lib/artist-members';
import { inputClass } from '@/components/admin/DomesticArtistRegisterParts';

type Role = 'band' | 'member';

type SearchResponse = {
  error?: string;
  items?: ArtistMemberLink[];
};

function linkLabel(link: ArtistMemberLink): string {
  const ja = (link.name_ja ?? '').trim();
  if (ja && ja.toLowerCase() !== link.name.trim().toLowerCase()) {
    return `${link.name}（${ja}）`;
  }
  return link.name;
}

function ArtistLinkChip({
  link,
  onRemove,
  disabled,
}: {
  link: ArtistMemberLink;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-100">
      <Link
        href={`/admin/domestic-artist-register/${link.id}`}
        className="truncate text-sky-300 hover:underline"
        title={linkLabel(link)}
      >
        {linkLabel(link)}
      </Link>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="shrink-0 rounded px-1 text-gray-500 hover:bg-gray-800 hover:text-red-300 disabled:opacity-40"
        aria-label={`${link.name} を外す`}
      >
        ×
      </button>
    </span>
  );
}

function ArtistSearchAdd({
  excludeId,
  excludeIds,
  onPick,
  placeholder,
  disabled,
}: {
  excludeId?: string | null;
  excludeIds: string[];
  onPick: (link: ArtistMemberLink) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<ArtistMemberLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exclude = useMemo(() => new Set(excludeIds), [excludeIds]);

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setItems([]);
      setError(null);
      return;
    }
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      setBusy(true);
      void (async () => {
        try {
          const res = await fetch(
            `/api/admin/domestic-artist-profile/artist-search?q=${encodeURIComponent(trimmed)}${
              excludeId ? `&excludeId=${encodeURIComponent(excludeId)}` : ''
            }`,
            { credentials: 'include', signal: ac.signal },
          );
          const data = (await res.json().catch(() => ({}))) as SearchResponse;
          if (!res.ok) {
            setError(data.error ?? '検索に失敗しました。');
            setItems([]);
            return;
          }
          setError(null);
          setItems((data.items ?? []).filter((item) => !exclude.has(item.id)));
        } catch (e) {
          if ((e as { name?: string })?.name === 'AbortError') return;
          setError('検索に失敗しました。');
          setItems([]);
        } finally {
          setBusy(false);
        }
      })();
    }, 280);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [q, exclude, excludeId]);

  return (
    <div className="relative">
      <input
        className={inputClass}
        value={q}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setQ(e.target.value)}
      />
      {busy ? <p className="mt-1 text-[11px] text-gray-500">検索中…</p> : null}
      {error ? <p className="mt-1 text-[11px] text-red-300">{error}</p> : null}
      {!busy && q.trim().length >= 2 && items.length === 0 && !error ? (
        <p className="mt-1 text-[11px] text-amber-200/90">
          マスタに一致する行がありません（自動作成しません）。先に相手アーティストを登録してください。
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded border border-gray-700 bg-gray-950 shadow-lg">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm text-gray-100 hover:bg-gray-800"
                onClick={() => {
                  onPick(item);
                  setQ('');
                  setItems([]);
                }}
              >
                <span>{linkLabel(item)}</span>
                {item.kind ? (
                  <span className="text-[11px] text-gray-500">{item.kind}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function AdminArtistMemberRelationEditor({
  selfId,
  bands,
  members,
  membersFallback,
  hints,
  onChange,
  disabled,
}: {
  selfId: string | null;
  bands: ArtistMemberLink[];
  members: ArtistMemberLink[];
  membersFallback: string | null;
  hints: AdminMemberHintStatus[];
  onChange: (next: { bands: ArtistMemberLink[]; members: ArtistMemberLink[] }) => void;
  disabled?: boolean;
}) {
  const excludeIds = useMemo(
    () => [selfId, ...bands.map((b) => b.id), ...members.map((m) => m.id)].filter(Boolean) as string[],
    [selfId, bands, members],
  );

  function add(role: Role, link: ArtistMemberLink): void {
    if (!link.id || excludeIds.includes(link.id)) return;
    if (role === 'band') {
      onChange({ bands: [...bands, link], members });
      return;
    }
    onChange({ bands, members: [...members, link] });
  }

  function remove(role: Role, id: string): void {
    if (role === 'band') {
      onChange({ bands: bands.filter((b) => b.id !== id), members });
      return;
    }
    onChange({ bands, members: members.filter((m) => m.id !== id) });
  }

  const pendingHints = hints.filter((h) => {
    if (h.matched && excludeIds.includes(h.matched.id)) return false;
    const name = h.name.trim().toLowerCase();
    const slug = (h.slug ?? '').trim().toLowerCase();
    return ![...bands, ...members].some((l) => {
      if (slug && (l.music8_artist_slug ?? '').trim().toLowerCase() === slug) return true;
      if (name && l.name.trim().toLowerCase() === name) return true;
      return false;
    });
  });

  return (
    <div className="sm:col-span-2 space-y-3 rounded-lg border border-sky-900/60 bg-sky-950/15 p-3">
      <div>
        <h3 className="text-sm font-semibold text-sky-100">所属関係（バンド ↔ メンバー）</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
          正本は <code className="text-gray-400">artist_members</code>
          。マスタにある相手だけリンクできます。DB保存時に反映します。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs text-gray-400">所属バンド</p>
          <div className="flex min-h-[2rem] flex-wrap gap-1.5">
            {bands.length === 0 ? (
              <span className="text-xs text-gray-600">なし</span>
            ) : (
              bands.map((link) => (
                <ArtistLinkChip
                  key={link.id}
                  link={link}
                  disabled={disabled}
                  onRemove={() => remove('band', link.id)}
                />
              ))
            )}
          </div>
          <ArtistSearchAdd
            excludeId={selfId}
            excludeIds={excludeIds}
            disabled={disabled}
            placeholder="バンド名で検索して追加"
            onPick={(link) => add('band', link)}
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs text-gray-400">メンバー</p>
          <div className="flex min-h-[2rem] flex-wrap gap-1.5">
            {members.length === 0 ? (
              <span className="text-xs text-gray-600">なし</span>
            ) : (
              members.map((link) => (
                <ArtistLinkChip
                  key={link.id}
                  link={link}
                  disabled={disabled}
                  onRemove={() => remove('member', link.id)}
                />
              ))
            )}
          </div>
          <ArtistSearchAdd
            excludeId={selfId}
            excludeIds={excludeIds}
            disabled={disabled}
            placeholder="メンバー名で検索して追加"
            onPick={(link) => add('member', link)}
          />
        </div>
      </div>

      {membersFallback ? (
        <p className="text-[11px] text-gray-500">
          参考（members 文字列）: <span className="text-gray-300">{membersFallback}</span>
        </p>
      ) : null}

      {pendingHints.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[11px] text-amber-200/90">Music8 member にあって未リンク</p>
          <ul className="space-y-1">
            {pendingHints.map((hint) => (
              <li
                key={`${hint.slug}:${hint.name}`}
                className="flex flex-wrap items-center gap-2 text-xs text-gray-300"
              >
                <span>
                  {hint.name}
                  {hint.matched ? (
                    <span className="text-gray-500"> → {linkLabel(hint.matched)}</span>
                  ) : (
                    <span className="text-gray-600">（マスタなし）</span>
                  )}
                </span>
                {hint.matched && !excludeIds.includes(hint.matched.id) ? (
                  <span className="flex gap-1">
                    {hint.roleGuess !== 'member' ? (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => add('band', hint.matched!)}
                        className="rounded border border-gray-700 px-1.5 py-0.5 text-[11px] text-sky-200 hover:bg-gray-800 disabled:opacity-40"
                      >
                        所属バンドに追加
                      </button>
                    ) : null}
                    {hint.roleGuess !== 'band' ? (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => add('member', hint.matched!)}
                        className="rounded border border-gray-700 px-1.5 py-0.5 text-[11px] text-sky-200 hover:bg-gray-800 disabled:opacity-40"
                      >
                        メンバーに追加
                      </button>
                    ) : null}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

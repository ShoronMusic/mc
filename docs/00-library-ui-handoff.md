# 部屋ライブラリ修正の引き継ぎ（E:\mc）

日付: 2026-08-30  
作業場所: **このリポジトリ（`E:\mc`）**。`E:\wp` にはコードを置かない。続きは Cursor で `E:\mc` を開く。

関連: [`00-music8-wp-to-supabase-tasks.md`](./00-music8-wp-to-supabase-tasks.md)

---

## このセッションで入れたもの

部屋ライブラリ（D アーティスト詳細 / F 曲詳細）:

- バンド ↔ メンバーリンク（`artist_members`）。個人ページは **所属バンド** のみ（`artists.members` のメンバー行は出さない）
- リンクは **相互記載がある組だけ**（WP の誤 member タクソノミーは捨てた）。apply 済み **55 件**
- 曲詳細の **曲解説** は 1 枠。Music8 曲紹介があればそれを優先して**全文**、無いときだけ保存済み AI 曲解説
- Music8 曲紹介から「ジャンル／ボーカル／スタイル」のタグ行を外す
- ボーカルは **F / M / F,M** のみ（無ければ行ごと非表示）

DB:

- `npx tsx scripts/backfill-artist-members.ts --apply` 済み（向きはバンド→メンバー）

方針（変えない）:

- マスタに無いアーティストは自動作成しない
- Music8 公開 JSON の `generate:all` は `E:\m8` 側。こちらで競合しない

---

## 主なファイル

- `src/lib/artist-members.ts` / `scripts/backfill-artist-members.ts`
- `src/components/chat/LibraryArtistProfileSummary.tsx` / `ChatInput.tsx`
- `src/components/chat/LibrarySongCommentary.tsx`
- `src/app/api/library/ai-commentary/route.ts`
- `src/app/api/library/artist-info/route.ts`
- `src/app/api/library/songs-by-artist/route.ts`

確認: `npm run test:artist-members`

---

## まだ残っていること

- 複数アーティスト未補完は約 183 曲。足りないマスタは手動。自動作成しない
- YT to M7 のコンパクト UI、アーティスト管理 UI、JSON 正本切替は別タスク
- チャート / 音声特徴量は未着手

---

## 次のチャットで最初に言うこと

「`E:\mc` の部屋ライブラリ続き。`docs/00-library-ui-handoff.md` を見て」

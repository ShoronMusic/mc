# Music8 → mc 週次同期コマンド

m8 で `update-all-data.js`（→ GCS）を実行し、`E:\m8\public\data` が最新になっていることを確認してから実行する。

## mc（毎回）

```powershell
cd E:\mc

# ① 差分計画（件数確認）
npx tsx scripts/diff-music8-sync-plan.ts `
  --songs-dir=E:\m8\public\data\songs `
  --artists-dir=E:\m8\public\data\artists `
  --artists-list=E:\m8\public\data\artists.json `
  --out-dir=tmp\music8-sync-plan-latest

# ② 本番投入（先に dry-run する場合は --apply を外す）
npx tsx scripts/apply-music8-sync-plan.ts `
  --manifest=tmp\music8-sync-plan-latest\manifest.json `
  --forward-file=tmp\music8-bulk-forward-args.txt `
  --apply
```

## 補足

- 件数が多いとき（目安: 2000 超）: `docs/music8-library-import-notes.md` のチャンク分割を参照。
- 初回フル取り込みはこの手順ではない（`music8-library-import-notes.md`）。

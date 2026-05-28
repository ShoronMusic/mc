# PWA・スマホアプリ化（索引）

スマホ向け PWA（および将来のストア版）に関する文書は **`docs/pwa-*.md`** に集約する。  
新規メモを増やすときは **本索引に行を足してから** 執筆する（ルートや `docs/` 直下への分散を避ける）。

**前提**: PC は Web のまま。開発は Cursor + Next.js + Vercel（特別な開発環境は不要）。

---

## 文書一覧（読む順）

| ファイル | 内容 |
|----------|------|
| **本書** `00-pwa-mobile-app.md` | 索引・進捗・命名規則 |
| `pwa-mobile-app-plan.md` | 方針・ロードマップ・整備項目・検討事項・データ更新 |
| `pwa-dev-verify-mobile.md` | 改修後のスマホ見え方・動作確認手順 |

**関連（別系列）**: `docs/chrome-extension-musicaichat.md`（PC）・`docs/my-list-spec.md`（スマホ入口）・`docs/monetization-options.md`（決済）

---

## 命名規則

| 規則 | 例 |
|------|-----|
| 索引は `00-pwa-` で先頭固定 | `00-pwa-mobile-app.md` |
| 詳細は `pwa-` + トピック（ケバブ） | `pwa-dev-verify-mobile.md` |
| フェーズ専用の分割は **Phase が大きくなったときのみ** | 例: `pwa-phase2-share-target.md`（未作成） |

---

## 進捗

### Phase 1 — PWA 基盤（進行中）

| ID | 項目 | 状態 | メモ |
|----|------|------|------|
| P1 | Web App Manifest | 済 | `public/manifest.webmanifest` |
| P4 | メタタグ・viewport | 済 | `src/app/layout.tsx` |
| P3 | インストール導線 UI | 済 | `src/components/pwa/PwaInstallHint.tsx` |
| P2 | Service Worker | 未 | 日々の UI 改修と両立する方針決定後 |
| P5 | safe-area 監査 | 未 | 部屋 UI 改修のたびに `pwa-dev-verify-mobile.md` |
| — | `npm run dev:lan` | 済 | スマホから LAN 確認用 |

### Phase 2 — 共有・OAuth 実機（未着手）

共有 URL 受け取り・マイリスト入口・OAuth standalone 検証（計画は `pwa-mobile-app-plan.md` §5）。

### Phase 3 — ストア版（未着手）

Capacitor 等。需要確定後。

---

## 実装の入口（コード）

| パス | 役割 |
|------|------|
| `public/manifest.webmanifest` | PWA マニフェスト |
| `src/app/layout.tsx` | manifest リンク・viewport・theme |
| `src/lib/pwa-client.ts` | standalone 判定・表示制御 |
| `src/components/pwa/PwaInstallHint.tsx` | ホーム画面追加の案内 |
| `src/components/pwa/PwaDisplayModeAnalytics.tsx` | GA4 へ display_mode（任意） |

---

## 更新ルール

- Phase 1 のタスク完了 → **本書の進捗表**を更新
- 方針・ロードマップ変更 → `pwa-mobile-app-plan.md`
- 確認手順の変更 → `pwa-dev-verify-mobile.md`
- `AGENTS.md` の心臓部表は索引への 1 行リンクのみ（詳細は分散しない）

---

*最終更新: 2026-05-28*

# Firestore JSON移行メモ（musicai.jp / music8）

## 前提

- 現状は、ローカルで大量JSON（約150MB）を生成
- ZIP圧縮してXサーバーへアップロード
- Xサーバー上で展開して運用
- JSON生成元は、Xサーバー上のWP（WPスクリプト / WP REST API想定）

## 結論（先に要点）

- 150MB級JSONを「そのまま」Firestoreへ移すのは非推奨
- 実運用は「Cloud Storage（保管・配信） + Firestore（検索用メタ）」の2層構成が現実的
- まず手間削減を優先するなら、移行先はCloud Storageが第一候補

## Firestore移行のメリット

- 条件検索がしやすい（ジャンル、年月、アーティストなど）
- Cloud Functions / Cloud Runと連携して取り込み自動化しやすい
- セキュリティルールでアクセス制御しやすい
- Webアプリ側SDKが整っており扱いやすい

## Firestore移行のデメリット（今回重要）

- 1ドキュメントサイズ上限（約1MiB）があり、巨大JSONを1つで保存できない
- 曲単位・月単位などへの分割設計が必須
- 書き込み / 読み取り課金でコストが増えやすい
- インデックス設計・保守の運用負荷がある
- 「ファイル置き場」としては過剰で、現行運用と思想が異なる

## 現状課題（手作業）への実務的な改善案

- 生データ保管はGoogle Cloud Storageへ移行
- 公開側（musicai.jp）はCloud Run API経由で必要部分のみ返却
- 検索機能が必要な範囲だけFirestore（またはBigQuery）を併用
- WP側の生成フローは維持しつつ、アップロード先をGCSに切り替える

## どの構成を選ぶべきか

- Firestore向き:
  - 曲単位検索、複合条件、ユーザー別表示などDB的要件が強い
- Firestore単体が不向き:
  - 150MB級のJSONを丸ごと保管・配信したいだけの場合
- バランス案（推奨）:
  - Cloud Storage + API（Cloud Run）+ 必要に応じてFirestore

## 期待できる運用改善

- 「アップロード → サーバー展開」の手作業を削減
- ローカル生成後の自動アップロード（CLI/API）へ一本化
- 圧縮JSONのまま取り扱う設計にしやすい

## アーティスト / ソング参照JSONの切り替え

- 変更対象:
  - アーティストデータ / ソングデータで参照検索するJSON
- 旧参照先（Xサーバー）:
  - `https://xs867261.xsrv.jp/data/data/`
- 新参照先（GCS）:
  - `gs://music8-json-prod/data/`（運用上の基準パス）
  - 公開HTTPで参照する場合は `https://storage.googleapis.com/music8-json-prod/data/`
- パス構成（`artistlist/`, `artists/`, `genres/`, `musicaichat/`, `songs/`, `styles/`）は従来のまま維持し、ベースパスのみ差し替える

## 別PCでも使える GCSアップロード手順（PowerShell）

前提:

- GCPプロジェクトID: `music8-a161a`
- バケット名: `music8-json-prod`
- ローカルJSONルート: `E:\m8\public\data`

### 1. Google Cloud CLIをインストール

管理者PowerShellで実行:

```powershell
winget install Google.CloudSDK
```

インストール後はPowerShellを再起動し、動作確認:

```powershell
gcloud --version
```

### 2. 認証

```powershell
gcloud auth login
```

ブラウザが開いたらGoogleアカウントでログインし、許可を完了する。

### 3. プロジェクト設定

```powershell
gcloud config set project music8-a161a
```

### 4. GCSへ同期（初回は全量、2回目以降は差分）

```powershell
gcloud storage rsync "E:\m8\public\data" gs://music8-json-prod/data --recursive
```

### 5. 同期結果の確認

```powershell
gcloud storage ls gs://music8-json-prod/data
gcloud storage ls gs://music8-json-prod/data/** | Measure-Object
```

### 6. よくあるエラー

- `gcloud が認識されない`:
  - PowerShellを再起動する
  - それでもだめならPC再起動後に再実行する
- `権限エラー`:
  - 対象GoogleアカウントにStorage操作権限があるか確認する
- `同期に時間がかかる`:
  - 初回（大量ファイル）は時間がかかる。再実行時は差分同期で短縮される

### 7. 運用メモ

- 生成フロー（WP APIでローカル生成）は従来通り維持
- 変更点は「アップロード先 / 参照先をXサーバーからGCSに変更」のみ
- 将来的に安全性を上げる場合は、公開配信をCloud Run API経由に寄せる

## 参照URL

- musicai.jp: https://www.musicai.jp/
- 現行WP側（music8）: https://xs867261.xsrv.jp/md/

---

## 2026-04 追記: 非公開GCS + Vercelサービスアカウント運用（確定）

本番方針は以下で固定する。

- GCSバケット `music8-json-prod` は **公開しない**
- ブラウザから `storage.googleapis.com` を直接参照しない
- Next.jsサーバー（Vercel）がサービスアカウントで認証してJSONを取得し、API経由で返す

### Vercel 環境変数（必須）

- `GOOGLE_APPLICATION_CREDENTIALS_JSON`
  - 値: サービスアカウント鍵JSON全文（`{...}` を丸ごと）
- `GOOGLE_CLOUD_PROJECT`
  - 値: `music8-a161a`

補足:

- `Sensitive` を ON のまま登録する
- 反映には再デプロイが必要
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` にプロジェクトID文字列だけを入れないこと

### サービスアカウント推奨設定

- 用途専用アカウントを作る（例: `music8-json-reader@music8-a161a.iam.gserviceaccount.com`）
- 権限は最小化する
  - 対象バケット: `music8-json-prod`
  - ロール: `Storage Object Viewer`
- プロジェクト全体ロールは原則付与しない

### 鍵ローテーション手順（運用）

1. 新しい鍵（JSON）を発行する
2. Vercel の `GOOGLE_APPLICATION_CREDENTIALS_JSON` を新鍵に更新する
3. 再デプロイする
4. 動作確認（Music8アーティスト/ソングデータ表示、comment-pack）
5. 旧鍵を削除する

### インシデント時の即時対応（鍵露出含む）

- 鍵が画面共有・スクリーンショット・チャット等に露出した場合は **漏えい扱い**にする
- 対応順:
  1. 該当鍵を即時無効化/削除
  2. 新鍵発行
  3. Vercel更新 + 再デプロイ
  4. 動作確認
- 鍵ファイルはGit管理しない（リポジトリ、Issue、PR添付に置かない）

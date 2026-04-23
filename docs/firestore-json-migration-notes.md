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
- 変更点は「アップロード先をXサーバーからGCSに変更」のみ
- 将来的に安全性を上げる場合は、公開配信をCloud Run API経由に寄せる

## 参照URL

- musicai.jp: https://www.musicai.jp/
- 現行WP側（music8）: https://xs867261.xsrv.jp/md/

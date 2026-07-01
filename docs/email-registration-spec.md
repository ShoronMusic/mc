# メールアドレスでのユーザー登録 仕様案

## 1. 概要

- **目的**: メールアドレス＋パスワードでアカウントを作成し、ログインしてチャットに参加できるようにする。
- **基盤**: 既存の Supabase Auth（簡易登録）を拡張し、登録〜ログイン〜表示の流れを明確にする。

---

## 2. 登録（新規作成）

### 2.1 入力項目

| 項目 | 必須 | ルール | 備考 |
|------|------|--------|------|
| メールアドレス | ○ | 有効な形式、未登録であること | 重複登録はエラー表示 |
| パスワード | ○ | 6文字以上 | フォームに「6文字以上」のヒント表示 |
| 表示名（ハンドルネーム） | ○ | 1〜30文字 | チャット・参加者欄に表示。空の場合はメールの@前を利用 |

### 2.2 フロー

1. 参加方法で「簡易登録（メールで登録・ログイン）」を選択
2. 登録フォームで「表示名」「メール」「パスワード」を入力
3. 「登録」送信
4. **B案（メール確認あり・確定）**: 登録成功 → 「確認メールを送りました」と表示し、メール内リンクで確認後にログイン可能（Supabase の **Confirm email ON**）

> **A案（メール確認なし）は廃止。** 捨てメール・複垢対策のため、メール登録は確認完了までログイン不可。

### 2.3 エラー時の表示

- メール重複: 「このメールアドレスはすでに登録されています。ログインしてください。」
- パスワード短い: 「パスワードは6文字以上にしてください」と表示
- ネットエラー: 「接続できませんでした。しばらくしてからお試しください。」

---

## 3. ログイン（既存ユーザー）

### 3.1 入力項目

| 項目 | 必須 |
|------|------|
| メールアドレス | ○ |
| パスワード | ○ |

### 3.2 フロー

1. 参加方法で「簡易登録」を選択
2. 「すでに登録済みの方はログイン」などでログイン表示に切り替え
3. メール・パスワード入力 → 「ログイン」
4. 成功 → 表示名（DB または user_metadata の display_name）でルームに入る
5. 失敗 → 「メールアドレスまたはパスワードが違います」などと表示

---

## 4. 表示名の扱い

- **登録時**: `user_metadata.display_name` に保存（現状の `signUp` の `options.data` で実装済み）
- **ログイン後**: `user_metadata.display_name` または `email` の @ 前を表示名として使用
- **将来の拡張**: プロフィール用テーブル（`profiles`）を用意し、`display_name` を永続化して後から変更可能にすることも可

---

## 5. メール確認（必須）

- Supabase ダッシュボード **Authentication → Providers → Email** で **Confirm email を ON** にする（本番・開発とも推奨）
- 登録後は確認メールを送信。`SimpleAuthForm` は `emailRedirectTo` で `/auth/callback?next=…&flow=email_confirm` を指定し、確認後に元の部屋等へ戻す
- **確認前**: ログイン不可（Supabase 側 + アプリ側の二重チェック）。「確認メールを送りました」案内と **再送信** ボタンを表示
- **確認後**: 「すでに登録済みの方はログイン」からログイン。コールバック完了時に `auth_notice=email_confirmed` の案内バナー
- **Google OAuth** は Supabase 上 `email_confirmed_at` が付くため、確認フロー不要
- **Redirect URLs**（Authentication → URL Configuration）に次を追加:
  - 本番: `https://www.musicai.jp/auth/callback`（実ドメインに合わせる）
  - 開発: `http://localhost:3002/auth/callback`
- **10 曲お試し付与**（Phase B）: メール登録は **`email_confirmed_at` 設定後** のみ `user_ai_trial` を付与（`src/lib/supabase-email-auth.ts` の `requiresEmailConfirmation` / `isUserEmailConfirmed`）

---

## 6. パスワードリセット（オプション）

- 「パスワードを忘れた」リンク → メール入力 → Supabase の `resetPasswordForEmail` でリセットメール送信
- メール内リンクは `redirectTo` を **`{オリジン}/auth/recover-callback`** とし、コード交換後に **`/auth/update-password`** へ送る（`?next=` だけの `/auth/callback` だと Supabase 側でクエリが落ちてトップに戻ることがあるため）
- Supabase の **Authentication → URL Configuration → Redirect URLs** に `https://www.musicai.jp/auth/recover-callback` および開発用 `http://localhost:3002/auth/recover-callback` を追加する

---

## 7. UI の置き場所

- **現状**: 参加方法で「簡易登録」選択 → 同じ画面内でモーダル風に「登録/ログイン」フォームを表示
- **案**: 現状の流れを維持しつつ、以下を整える
  - 登録時は「表示名」「メール」「パスワード」「パスワード再入力（任意）」を明示
  - ログイン時は「メール」「パスワード」のみ
  - 登録成功時は「登録しました。ルームに入ります。」などの短いメッセージを表示してから遷移（任意）

---

## 8. 実装の優先順位（提案）

| 順番 | 内容 | 備考 |
|------|------|------|
| 1 | 登録フォームのラベル・バリデーション・エラーメッセージの整理 | 既存 SimpleAuthForm の改善 |
| 2 | 登録済みメールの重複時メッセージを分かりやすく | Supabase のエラーを判定して表示 |
| 3 | パスワード「6文字以上」の注意表示・クライアント側チェック | 任意で「再入力」欄を追加 |
| 4 | メール確認（Confirm email ON）の案内・`emailRedirectTo`・再送信 | **実装済**（`SimpleAuthForm` · `supabase-email-auth.ts`） |
| 5 | （任意）パスワードリセット | 実装済（`resetPasswordForEmail` → `/auth/recover-callback`） |

---

## 9. まとめ

- 既存の **Supabase Auth のメール/パスワード** をそのまま利用する。
- **登録**は「表示名・メール・パスワード」で行い、`user_metadata.display_name` に表示名を保存する。
- **ログイン**はメール・パスワードで行い、表示名は `user_metadata` またはメールから取得する。
- **メール確認は必須**（Confirm email ON）。Google 登録は OAuth 経路で確認済み扱い。

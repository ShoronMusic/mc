# Supabase 設定手順（簡易登録・Google認証を有効にする）

簡易登録（メールで登録・ログイン）と Google認証を使うには、Supabase のプロジェクトを作成し、`.env.local` に設定を追加します。

---

## 1. Supabase アカウントとプロジェクト

1. **https://supabase.com** にアクセスし、アカウントを作成（またはログイン）。
2. **「New Project」** で新しいプロジェクトを作成。
   - **Name**: 任意（例: `music-chat`）
   - **Database Password**: 強めのパスワードを設定し、控えておく。
   - **Region**: 日本なら `Northeast Asia (Tokyo)` を推奨。
3. プロジェクトの作成が完了するまで数分待つ。

---

## 2. URL と API キーを取得する

1. プロジェクトが開いたら、左メニュー **「Project Settings」**（歯車アイコン）をクリック。
2. **「API」** タブを開く。
3. 次の2つをコピーする：
   - **Project URL**（例: `https://xxxxxxxxxxxx.supabase.co`）
   - **anon public** キー（「Project API keys」のうち、`anon` `public` と書いてある長い文字列）

---

## 3. .env.local に書き込む

1. プロジェクトの**ルート**（`e:\mc`）にある **`.env.local`** を開く。  
   なければ `.env.example` をコピーして `.env.local` を作成。
2. 次の2行を追加または編集する（値は 2. でコピーしたものに置き換え）：

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

- **NEXT_PUBLIC_SUPABASE_URL** = Project URL をそのまま貼り付け。
- **NEXT_PUBLIC_SUPABASE_ANON_KEY** = anon public キーをそのまま貼り付け。
- 余計なスペースや引用符をつけない。
- 他の設定（GEMINI_API_KEY など）はそのままでよい。

3. ファイルを保存する。

---

## 4. 開発サーバーを再起動する

環境変数は起動時に読み込まれるため、**必ず再起動**してください。

- ターミナルで `npm run dev` を実行している場合は、**Ctrl+C** で止めてから、もう一度 **`npm run dev`** を実行する。
- 再起動後、ブラウザで **http://localhost:3002/01** などを開き直す。

これで **簡易登録（メールで登録・ログイン）** のボタンが押せるようになります。

---

## 5. Google認証を使う場合（任意）

Google認証で参加できるようにするには、Supabase 側で Google を有効にします。

### 5.1 Supabase で Google を有効にする

1. Supabase ダッシュボードで **「Authentication」** → **「Providers」** を開く。
2. **「Google」** の行で **Enable** をオンにする。
3. あとで入力するため、**「Callback URL（Supabase が表示しているURL）」** をコピーしておく。  
   例: `https://xxxxxxxxxxxx.supabase.co/auth/v1/callback`  
   （xxxxxxxxxxxx はあなたのプロジェクト参照子。Supabase の Google 設定画面に表示されています。）

### 5.2 Google Cloud で OAuth クライアントを作る

1. **Google Cloud コンソール**（https://console.cloud.google.com）を開く。
2. プロジェクトを選択（または **「新しいプロジェクト」** で作成）。
3. 左メニュー **「API とサービス」** → **「認証情報」** を開く。
4. **「＋ 認証情報を作成」** → **「OAuth 2.0 クライアント ID」** を選ぶ。
5. 初回は **「同意画面を構成」** が出る場合があります。  
   - **ユーザータイプ**: 「外部」で進める（テスト運用なら「内部」も可）。  
   - **アプリ名** などを入力して保存。
6. **アプリケーションの種類**: **「ウェブアプリケーション」** を選ぶ。
7. **「承認済みのリダイレクト URI」** に、5.1 でコピーした **Supabase の Callback URL** を 1 件追加する。  
   - 例: `https://xxxxxxxxxxxx.supabase.co/auth/v1/callback`  
   - ※ 自分たちのアプリの URL（localhost や本番ドメイン）はここには入れません。Supabase の URL だけです。
8. **「作成」** を押す。
9. 表示された **クライアント ID** と **クライアントシークレット** をコピーする。

### 5.3 Supabase に Client ID / Secret を戻す

1. Supabase の **Authentication** → **Providers** → **Google** の設定画面に戻る。
2. **Client ID** と **Client Secret** の欄に、5.2 でコピーした値を貼り付ける。
3. **Save** で保存する。

これで **「Google認証で参加」** のボタンが利用できます。ルームページ（例: /01）で Google 認証を選ぶと、認証後に同じルームに戻ります。

---

## 6. うまく動かないとき

- **「ゲストで参加」しか出ない**  
  - `.env.local` に `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` が正しく入っているか確認。
  - 開発サーバーを再起動したか確認。
- **初回登録したアカウントでログインできない（Invalid login credentials）**  
  - Supabase の **Authentication** → **Providers** → **Email** を開く。
  - **「Confirm email」** がオンだと、登録後は**確認メールのリンクをクリックするまでログインできない**。
  - **開発中**は「Confirm email」を**オフ**にすると、登録後すぐにログインできる。
  - 確認メールを有効にしたまま使う場合は、登録後に届くメール内のリンクをクリックしてからログインする。
  - パスワードの打ち間違いがないかもあわせて確認する。
- **簡易登録で「User already registered」**  
  - そのメールは既に登録済み。同じメール・パスワードでログインを試す。
- **メールが届かない（確認メールを有効にしている場合）**  
  - Supabase の **Authentication** → **Providers** → **Email** で確認メールの設定を確認。開発時は「Confirm email」をオフにすると確認なしでログインできる。

---

## 7. マイページの「アカウントを削除」を使う場合

マイページで登録ユーザーが自分でアカウントをデータベースから完全に削除するには、**Service Role キー**が必要です。

1. Supabase ダッシュボードの **Project Settings** → **API** で、**service_role**（secret）キーをコピーする。
2. **`.env.local`** に次の1行を追加する（**このキーは絶対に公開しないこと**）：
   ```env
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
3. 開発サーバーを再起動する。

未設定のまま「アカウントを削除する」を実行すると「アカウント削除機能は現在利用できません」と表示されます。

---

## 8. マイページの「貼った曲の履歴」を使う場合

マイページで、参加したチャットで貼った曲の履歴（日付・ルーム・アーティスト・タイトル・URL・貼った時間）を表示するには、Supabase に履歴用テーブルを作成する必要があります。手順は **docs/supabase-song-history-table.md** を参照してください。

---

## 9. トップページ「ルーム入室前メッセージ」を使う場合

チャットオーナーがマイページから設定する、入室前一覧に表示する短いメッセージ（100 文字以内）を保存するには、次の SQL を **SQL Editor** で実行してください。**書き込みは API がサービスロールで行う**ため、`SUPABASE_SERVICE_ROLE_KEY` を `.env.local` に設定している必要があります（7 章と同じキー）。

```sql
create table if not exists public.room_lobby_message (
  room_id text primary key,
  message text not null default '',
  updated_at timestamptz not null default now(),
  constraint room_lobby_message_len check (char_length(message) <= 100)
);

alter table public.room_lobby_message enable row level security;

create policy "room_lobby_message_select_anon"
  on public.room_lobby_message for select
  using (true);
```

（`insert` / `update` / `delete` は anon には付けず、サーバー API のサービスロールのみが RLS をバイパスして書き込みます。）

トップページが参加人数を取得するたび（約 20 秒ごと）、**在室 0 人のルームの入室前メッセージ行は自動で削除**されます。本番でも `SUPABASE_SERVICE_ROLE_KEY` をデプロイ環境に設定してください（未設定だと削除はスキップされますが、API 側では在室 0 のときメッセージを返さないため一覧には出ません）。

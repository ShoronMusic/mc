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

これで **「Google認証で参加」** のボタンが利用できます。部屋ページ（例: /01）で Google 認証を選ぶと、認証後に同じ部屋に戻ります。

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

マイページで、参加したチャットで貼った曲の履歴（日付・部屋・アーティスト・タイトル・URL・貼った時間）を表示するには、Supabase に履歴用テーブルを作成する必要があります。手順は **docs/supabase-song-history-table.md** を参照してください。

---

## 9. トップページ「部屋入室前メッセージ」・部屋の名前を使う場合

主催者／チャットオーナーがマイページから設定する **PR文**（入室前一覧に表示・100 文字以内）と **部屋の名前**（トップの見出し・部屋上部・40 文字以内）を保存するには、次の SQL を **SQL Editor** で実行してください。**書き込みは API がサービスロールで行う**ため、`SUPABASE_SERVICE_ROLE_KEY` を `.env.local` に設定している必要があります（7 章と同じキー）。

```sql
create table if not exists public.room_lobby_message (
  room_id text primary key,
  message text not null default '',
  updated_at timestamptz not null default now(),
  constraint room_lobby_message_len check (char_length(message) <= 100)
);

-- 既存テーブル向け: トップ・部屋ヘッダー用の「部屋の名前」（任意）
alter table public.room_lobby_message add column if not exists display_title text not null default '';
alter table public.room_lobby_message drop constraint if exists room_lobby_display_title_len;
alter table public.room_lobby_message add constraint room_lobby_display_title_len check (char_length(display_title) <= 40);

alter table public.room_lobby_message enable row level security;

create policy "room_lobby_message_select_anon"
  on public.room_lobby_message for select
  using (true);
```

（`insert` / `update` / `delete` は anon には付けず、サーバー API のサービスロールのみが RLS をバイパスして書き込みます。）

トップページが参加人数を取得するたび（約 20 秒ごと）、**在室 0 人の部屋の入室前メッセージ行は自動で削除**されます。本番でも `SUPABASE_SERVICE_ROLE_KEY` をデプロイ環境に設定してください（未設定だと削除はスキップされますが、API 側では在室 0 のときメッセージを返さないため一覧には出ません）。

---

## 10. マイページ「参加履歴」を使う場合

ログインユーザーのチャット参加履歴（部屋・開催タイトル・入室時の表示名・入室/退出時刻）を記録するには、次の SQL を **SQL Editor** で実行してください。

```sql
create table if not exists public.user_room_participation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  room_id text not null,
  gathering_id uuid null references public.room_gatherings (id) on delete set null,
  gathering_title text null,
  display_name text null,
  joined_at timestamptz not null default now(),
  left_at timestamptz null
);

create index if not exists user_room_participation_user_joined_idx
  on public.user_room_participation_history (user_id, joined_at desc);

alter table public.user_room_participation_history enable row level security;

drop policy if exists "participation_select_own" on public.user_room_participation_history;
create policy "participation_select_own"
  on public.user_room_participation_history for select
  using (auth.uid() = user_id);

drop policy if exists "participation_insert_own" on public.user_room_participation_history;
create policy "participation_insert_own"
  on public.user_room_participation_history for insert
  with check (auth.uid() = user_id);

drop policy if exists "participation_update_own" on public.user_room_participation_history;
create policy "participation_update_own"
  on public.user_room_participation_history for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

**既にテーブルがある場合**に表示名を後から足すには、SQL Editor で次を実行してください。

```sql
alter table public.user_room_participation_history
  add column if not exists display_name text null;
```

記録は `POST /api/user-room-participation` が担当します。  
`Join` は入室時（本文に `displayName` を付けると入室時点のチャット表示名が `display_name` に保存されます）、`Leave` は退室ボタン押下時とページ離脱時に送信します。ネットワーク切断等で `Leave` が取れない場合は `left_at` が null のまま残ることがあります。

---

## 11. AI 質問ガード（イエローカード）警告への異議申立てを使う場合

チャットで「@」付き質問が音楽に関係ないと自動判定されたときの**異議申立て**を保存するには、次の SQL を **SQL Editor** で実行してください。**ゲスト**は `user_id` が NULL で保存されます。**ログイン時**は `user_id` が付きます（`POST /api/ai-question-guard-objection`）。管理画面の閲覧は **STYLE_ADMIN** ＋ **サービスロール**（既存の他管理 API と同様）です。

```sql
create table if not exists public.ai_question_guard_objections (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid null references auth.users (id) on delete cascade,
  room_id text not null,
  chat_message_id text not null,
  system_message_body text not null,
  warning_count int not null,
  guard_action text not null,
  reason_keys text[] not null default '{}',
  free_comment text,
  conversation_snapshot jsonb not null,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  admin_note text
);

-- ログイン済み: (user_id, chat_message_id) で重複禁止
drop index if exists ai_question_guard_objections_user_msg_uidx;
create unique index if not exists ai_question_guard_objections_user_msg_uidx
  on public.ai_question_guard_objections (user_id, chat_message_id)
  where user_id is not null;

-- ゲスト: 同一タブ内の同一警告メッセージ ID での二重送信のみ禁止
create unique index if not exists ai_question_guard_objections_guest_msg_uidx
  on public.ai_question_guard_objections (chat_message_id)
  where user_id is null;

create index if not exists ai_question_guard_objections_created_idx
  on public.ai_question_guard_objections (created_at desc);

alter table public.ai_question_guard_objections enable row level security;

drop policy if exists "ai_question_guard_objections_insert_own" on public.ai_question_guard_objections;
create policy "ai_question_guard_objections_insert_own"
  on public.ai_question_guard_objections for insert
  with check (user_id is null or auth.uid() = user_id);

drop policy if exists "ai_question_guard_objections_select_own" on public.ai_question_guard_objections;
create policy "ai_question_guard_objections_select_own"
  on public.ai_question_guard_objections for select
  using (auth.uid() = user_id);
```

**既に旧版（`user_id not null` のみ）でテーブルを作っている場合**は、次を追加で実行してください。

```sql
alter table public.ai_question_guard_objections alter column user_id drop not null;

drop index if exists ai_question_guard_objections_user_msg_uidx;
create unique index if not exists ai_question_guard_objections_user_msg_uidx
  on public.ai_question_guard_objections (user_id, chat_message_id)
  where user_id is not null;

create unique index if not exists ai_question_guard_objections_guest_msg_uidx
  on public.ai_question_guard_objections (chat_message_id)
  where user_id is null;

drop policy if exists "ai_question_guard_objections_insert_own" on public.ai_question_guard_objections;
create policy "ai_question_guard_objections_insert_own"
  on public.ai_question_guard_objections for insert
  with check (user_id is null or auth.uid() = user_id);
```

テーブルが無い場合、API は 503 とヒントを返します。

### 11.1 エクスポート → 分類精度の改善パイプライン

1. **管理画面** `/admin/ai-question-guard-objections` で **JSON エクスポート** または **CSV エクスポート** をダウンロードする（認証: STYLE_ADMIN）。API 直叩きは `GET /api/admin/ai-question-guard-objections/export?format=json` または `format=csv`。
2. エクスポートの各行の `conversation_snapshot`（配列）から、**実際の「@」質問文**と**直前の会話**を確認する。異議理由が「音楽関連だった」の行は **正例（本来 allow すべき）** としてメモする。
3. **サーバー分類**は `POST /api/ai/question-guard-classify`（Gemini）が担当。質問がクライアントのキーワード判定で落ちたときだけ呼ばれる。プロンプト本文は `src/lib/ai-question-guard-prompt.ts` の `AI_QUESTION_GUARD_CLASSIFIER_INSTRUCTION`。
4. **プロンプト差し替え手順（推奨）**
   - 正例を数件〜数十件、次のようなブロックにまとめる（事実に基づく短い例のみ）:

     ```
     【正例】直前: … / 質問: … → musicRelated: true
     【負例】直前: … / 質問: … → musicRelated: false
     ```

   - そのブロックを **`.env.local`（コミット禁止）** の環境変数 `AI_QUESTION_GUARD_EXTRA_PROMPT` に貼り付け、サーバー再起動。`buildAiQuestionGuardUserPayload` が各リクエストに追記する。
   - 繰り返し誤判定が残る場合は `AI_QUESTION_GUARD_CLASSIFIER_INSTRUCTION` 本体を編集し、`npm run test` に含まれる `is-music-related-ai-question` の単体テストとあわせてクライアント側キーワード（`src/lib/is-music-related-ai-question.ts`）も必要に応じて補足する。
5. **Gemini を分類に使わない**ときは `.env.local` に `AI_QUESTION_GUARD_GEMINI=0`（キーがあっても API はスキップし、従来どおりクライアント判定のみ）。
6. **レート制限**（IP・60 秒窓）: 登録ユーザー `QUESTION_GUARD_CLASSIFY_PER_MINUTE`（既定 60）、ゲスト `QUESTION_GUARD_CLASSIFY_PER_MINUTE_GUEST`（既定 30）。

### 11.2 AI チャットチューニング報告（モデレーター）

`AI_TIDBIT_MODERATOR_USER_IDS`（または `AI_TIDBIT_MODERATOR_EMAILS`）に含まれるログインユーザーだけが、部屋チャットから「基準メッセージ前後の会話スナップショット＋メモ」を DB に保存できます（`POST /api/ai-chat-tuning-report`）。挿入は API が **サービスロール**（`SUPABASE_SERVICE_ROLE_KEY`）で行います。一覧・エクスポートは **STYLE_ADMIN**（`/admin/ai-chat-tuning-reports` または `GET /api/admin/ai-chat-tuning-reports`、エクスポートは `.../export?format=json|csv`）。

```sql
create table if not exists public.ai_chat_conversation_tuning_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reporter_user_id uuid not null references auth.users (id) on delete cascade,
  reporter_email text,
  room_id text not null,
  anchor_message_id text not null,
  anchor_message_type text not null check (anchor_message_type in ('user', 'ai', 'system')),
  current_video_id text,
  moderator_note text not null,
  conversation_snapshot jsonb not null,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  admin_note text
);

create index if not exists ai_chat_tuning_reports_created_idx
  on public.ai_chat_conversation_tuning_reports (created_at desc);

create index if not exists ai_chat_tuning_reports_room_idx
  on public.ai_chat_conversation_tuning_reports (room_id);

alter table public.ai_chat_conversation_tuning_reports enable row level security;
```

anon / authenticated には `insert`・`select` ポリシーを付けません（クライアント直叩き不可）。

---

## 12. サイト全体ご意見（`site_feedback`）

部屋画面ヘッダーの「ご意見」から送信する評価（-2〜2）と自由コメントを保存します。書き込みは **`POST /api/site-feedback`** が **サービスロール**で行うため、`.env.local` に **`SUPABASE_SERVICE_ROLE_KEY`** が必要です。管理画面: `/admin/site-feedback`（STYLE_ADMIN）。

```sql
create table if not exists public.site_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  rating smallint not null check (rating >= -2 and rating <= 2),
  comment text,
  room_id text,
  display_name text,
  is_guest boolean not null default true,
  user_id uuid references auth.users (id) on delete set null
);

create index if not exists site_feedback_created_idx
  on public.site_feedback (created_at desc);

alter table public.site_feedback enable row level security;
```

anon には `insert` / `select` ポリシーを付けません（クライアント直叩き不可）。API のみサービスロールで挿入し、管理 API のみ読み取ります。

---

## 13. アーティスト／曲名スナップショット報告（`artist_title_parse_reports`）

**STYLE_ADMIN**（`STYLE_ADMIN_USER_IDS` に含まれるログインユーザー）だけが、部屋チャットの曲紹介・曲解説メッセージから「表記メタを記録」でき、oEmbed・YouTube snippet・`resolveArtistSongForPackAsync` 結果などを **JSON** で保存します。開発時にスワップ等を後から検証する用途です。

- **書き込み**: `POST /api/admin/artist-title-parse-report`（ログイン＋STYLE_ADMIN、**`SUPABASE_SERVICE_ROLE_KEY` 必須**）
- **一覧**: 管理画面 `/admin/artist-title-parse-reports` または `GET /api/admin/artist-title-parse-reports`

```sql
create table if not exists public.artist_title_parse_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reporter_user_id uuid not null references auth.users (id) on delete cascade,
  room_id text,
  message_kind text not null check (message_kind in ('announce_song', 'song_commentary')),
  video_id text not null,
  chat_message_body text,
  reporter_note text,
  snapshot jsonb not null
);

create index if not exists artist_title_parse_reports_created_idx
  on public.artist_title_parse_reports (created_at desc);

create index if not exists artist_title_parse_reports_video_idx
  on public.artist_title_parse_reports (video_id);

alter table public.artist_title_parse_reports enable row level security;
```

anon にはポリシーを付けません。挿入・読み取りは API がサービスロールで行います。

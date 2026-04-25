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

入室前メッセージは `/api/room-presence` では**在室がいる部屋にだけ**付与されます（在室 0 のときは応答に含めません）。DB の `room_lobby_message` 行は残る場合があります。主催者が保存し直すと上書きされます。

### 9.1 在室 0 自動終了（`room_live_presence_watch`）

`live` の会が、Ably の在室が **一度でも 1 人以上** になったあと、在室 **0** の状態が一定時間（既定 **30 分**、環境変数 `EMPTY_LIVE_GATHERING_END_MS` でミリ秒指定可・最小 60000）続いたときに `room_gatherings` を `ended` にする Cron 用の補助テーブルです。**クライアントからは参照しません**。読み書きは **サービスロール**（`GET /api/cron/end-empty-live-gatherings`・`POST /api/room-gatherings`）のみを想定しています。

```sql
create table if not exists public.room_live_presence_watch (
  room_id text primary key,
  last_nonempty_at timestamptz not null
);

alter table public.room_live_presence_watch enable row level security;
-- anon / authenticated 用のポリシーは付けない（サービスロールが RLS をバイパスして利用）
```

- **Vercel Cron** は `vercel.json` で約 10 分おきに上記 API を呼びます。環境変数 **`CRON_SECRET`** を設定し、Cron から送られる `Authorization: Bearer …` と一致させてください（未設定時は API は 503）。
- **`NEXT_PUBLIC_ABLY_API_KEY` が未設定**の環境では在室数が取れないため、自動終了処理は実行されません。
- テーブルを作っていない場合、Cron は **`room_live_presence_watch` 未作成**として終了処理をスキップします（本番では上記 SQL の実行を推奨）。

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
  pain_points text[],
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

既存テーブルを使っている場合は、次の `alter table` だけ追加実行してください。

```sql
alter table public.site_feedback
  add column if not exists pain_points text[];
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

---

## 14. AI向けユーザー趣向メモ（`user_ai_taste_summary`）

ログインユーザーがマイページで保存する**短文メモ**を格納し、部屋で「@」付きで AI に話しかけたときのプロンプトに**参考として**載せます（他参加者には非表示）。

- **マイページ**: 「マイページ」→「ユーザー」タブの「AI向けの趣向メモ」
- **API**: `GET` / `PUT` → `/api/user/ai-taste-summary`（セッション必須）
- **RLS**: 本人の行のみ SELECT / INSERT / UPDATE / DELETE

Supabase の **SQL Editor** で実行:

```sql
create table if not exists public.user_ai_taste_summary (
  user_id uuid primary key references auth.users (id) on delete cascade,
  summary_text text not null default '',
  updated_at timestamptz not null default now()
);

create index if not exists user_ai_taste_summary_updated_idx
  on public.user_ai_taste_summary (updated_at desc);

alter table public.user_ai_taste_summary enable row level security;

create policy "user_ai_taste_summary_select_own"
  on public.user_ai_taste_summary for select
  using (auth.uid() = user_id);

create policy "user_ai_taste_summary_insert_own"
  on public.user_ai_taste_summary for insert
  with check (auth.uid() = user_id);

create policy "user_ai_taste_summary_update_own"
  on public.user_ai_taste_summary for update
  using (auth.uid() = user_id);

create policy "user_ai_taste_summary_delete_own"
  on public.user_ai_taste_summary for delete
  using (auth.uid() = user_id);
```

テーブルが無い状態では API は 503 と案内文を返します。

---

## 15. AI向け趣向の自動要約（`user_ai_taste_auto_profile`）

`room_chat_log`（当該ユーザーの `user_id` 付き発言）、`user_song_history`、`user_favorites`、`user_my_list_items` を集め、Gemini で短い要約を生成して保存します。**マイページの手動メモ**（第14章）と併せ、`@` 付き AI チャット（`/api/ai/chat`）のプロンプトに載ります。

- **更新**: `POST /api/user/ai-taste-auto-refresh`（ログイン必須・約45分に1回まで）
- **RLS**: 本人の行のみ SELECT / INSERT / UPDATE / DELETE

```sql
create table if not exists public.user_ai_taste_auto_profile (
  user_id uuid primary key references auth.users (id) on delete cascade,
  profile_text text not null default '',
  updated_at timestamptz not null default now()
);

create index if not exists user_ai_taste_auto_profile_updated_idx
  on public.user_ai_taste_auto_profile (updated_at desc);

alter table public.user_ai_taste_auto_profile enable row level security;

create policy "user_ai_taste_auto_profile_select_own"
  on public.user_ai_taste_auto_profile for select
  using (auth.uid() = user_id);

create policy "user_ai_taste_auto_profile_insert_own"
  on public.user_ai_taste_auto_profile for insert
  with check (auth.uid() = user_id);

create policy "user_ai_taste_auto_profile_update_own"
  on public.user_ai_taste_auto_profile for update
  using (auth.uid() = user_id);

create policy "user_ai_taste_auto_profile_delete_own"
  on public.user_ai_taste_auto_profile for delete
  using (auth.uid() = user_id);
```

未作成の環境では `ai-taste-auto-refresh` と `fetchUserTasteContextForChat` は自動要約を無視し、手動メモのみ従来どおり動きます。

---

## 16. 他ユーザー向けプロフィール（`user_public_profile`）

マイページで編集する**公開用プロフィール**（オプトイン）。`visible_in_rooms = true` のとき、ログイン済みユーザーは RLS で当該行を読み取れます（部屋 UI への表示は別途実装）。

- **API**: `GET` / `PUT` → `/api/user/public-profile`
- **バリデーション**: `src/lib/user-public-profile.ts`

```sql
create table if not exists public.user_public_profile (
  user_id uuid primary key references auth.users (id) on delete cascade,
  visible_in_rooms boolean not null default false,
  tagline text not null default '',
  favorite_artists jsonb not null default '[]'::jsonb,
  listening_note text not null default '',
  updated_at timestamptz not null default now()
);

create index if not exists user_public_profile_visible_idx
  on public.user_public_profile (visible_in_rooms)
  where visible_in_rooms = true;

alter table public.user_public_profile enable row level security;

-- 本人: すべて
create policy "user_public_profile_select_own"
  on public.user_public_profile for select
  using (auth.uid() = user_id);

create policy "user_public_profile_insert_own"
  on public.user_public_profile for insert
  with check (auth.uid() = user_id);

create policy "user_public_profile_update_own"
  on public.user_public_profile for update
  using (auth.uid() = user_id);

create policy "user_public_profile_delete_own"
  on public.user_public_profile for delete
  using (auth.uid() = user_id);

-- 公開設定オン: 他のログインユーザーが閲覧可能
create policy "user_public_profile_select_visible"
  on public.user_public_profile for select
  using (visible_in_rooms = true);
```

`favorite_artists` は JSON 配列（文字列のリスト）。アプリ側で最大5件・各80文字程度に制限します。

---

## 17. 部屋の AI 曲解説・曲クイズ（`user_room_ai_features`）

ログインユーザーがマイページで **AI曲解説**（comment-pack／従来の commentary）と **AI曲クイズ** を ON/OFF します。**未作成の行はどちらも ON** として扱います。

- **マイページ**: 「ユーザー」タブの ON/OFF ボタン
- **API**: `GET` / `PUT` → `/api/user/room-ai-features`（セッション必須）
- **RLS**: 本人の行のみ SELECT / INSERT / UPDATE / DELETE

Supabase の **SQL Editor** で実行:

```sql
create table if not exists public.user_room_ai_features (
  user_id uuid primary key references auth.users (id) on delete cascade,
  ai_commentary_enabled boolean not null default true,
  ai_song_quiz_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists user_room_ai_features_updated_idx
  on public.user_room_ai_features (updated_at desc);

alter table public.user_room_ai_features enable row level security;

create policy "user_room_ai_features_select_own"
  on public.user_room_ai_features for select
  using (auth.uid() = user_id);

create policy "user_room_ai_features_insert_own"
  on public.user_room_ai_features for insert
  with check (auth.uid() = user_id);

create policy "user_room_ai_features_update_own"
  on public.user_room_ai_features for update
  using (auth.uid() = user_id);

create policy "user_room_ai_features_delete_own"
  on public.user_room_ai_features for delete
  using (auth.uid() = user_id);
```

テーブルが無い状態では API は 503 と案内文を返します。

---

## 18. テーマプレイリスト・ミッション（お題に沿って最大10曲・AIコメント）

マイページ「お題プレイリスト」用。**ログインユーザー本人のみ**が行を参照・更新します。  
API: `GET` / `POST` → `/api/user/theme-playlist-mission`、曲追加 `POST` → `/api/user/theme-playlist-mission/entry`。  
実装メモ: `src/lib/theme-playlist-definitions.ts`、`docs/collaborative-playlist-mission-plan.md`。

Supabase の **SQL Editor** で実行:

```sql
-- ミッション（お題ごとのセッション。同一お題で進行中はユーザーあたり1件まで）
create table if not exists public.user_theme_playlist_missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  theme_id text not null,
  room_id text,
  room_title text,
  room_owner_user_id uuid references auth.users (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'paused', 'completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ユーザーのオリジナルお題（新規作成タブ）
create table if not exists public.user_theme_playlist_custom_themes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_theme_playlist_missions_user_updated
  on public.user_theme_playlist_missions (user_id, updated_at desc);

create unique index if not exists user_theme_playlist_missions_active_per_theme
  on public.user_theme_playlist_missions (user_id, theme_id)
  where (status = 'active');

alter table public.user_theme_playlist_missions enable row level security;
alter table public.user_theme_playlist_custom_themes enable row level security;

create policy "theme_missions_select_own"
  on public.user_theme_playlist_missions for select
  using (auth.uid() = user_id);

create policy "theme_missions_insert_own"
  on public.user_theme_playlist_missions for insert
  with check (auth.uid() = user_id);

create policy "theme_missions_update_own"
  on public.user_theme_playlist_missions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "theme_missions_delete_own"
  on public.user_theme_playlist_missions for delete
  using (auth.uid() = user_id);

create policy "theme_custom_themes_select_own"
  on public.user_theme_playlist_custom_themes for select
  using (auth.uid() = user_id);

create policy "theme_custom_themes_insert_own"
  on public.user_theme_playlist_custom_themes for insert
  with check (auth.uid() = user_id);

create policy "theme_custom_themes_update_own"
  on public.user_theme_playlist_custom_themes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "theme_custom_themes_delete_own"
  on public.user_theme_playlist_custom_themes for delete
  using (auth.uid() = user_id);

-- エントリ（1〜10曲目。同一ミッション内で同一 video_id は1回まで）
create table if not exists public.user_theme_playlist_entries (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.user_theme_playlist_missions (id) on delete cascade,
  slot_index integer not null check (slot_index >= 1 and slot_index <= 10),
  video_id text not null,
  url text not null,
  title text,
  artist text,
  ai_comment text not null,
  ai_overall_comment text,
  selector_display_name text,
  created_at timestamptz not null default now(),
  unique (mission_id, slot_index),
  unique (mission_id, video_id)
);

create index if not exists idx_user_theme_playlist_entries_mission_slot
  on public.user_theme_playlist_entries (mission_id, slot_index);

alter table public.user_theme_playlist_entries enable row level security;

create policy "theme_entries_select_own"
  on public.user_theme_playlist_entries for select
  using (
    exists (
      select 1 from public.user_theme_playlist_missions m
      where m.id = mission_id and m.user_id = auth.uid()
    )
  );

create policy "theme_entries_insert_own"
  on public.user_theme_playlist_entries for insert
  with check (
    exists (
      select 1 from public.user_theme_playlist_missions m
      where m.id = mission_id and m.user_id = auth.uid()
    )
  );

create policy "theme_entries_update_own"
  on public.user_theme_playlist_entries for update
  using (
    exists (
      select 1 from public.user_theme_playlist_missions m
      where m.id = mission_id and m.user_id = auth.uid()
    )
  );

create policy "theme_entries_delete_own"
  on public.user_theme_playlist_entries for delete
  using (
    exists (
      select 1 from public.user_theme_playlist_missions m
      where m.id = mission_id and m.user_id = auth.uid()
    )
  );
```

既存環境ですでに 18 章を適用済みの場合は、次の追補 SQL も実行:

```sql
alter table public.user_theme_playlist_missions
  drop constraint if exists user_theme_playlist_missions_status_check;

alter table public.user_theme_playlist_missions
  add constraint user_theme_playlist_missions_status_check
  check (status in ('active', 'paused', 'completed'));

alter table public.user_theme_playlist_missions
  add column if not exists room_id text;

alter table public.user_theme_playlist_missions
  add column if not exists room_title text;

alter table public.user_theme_playlist_missions
  add column if not exists room_owner_user_id uuid references auth.users (id) on delete set null;

create table if not exists public.user_theme_playlist_custom_themes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_theme_playlist_custom_themes
  add column if not exists title text;

alter table public.user_theme_playlist_custom_themes
  add column if not exists description text;

alter table public.user_theme_playlist_custom_themes
  add column if not exists is_active boolean not null default true;

alter table public.user_theme_playlist_entries
  add column if not exists selector_display_name text;

alter table public.user_theme_playlist_entries
  add column if not exists ai_overall_comment text;
```

テーブルが無い状態では上記 API は **503** と案内文を返します。

---

## 19. AI 曲解説不可リスト（参照データ不足で曲紹介のみとなった選曲）

Music8 等の参照にリリース年・収録出自が揃わず、曲解説が**曲紹介の定型文のみ**になった選曲を `ai_commentary_unavailable_entries` に記録します（`POST /api/ai/comment-pack`・`POST /api/ai/commentary` が **サービスロール**で挿入）。一覧・対応済みフラグは **STYLE_ADMIN** の管理 API・画面から操作します。

**SQL（SQL Editor で実行）:**

```sql
create table if not exists public.ai_commentary_unavailable_entries (
  id uuid primary key default gen_random_uuid(),
  recorded_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  room_id text,
  video_id text not null,
  watch_url text not null,
  artist_label text not null,
  song_label text not null,
  source text not null check (source in ('comment_pack', 'commentary')),
  resolved boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ai_commentary_unavailable_entries_recorded_idx
  on public.ai_commentary_unavailable_entries (recorded_at desc);

create index if not exists ai_commentary_unavailable_entries_resolved_idx
  on public.ai_commentary_unavailable_entries (resolved, recorded_at desc);

alter table public.ai_commentary_unavailable_entries enable row level security;
```

- **記録日時** `recorded_at`: サーバーが挿入した時刻（選曲フローで曲解説 API に到達した時刻に近い）。
- **管理画面**: `/admin/ai-commentary-unavailable`（`GET` / `PATCH` は ` /api/admin/ai-commentary-unavailable`）。
- 挿入に **`SUPABASE_SERVICE_ROLE_KEY`** が無い環境では記録はスキップされます（コンソール warn のみ）。

---

## 20. 曲解説に紐づく三択クイズログ（`song_quiz_logs`）

`POST /api/ai/song-quiz` でクイズ生成に成功したとき、**サービスロール**で 1 行 INSERT します。管理画面の曲引きで **質問・三択・正解インデックス・解説**を日付順に参照できます。曲解説テキストは DB 重複でも、**`commentary_context_sha256` + `created_at`** で「その回の出題」として区別します。

**SQL（SQL Editor で実行）:**

```sql
create table if not exists public.song_quiz_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  video_id text not null,
  room_id text,
  commentary_context_sha256 text not null,
  commentary_context_preview text,
  quiz jsonb not null
);

create index if not exists song_quiz_logs_video_created_idx
  on public.song_quiz_logs (video_id, created_at desc);

alter table public.song_quiz_logs enable row level security;
```

- **RLS**: ポリシーなし（`anon` からは読めない）。アプリは **`SUPABASE_SERVICE_ROLE_KEY`** のみ INSERT/SELECT。
- **オフ**: サーバー環境変数 `SONG_QUIZ_LOG_PERSIST=0` で INSERT を止められます。

---

## 21. AIキャラ選曲ログ（`ai_character_song_pick_logs`）

AIキャラの選曲が YouTube まで解決したとき、**サービスロール**で 1 行 INSERT します。管理画面 **`/admin/ai-character-song-picks`** で、参加日時・部屋名・選曲（アーティスト／タイトル）・投入コメントを確認できます。

**SQL・列の説明・保存条件**は **docs/supabase-ai-character-song-pick-logs-table.md** を開き、**Supabase SQL Editor** で同ファイルの `create table` ブロックを実行してください。

- **オフ**: サーバー環境変数 `AI_CHARACTER_SONG_PICK_LOG_PERSIST=0` で INSERT を止められます。

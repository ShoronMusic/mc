# ⭐ AI お試し10曲 × 選曲のみ無料 — 実装マスタ（継続更新）

> **重要**: 有料化 Phase 4 の**正本**。方針・進捗・API/DB/UI の実装チェックリストは**本ファイルを更新**する。  
> 収益モデル全般・収支試算は `docs/monetization-options.md`、原価帰属・管理集計は `docs/room-gathering-history-and-ai-billing-project.md` を参照。

最終更新: **2026-07-18**  
ステータス: **Phase B 実装済み・ローカル実機 OK / 本番デプロイ＋20曲検証待ち** / ゲスト UX 完了 / 登録ユーザー UX 追補完了 / Phase C 一部着手 / **お試し付与 20 曲**

---

## 目的

1. **分かりやすいお試し**: 登録ユーザーに **AI 付き選曲 20 曲**（生涯1回）を提供する。
2. **選曲だけ無料の継続利用**: 20 曲使い切り後も **AI なし選曲・再生・通常チャット** は無料のまま使える。
3. **抜け道対策**: 主軸は **`user_id`**。IP・レート制限・メール確認は補助。VPN 専用ブロックは初期は任意。
4. **将来の課金接続**: お試し枯渇後に **プリペイド / 月額** へ接続（詳細は `docs/monetization-options.md`）。

---

## 確定方針：20 曲お試しは「登録ユーザーのみ」

**ゲストには 20 曲を付けない。** AI 付きお試しは **Supabase に `user_id` が発行された登録者だけ**（**Google OAuth** または **メール＋パスワード**）。不正管理の主キーは **`user_id` 1 人 = 生涯 20 曲** とする。

| 参加方法 | 20 曲お試し | 選曲のみ（無料） | 不正対策上の位置づけ |
|----------|:-----------:|:----------------:|----------------------|
| **ゲスト**（ハンドル名のみ） | **×** | ○ | `user_id` なし → **trial テーブルに載せられない** |
| **Google 登録** | ○（初回ログイン時付与） | ○ | Google 側でメール実在性が高い。`user_id` 固定 |
| **メール登録** | ○（**メール確認後**付与） | ○（確認前も可） | 捨てメール・複垢は **確認 + IP 補助** で抑える |

### なぜ登録限定の方がよいか

1. **アカウント単位で cap できる** — ゲストは `sessionStorage` 消去・別ブラウザで **無限に「新規」** になり得る。20 曲 × N は **`user_id` 必須**。
2. **監査ログが残る** — `user_ai_trial` · 消費ログ · `gemini_usage_logs.user_id` が一本化される。
3. **メール確認のゲート** — メール登録は確認完了まで **B4（AI なし）**。Google は OAuth 時点で確認済み扱い可（Supabase `email_confirmed_at`）。
4. **登録インセンティブ** — 「20 曲試すなら登録」が明確。ゲストは部屋体験（選曲のみ）に留める。
5. **IP は補助** — 登録が主、IP は同一回線の大量 signup 検知用（家族・学校の誤爆に注意）。

### 付与タイミング（確定）

| 経路 | 20 曲付与 |
|------|-----------|
| Google `signInWithOAuth` 成功・初回 `user_id` 作成 | **即付与**（`email_confirmed_at` あり想定） |
| メール新規登録 | **確認リンク完了後**に付与（確認前は U5 · 選曲のみ） |
| 既存登録ユーザー（本機能リリース前から在籍） | リリース時 **一括付与 20 曲** か **未付与** — 別途決定（実装ログに追記） |

### ゲストに AI を付けないことのトレードオフ

- **マイナス**: 登録前に AI 解説を 1 曲も試せない → **部屋で他人の AI 付き選曲は閲覧可能**（消費は選曲者の枠）。登録 CTA は UserBar・選曲 UI。
- **プラス**: 複垢で 20 曲 × ∞ を防げる。主催者への `guest_enjoy_owner_paid` 原価も **Phase B 以降増やさない**（ゲスト AI 付き選曲を止める）。

---

## ユーザーの種類（整理）

本プランで扱う「ユーザー」は **1 人 = 複数の軸** の組み合わせ。混同しやすい **「AI を使えるか」** と **「原価を誰に帰属するか」** は別軸。

### 3種類（対外・表示の大枠）

| 大分類 | 内部タイプ | 一言 |
|--------|------------|------|
| **① ゲスト** | U1 | 未登録。AI なし |
| **② 無料を貫く** | U3（＋ U5 未確認） | 登録済み。選曲・チャットは無料。AI なし |
| **③ AI を使う** | U2 お試し → U4 有料 | 10 曲お試し or 課金で AI 付き選曲・@ |

主催者（U6/U7）・AI エージェント（U8）は **①②③に加えた役割バッジ**（👑 / `AI`）で既存どおり。

### 軸 A — 認証・識別（誰か）

| ID | 種類 | 識別子 | マイページ | 10 曲お試し |
|:--:|------|--------|------------|-------------|
| **A0** | **ゲスト** | `sessionStorage`（`mc:guest` 等）。**`user_id` なし** | 限定 UI | **対象外**（0 曲） |
| **A1** | **登録ユーザー** | Supabase **`user_id`**（Google / メール） | フル | 条件付き（軸 B） |

- ゲスト → 登録後は **`user_id` が付与**され、A0 から A1 へ。お試し 10 曲は **A1 かつ B1 付与前後**（メール確認後に付与）。
- **STYLE_ADMIN**（`STYLE_ADMIN_USER_IDS`）は A1 の一種。お試し・課金は **通常と同じ**（管理用 API は別）。

### 軸 B — AI 利用資格（お試し・課金）

| ID | 状態 | 条件 | AI 付き選曲 | 選曲のみ | @ 質問 |
|:--:|------|------|-------------|----------|--------|
| **B0** | **スイッチ前（現状）** | 本プラン未 ON | ○ 全員 | ○ | ○ |
| **B1** | **お試し残あり** | メール確認済 & `songs_remaining > 0` | ○（1 曲消費） | ○ | ○（`at` 残） |
| **B2** | **お試し枯渇** | `songs_remaining = 0` | × | ○ **無料継続** | × |
| **B3** | **有料枠あり**（Phase D） | クレジット / 月額残 | ○（課金消費） | ○ | ○（プラン次第） |
| **B4** | **メール未確認** | A1 だが確認前 | × | ○ | × |

**本音プランのコア**: **B2 でも部屋から落とさない**（選曲のみ無料ユーザー）。

### 軸 C — 部屋での役割（その部屋では誰か）

| ID | 役割 | 判定目安 | 備考 |
|:--:|------|----------|------|
| **C0** | **一般参加者** | デフォルト | 選曲参加 ON/OFF はユーザー設定 |
| **C1** | **視聴専用** | マイページ「選曲に参加」OFF | AI 付き選曲ボタンは出さない |
| **C2** | **会の主催者** | `room-live-status` · `isOrganizer` | 部屋名・PR・会終了。部屋原価の中心 |
| **C3** | **チャットオーナー** | 部屋オーナー譲渡・設定権 | tidbit・AI エージェント・ゲスト AI 設定等 |
| **C4** | **AI エージェント** | `is_ai_agent` | 人間ではない。課金対象外（`billing_kind: ai_agent`） |

C2・C3 は **同一人物が C0 と兼ねる**ことが多い。課金設計上は「主催者負担の部屋共通 AI」と「個人のお試し 10 曲」を **分けて考える**（`room-gathering-history` の personal / roomCommon）。

### 合成タイプ（実装・UX で使う 8 パターン）

日常語と軸の対応。Phase B 以降の UI・API 分岐の参照用。

| タイプ | 合成 | 部屋での見え方 | AI 付き選曲 | 選曲のみ | @ |
|--------|------|----------------|-------------|----------|---|
| **U1 ゲスト** | A0 | ゲスト名 | × → 登録誘導 | ○ | × |
| **U2 登録・お試し中** | A1 + B1 | 残り N/20 表示 | ○ | ○ | ○（@質問 残） |
| **U3 登録・選曲のみ派** | A1 + B2 | 「AI なしで選曲」が主 | × | ○ **ずっと無料** | × |
| **U4 登録・有料** | A1 + B3 | 残クレジット / 月額 | ○ | ○ | ○ |
| **U5 登録・未確認** | A1 + B4 | 確認メール案内 | × | ○ | × |
| **U6 主催者（通常参加）** | A1 + B* + C2 | U2/U3/U4 + 主催メニュー | **自分の選曲**は B に従う | ○ | B に従う |
| **U7 オーナー（部屋設定）** | A1 + C3 | オーナー機能タブ | 同上 | ○ | 同上 |
| **U8 AI エージェント** | C4 | AI キャラ | （人間の枠消費なし） | — | — |

**U3 が本プランの「完全無料を通したいユーザー」**に相当。10 曲使い切り後のデフォルト落ち先。

### 軸 D — 原価帰属（`billing_kind`）※ entitlement とは別

「誰の AI 枠を消費したか / 試算上誰の原価か」。`gemini_usage_logs` · `docs/room-gathering-history-and-ai-billing-project.md`。

| `billing_kind` | 意味 | 典型トリガー |
|----------------|------|--------------|
| `participant_user` | ログインユーザー本人の操作 | 登録者の AI 付き選曲・@ |
| `guest_enjoy_owner_paid` | ゲスト操作だが部屋提供 | ゲストの選曲・@（**将来は U1 は AI 不可に**） |
| `room_owner` | 主催者・部屋共通 | tidbit、AI エージェント選曲 API |
| `ai_agent` | AI キャラ | エージェント発話 |

**Phase B 以降の意図**: U1 の AI 付き選曲を止め、`guest_enjoy_owner_paid` の **新規増加を抑える**（既存ログ定義は維持）。U2 の消費は **`participant_user` + trial テーブル** で紐づける。

### 判定に使う識別子（実装）

| 用途 | ソース |
|------|--------|
| ログイン可否 | Supabase セッション |
| ゲストか | `sessionStorage` / API の `isGuest` |
| お試し残 | `user_ai_trial.songs_remaining`（Phase B） |
| @質問 残 | `user_ai_trial.at_questions_remaining` |
| 選曲 AI 可否 | 上記 → **`aiMode`: `full` \| `none`** |
| 主催者か | `room-live-status` · `room_gatherings.created_by` |
| 原価帰属 | `resolveGeminiUsageAttribution()` 等 |

### 状態遷移（登録ユーザー）

```
[新規登録 A1]
    → メール未確認 B4（選曲のみ）
    → メール確認 → B1（10曲付与）
         → AI付き選曲 / @ で消費
         → songs_remaining = 0 → B2（選曲のみ無料）… 本プランの終着点（Phase D 前）
         → Phase D: チャージ → B3
```

ゲスト **U1** → 登録 → **B4 or B1**（確認済みなら即 B1）。

---

## AI 機能: 部屋設定（オーナー）とユーザー設定（確定案）

**2 層**: 部屋＝天井（禁止）、ユーザー＝自分の選曲 1 回だけ opt-out。  
**AI エージェント**は部屋設定のみ（オーナー専用・個人スイッチなし）。

### 選曲付随 AI（解説・クイズ・おすすめ）

| 機能 | 部屋 OFF | 部屋 ON + 自分 OFF | 部屋 ON + 自分 ON |
|------|----------|-------------------|-------------------|
| **曲解説** | 全員出ない。自分 ON 不可 | 自分の選曲だけ出ない | 出る |
| **曲クイズ** | 出ない（解説 OFF も同様）。自分 ON 不可 | 自分の選曲だけ出ない | 解説のあと出る |
| **おすすめ曲** | 全員出ない。自分 ON 不可 | 自分の選曲だけ出ない | 出る |

**曲クイズ追加ルール**

- 部屋・自分の **解説が ON** のときだけ、自分のクイズを ON にできる（解説 OFF ならクイズ ON 不可）。
- 部屋クイズ OFF → 自分 ON 不可。
- 部屋 ON + 解説 ON + クイズ ON → 自分だけクイズ OFF 可。

**おすすめ曲**: 解説 ON/OFF に**依存しない**（部屋・自分の 2 段のみ）。

### AI エージェント

| 項目 | 扱い |
|------|------|
| 誰が決める | オーナーのみ |
| UI | **部屋設定（オーナー）タブのみ** |
| ユーザー個人 | ON/OFF なし（全員同じ体験） |
| お試し 10 曲 | 選曲者枠とは別（部屋共通 AI） |

### 実装メモ

- ユーザー側: `user_room_ai_features`（`PUT /api/user/room-ai-features`）。解説 OFF 保存時はクイズも false に正規化。
- 部屋側: Ably 同期（comment-pack スロット・`ownerSongQuiz`・`ownerNextSongRecommend`・エージェント参加）。
- マイページ: `roomAiOwnerPolicy` で参加者 UI の無効化。`MyPage.tsx` の早見表参照。

---

## 表示名・バッジ判別ルール（案）

ユーザーが選んだ **ニックネーム（表示名）本文は改変しない**。既存の `（ゲスト）` suffix・AI 参加者の violet **`AI` チップ**（`UserBar.tsx`）・👑 と同様、**名前の外側にバッジ**で 3 種類を判別する。

### 原則

| # | 原則 |
|---|------|
| 1 | **表示名文字列に「有料」「貧乏」等を埋め込まない**（ログ・メンション・履歴が壊れる） |
| 2 | 判別用は **`participantTier`**（下表）を presence / チャットメタに載せ、UI が描画 |
| 3 | **② 無料を貫く** は他人に **目立つラベルを付けない**（差別・ストーカー感を避ける） |
| 4 | **③ AI 利用** も他人には **控えめ**。自分だけ残数をはっきり表示 |
| 5 | 選曲メッセージは **`aiMode: full`** のときだけ **曲行に ✦**（AI 付き選曲だった印） |

### `participantTier`（内部 enum 案）

| 値 | 大分類 | 条件 |
|----|--------|------|
| `guest` | ① | `user_id` なし |
| `registered_free` | ② | 登録済み & AI 枠なし（B2/B4、または B1 でも常に AI なし選曲のみ） |
| `ai_trial` | ③ | B1 · `songs_remaining > 0` |
| `ai_paid` | ③ | B3（Phase D） |

※ `registered_free` は **U3 が終着**した人も、**最初から AI を使わない U2** も同じ見た目（他人からは区別しない）。

### 表示ルール一覧

| 場所 | ① ゲスト | ② 無料を貫く | ③ AI（お試し / 有料） |
|------|----------|--------------|------------------------|
| **UserBar 参加者チップ** | 既存 **`（ゲスト）`** suffix を継続。または chip `ゲスト`（9px・gray） | **バッジなし**（表示名のみ） | **バッジなし**（他人）。**自分**のみ suffix `（AI残 N）` または送信欄上に表示 |
| **チャット発言ヘッダ** | 名前 + 薄 gray `ゲスト` ラベル（9px） | 表示名のみ | 表示名のみ。@ 返答行は従来どおり |
| **選曲 URL 投稿行** | — | ラベルなし | **`aiMode=full` の行だけ** 曲名横に ✦ `AI`（violet・既存 AI チップと同系） |
| **マイページ** | ゲスト UI | 「**選曲のみ（無料）**」 | 「**AI お試し 残 N/20 曲**」/ 将来「残クレジット」 |
| **メンション挿入** | `名前さん` のみ | 同左 | 同左（tier をメンションに含めない） |

### バッジデザイン（Tailwind 目安・既存に合わせる）

```
① guest     … border-gray-600 bg-gray-800/80 text-gray-400  text-[9px]  「ゲスト」
③ ai song   … border-violet-500/70 bg-violet-900/35 text-violet-200 text-[9px] 「AI」または ✦ のみ
   (選曲行)   … AI エージェント chip と同系統（UserBar L365–372）
👑 主催      … 既存維持（tier とは独立）
🤖 AIキャラ  … 既存 violet「AI」維持（U8・participantTier 不要）
```

### 自分 vs 他人

| 情報 | 自分 | 他人 |
|------|------|------|
| ① ゲストである | 分かる | **分かる**（ゲスト badge） |
| ② vs ③ の区別 | マイページ・送信 UI で明確 | **原則非表示**（②も③も同じ名前） |
| お試し残 N/20 | **表示** | 非表示 |
| その人が AI 付きで選曲したか | — | **その曲の行だけ** ✦ で分かる |

### presence / Ably に載せるフィールド（案）

```ts
participantTier: 'guest' | 'registered_free' | 'ai_trial' | 'ai_paid';
trialSongsRemaining?: number;  // 本人 sync のみ or 本人 clientId のみ UI 反映
authUserId?: string;           // 既存
```

- **`trialSongsRemaining` は本人の client にだけ UI 反映**（他参加者に残数を晒さない）。
- ゲストは `authUserId` なし → tier は常に `guest`。

### 実装タッチポイント

| ファイル | 変更 |
|----------|------|
| `UserBar.tsx` | `ParticipantItem` に `participantTier` · ゲスト chip 統一 |
| `Chat.tsx` | 発言 `messageType=user` に tier ラベル（guest のみ） |
| `RoomWithSync` / `RoomWithoutSync` | presence publish · 選曲イベントに `aiMode` + ✦ |
| `src/lib/participant-tier.ts`（新規） | B 軸 → `participantTier` 変換 |

### Phase A で先行できるもの

- [ ] `participantTier` の型と **guest ラベルだけ**先実装（現状の `（ゲスト）` を chip 化）
- [ ] 選曲行 `aiMode` + ✦（**現状は全曲 full 扱い**でも UI だけ入れられる）
- [ ] 自分用「AI お試し 残 N/10」は **Phase B までダミー 10/10** 可

---

## プロダクト方針（確定事項）

### 対外メッセージ（案）

- **登録特典**: 「**AI 付き選曲 20 曲** 無料お試し」
- **20 曲後**: 「**選曲・再生・チャットは無料**のまま。AI 解説・クイズ・@ はチャージまたは月額プランで」
- **現時点（実装前）**: 引き続き **【現在無料】**（`src/lib/ai-usage-disclosure-copy.ts`）。本 MD のルールは **スイッチ ON 後**（軸 B0 → B1/B2）に有効。

### 利用者別（クイック参照）

詳細は上記 **「ユーザーの種類（整理）」**。要点のみ:

| タイプ | AI 付き選曲 | 選曲のみ | @ |
|--------|-------------|----------|---|
| **U1 ゲスト** | × | ○ | × |
| **U2 お試し中** | ○ | ○ | ○（5回枠） |
| **U3 選曲のみ派** | × | ○ | × |
| **U4 有料**（将来） | ○ | ○ | ○ |

### お試し 20 曲のルール

| 項目 | 値 | 備考 |
|------|-----|------|
| 付与量 | **20 曲** | 対外は「20 曲」固定（お試し中はクレジット表示にしない）。`AI_TRIAL_SONGS_GRANTED` |
| 消費単位 | **AI 付き選曲 1 回 = 1 曲** | NEW/DB の差はお試し中は**数えない**（分かりやすさ優先） |
| 生涯 | **1 アカウント 1 回** | 使い切り後は再付与しない（キャンペーンは別フラグ） |
| @ 上限 | **5 回**（お試し中・生涯） | 20 曲に含めない |
| メール | **確認済みのみ** お試し開始 | 捨てアカウント対策 |

> **日次 3 曲 cap は廃止**（2026-06 確定）。20 曲は **生涯合計のみ** でカウント。一晩使い切りは許容し、複垢抑制はメール確認・`user_id`・IP 補助・レート制限で行う。

### 含まれる AI（1 曲消費時）

選曲者が **AI 付き** で URL 送信した 1 回につき、既存どおり（可能な範囲）:

- comment-pack（曲解説）
- 曲クイズ（ゲート通過時）
- 次に聴くなら（有効時）
- 選曲に付随する YT メタ取得 等

**消費しないもの**: 部屋共通の豆知識 tidbit、他ユーザーの選曲に付く AI、主催者負担の部屋共通 AI（帰属は `room-gathering-history` 参照）。

---

## 2 モード: `aiMode`（選曲者単位）

`docs/monetization-options.md` の混在ルーム案を採用。**部屋単位ではなく選曲アクション単位**。

| `aiMode` | 意味 | API |
|----------|------|-----|
| `full` | AI 付き選曲 | comment-pack / song-quiz / next-song-recommend 等を呼ぶ |
| `none` | 選曲のみ | 再生・チャットのみ。Gemini 系は呼ばない |

### 判定フロー（選曲 POST 時）

```
1. C1 視聴専用 → aiMode = none
2. U1 ゲスト（A0）→ aiMode = none（AI 付きボタン非表示 or 登録誘導）
3. U5 メール未確認（B4）→ aiMode = none
4. ユーザーが「AI なしで選曲」明示 → none
5. U2 お試し残あり（B1）→ full（1 曲消費）
6. U4 有料枠あり（B3・将来）→ full
7. U3 お試し枯渇（B2）等 → none（UI で課金案内。選曲のみは可）
```

### 部屋混在

- 同一ルームで **曲ごと** に AI あり/なしが混在してよい。
- **禁止**: 「部屋に有料者が 1 人いるから全員 AI」（ただ乗り防止）。
- Ably イベントに **`aiMode` を載せ**、クライアントは相手の曲で AI UI を出し分ける。

### 二重ガード

1. 選曲クライアントが `aiMode` を付与  
2. **API 側**（comment-pack / commentary / song-quiz 等）で `billing_user_id` + 残数を再検証し、`none` や残 0 なら **403 + 課金案内**

---

## 抜け道対策（多層防御）

**VPN は IP だけでは防げない。** 優先度順:

| 優先 | 手段 | 実装目安 | 備考 |
|:----:|------|----------|------|
| 1 | **登録必須**で 10 曲 | Phase B | ゲストは AI 0 |
| 2 | **`user_id` 生涯 10 曲**（DB） | Phase B | 再ログインでリセットしない |
| 3 | **メール確認済み**のみ付与 | Phase B（判定は **`supabase-email-auth.ts`** 実装済） | Supabase Auth **Confirm email ON** |
| 4 | **IP 記録 + ソフト上限** | Phase C | 同一 /24 で新規お試し **3 アカウント/日** 等。家族・学校は誤爆に注意 |
| 5 | **レート制限** | 既存拡張 | `src/lib/chat-ai-rate-limit.ts`・YouTube 検索系。サーバーレスはインスタンス単位 → **Vercel Pro + WAF 併用** |
| 6 | **異常フラグ** | Phase C | 短時間に同一 IP から大量 signup → STYLE_ADMIN 通知 |
| 7 | VPN/プロキシ API | **将来** | コスト・誤検知あり。初期は必須にしない |

IP 取得: 既存 `getChatAiClientIp()`（`x-forwarded-for`）を trial 消費・signup 時に記録。

---

## 原価参考（お試し 20 曲）

| 想定 | 1 人あたり変動費目安 |
|------|----------------------|
| 20 曲すべて NEW 級 | 約 **32 円** |
| NEW/DB 混在（r≈0.3） | 約 **15 円** |
| 100 人が使い切り | 約 **1,500〜3,200 円** |
| 3,000 人が使い切り | 約 **4.5万〜9.6万円** |

固定費（Vercel Pro 等）に比べ小さい。**20 曲は ¥500 スターターと同量の試用**（体験・転換を厚くする方針。2026-07-18）。

---

## 将来の課金（Phase D 以降）

当面は **20 曲 + 選曲のみ無料** のみ実装済み。**商品・価格の確定目安**は **`docs/00-prepaid-pricing-summary.md`**（2026-07-02）。

| 商品 | 概要（v1 確定目安） |
|------|---------------------|
| **プリペイド** | **¥500＝20曲** · **¥1,000＝40曲**（1曲＝1クレジット · **@＝0.5クレジット**）。Stripe チャージ。NEW/DB 差は v1 では付けない |
| 月額ライト | **第2段**（実績後）。例: ¥980 / 40 クレジット — 未採用 |
| 表示参考 | 参加者向け **約 ¥1.4/曲**（`song-selection-cost-guide.ts`）は**請求単価ではない**（実請求は選曲約 ¥25・@約 ¥12.5） |

---

## データモデル（案）

SQL 確定後は **`docs/supabase-user-ai-trial-table.md`** を新設（未作成）。概略:

### テーブル `user_ai_trial`（1 行 / user_id）

| 列 | 型 | 説明 |
|----|-----|------|
| `user_id` | uuid PK | auth.users |
| `songs_granted` | int | 既定 **20** |
| `songs_remaining` | int | 残数 |
| `at_questions_granted` | int | 既定 **5** |
| `at_questions_remaining` | int | @質問 残 |
| `first_ip` | text | 監査 |
| `last_ip` | text | 監査 |
| `email_verified_at_grant` | timestamptz | 付与時の確認状態 |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### テーブル `user_ai_trial_consumption_log`（監査・異常検知）

| 列 | 型 | 説明 |
|----|-----|------|
| `id` | uuid | |
| `user_id` | uuid | |
| `kind` | text | `song_full` / `at_question` |
| `room_id` | text | |
| `video_id` | text | 任意 |
| `client_ip` | text | |
| `created_at` | timestamptz | |

### 消費 API（案）

- `GET /api/user/ai-trial` — 残数・@質問 残
- 内部: `consumeAiTrialSong(userId)` / `consumeAiTrialAtQuestion(userId)` — トランザクションで decrement

---

## 実装フェーズとチェックリスト

### Phase A — UX 準備（**全員 AI 無料のまま**）

- [x] 部屋 UI: **残り N/10 曲** 表示（`GET /api/user/ai-trial` · `AiTrialStatusBadge` · `AiUsageBillingNotice`。Phase B 前は **preview** で枠非消費）
- [x] マイページ参加履歴: **AI お試し 残 N/10** · @質問 残（同上）
- [x] 送信 UI: **「AI 付きで選曲」** / **「AI なしで選曲（無料）」** の二段（enforcement ON + お試し残あり時）
- [x] `AiUsageBillingNotice` / マイページ: お試し説明文（`ai-usage-disclosure-copy.ts` · ステータス行）
- [x] ゲスト: AI 付きボタン非表示 + 登録誘導（`onGuestAiSelectionBlocked`）

### ゲスト UX（U1）— 2026-07 実装

同期部屋を中心に **ゲストは選曲・同時視聴のみ**、AI・お試し枠は登録後、という体験をコードと文言で揃えた。

- [x] `@` 質問: クライアント早期 return + `/api/ai/chat` でゲスト拒否（`guest_ai_unavailable` · enforcement 無関係）
- [x] 選曲: `aiMode=none`（ゲストは AI 付きボタン非表示）
- [x] ヘッダー: ゲスト単独かつ登録参加者なし時、AI 曲解説・クイズ・おすすめピルを OFF 表示（`roomHasRegisteredParticipant`）
- [x] `AiUsageBillingNotice`: ゲストは非表示
- [x] 視聴履歴: ゲスト単独時は入室以降のみ（`isGuestSoloSession` · API `since`）
- [x] 初回選曲後ヒント: ゲスト単独・自分の 1 曲目のみ 1 回（`guest-first-song-invite.ts`）
- [x] 登録導線: 機能比較表（`guest-register-feature-compare.ts`）— 登録モーダル · マイページ（ゲスト）表下に「ユーザー登録」
- [x] 文言: 同時視聴はゲスト可、AI・AI参加は登録後（ヒント文・比較表で統一）

| ファイル | 内容 |
|----------|------|
| `src/lib/guest-first-song-invite.ts` | 初回選曲後メッセージ |
| `src/lib/guest-solo-playback-history-since.ts` | ゲスト単独判定 |
| `src/lib/guest-register-feature-compare.ts` | 登録モーダル・マイページ比較表 |
| `src/components/auth/GuestRegisterFeatureCompareTable.tsx` | 表 UI |
| `src/app/api/ai/chat/route.ts` | ゲスト `@` ブロック |
| `src/components/mypage/MyPage.tsx` | ゲスト比較表 + 登録ボタン |

### Phase B — コア（お試し消費 + `aiMode`）

- [x] Supabase: `user_ai_trial` SQL（`docs/supabase-user-ai-trial-table.md` · `supabase-setup.md` 第 23 章）
- [x] 新規/既存: **メール確認済み**初回 `GET /api/user/ai-trial` で `songs_remaining=10` 付与
- [x] 選曲パイプライン: イベントに `aiMode` 付与（`RoomWithSync` / `RoomWithoutSync` · `PlaybackMessage`）
- [x] comment-pack / commentary / song-quiz / next-song-recommend / chat: **サーバー側ガード**
- [x] 1 曲消費 = `comment-pack` / `commentary` の**本文成功時**のみ（事前は `consume: false` で残数チェック → 成功後 `commitAiTrialSongSelection`。失敗・skip では減らない）
- [x] `@` 5 回 cap（`/api/ai/chat` · AI メンション時）
- [x] 残 2 曲で secondary 案内（`formatAiTrialStatusSecondaryLine` 既存）
- [ ] **本番 ON**: Supabase SQL 実行 + `AI_TRIAL_ENFORCEMENT_ENABLED=1`（`.env.local` / **Vercel**）— ローカルでは実機確認済み、**デプロイ後 10 曲検証**が次

### 登録ユーザー UX 追補（U2）— 2026-07-01 実装

ローカルで **メール登録ユーザー** のお試しフローを実機確認し、抜け・表示を追補した。

| # | 項目 | 状態 |
|---|------|------|
| 1 | **AI 曲解説が出ない** — `resolveAiSelectionMode` が通常選曲で `none` になりすぎる | [x] 修正（お試し残ありは既定 `full` · 明示 `none` のみ AI なし） |
| 2 | **@ 質問が枠消費されない** — `forceReply` 時に `!forceReply` でガードスキップ | [x] 修正（`POST /api/ai/chat`） |
| 3 | 送信欄上 **お試しバナー** — 残数 1 行 + ▲▼ 開閉（詳細は展開時のみ） | [x] `AiUsageBillingNotice` |
| 4 | お試し残数の **UI 再取得** — 選曲・@ 消費後にヘッダー／バナー同期 | [x] `useAiTrialStatus` + `AI_TRIAL_STATUS_UPDATED_EVENT` |
| 5 | 表示文言 **@質問 残**（`@ 残` → `@質問 残`） | [x] `formatAiTrialStatusPrimaryLine` |
| 6 | マイページ **質問履歴** タブ（参加履歴の隣・単独） | [x] `MyPageMainTab: questionHistory` |
| 7 | **@ 質問と AI 回答** 一覧（`room_chat_log` · 最大 30 件） | [x] `GET /api/user/at-question-history` · `UserAtQuestionHistory` |
| 8 | 質問履歴に **料金目安**（ガイド + `gemini_usage_logs` 突合） | [x] `at-question-cost-guide.ts` · `AtQuestionCostGuide` |

**単体テスト**: `src/lib/ai-selection-mode.unit-test.ts`（選曲 `aiMode` 既定）

**無課金（お試し）ユーザーとしての判定（2026-07-01）**: コアは **実用 OK**。抜けは主に **本番 env**・**consumption_log SQL 任意**・**枯渇後課金導線（Phase D）**・**運用・不正対策（Phase C 残）**。

| ファイル | 内容 |
|----------|------|
| `src/lib/ai-selection-mode.ts` | 選曲 `aiMode` 解決 |
| `src/components/room/AiUsageBillingNotice.tsx` | 部屋・折りたたみバナー |
| `src/hooks/useAiTrialStatus.ts` | 残数フェッチ + 消費イベント |
| `src/lib/user-at-question-history.ts` | 質問履歴取得・コスト突合 |
| `src/app/api/user/at-question-history/route.ts` | 質問履歴 API |
| `src/components/mypage/UserAtQuestionHistory.tsx` | 質問履歴 UI |
| `src/lib/at-question-cost-guide.ts` | @ 1 回料金目安 |
| `src/components/shared/AtQuestionCostGuide.tsx` | 料金ガイド UI |

### Phase C — 不正・運用

- [x] IP 記録（`first_ip` / `last_ip` — 付与・消費時に `user_ai_trial` 更新）
- [ ] 同一 IP 新規アカウントソフト上限 + 管理通知
- [x] `user_ai_trial_consumption_log`（SQL + 消費時 INSERT。テーブル未作成時はログのみ失敗）
- [x] 管理画面: ユーザー別 trial 残数・消費ログ（`/admin/user-ai-trial`）
- [ ] レート制限の env チューニング（`CHAT_AI_RATE_LIMIT_*`）

### Phase D — 課金接続（プリペイド中心 · `docs/00-prepaid-pricing-summary.md`）

- [ ] `user_ai_credits` + 取引ログ SQL
- [ ] Stripe Checkout（¥500 / ¥1,000）+ Webhook でクレジット加算
- [ ] trial 枯渇後のクレジット残による `full` 判定
- [ ] 選曲・@ 成功時のクレジット消費（選曲 **1** · @ **0.5**）
- [ ] UI: 残クレジット・枯渇時チャージ導線
- [ ] 利用規約・FAQ 固定化
- [ ] （後回し）月額サブスク · NEW/DB 差別消費

---

## 触るコード（索引）

| 領域 | パス |
|------|------|
| 部屋 UI | `src/components/room/RoomWithSync.tsx` · `RoomWithoutSync.tsx` · `ChatInput.tsx` |
| 選曲 / comment-pack | `src/app/api/ai/comment-pack/route.ts` · `commentary` · `song-quiz` |
| @ | `src/app/api/ai/chat/route.ts` · `src/lib/chat-ai-rate-limit.ts` |
| 参加者文言 | `src/lib/ai-usage-disclosure-copy.ts` |
| **お試し残数 UI** | `src/lib/ai-trial-status.ts` · `GET /api/user/ai-trial` · `AiTrialStatusBadge.tsx` · `useAiTrialStatus.ts` · `AiUsageBillingNotice.tsx` |
| **お試し消費・ガード** | `src/lib/user-ai-trial-server.ts` |
| **選曲 aiMode** | `src/lib/ai-selection-mode.ts` |
| **質問履歴** | `src/lib/user-at-question-history.ts` · `GET /api/user/at-question-history` · `UserAtQuestionHistory.tsx` |
| **@ 料金目安** | `src/lib/at-question-cost-guide.ts` · `AtQuestionCostGuide.tsx` |
| **ゲスト UX** | `guest-first-song-invite.ts` · `guest-solo-playback-history-since.ts` · `guest-register-feature-compare.ts` |
| **メール確認** | `src/lib/supabase-email-auth.ts` · `SimpleAuthForm.tsx` · `/auth/callback` |
| 帰属 | `src/lib/gemini-usage-attribution.ts` · `gemini-usage-log.ts` |
| 管理 | `src/config/admin-sections.ts` |
| 収支試算 | `src/lib/monetization-simulation-assumptions.ts` |

---

## 参加者向け文言（案・`ai-usage-disclosure-copy.ts` へ移植）

```
【お試し】登録ユーザーは AI 付き選曲を **生涯 20 曲**まで無料でお試しいただけます（1 日の上限はありません）。
20 曲を超えたあとも、選曲・再生・通常チャットは無料です。
AI 解説・曲クイズ・@ による質問は、今後クレジットまたは月額プランでご利用いただく予定です。
【現在】上記の前に、AI 機能はすべてサイト管理者負担で無料提供中です。
```

---

## 実装ログ

| 日付 | 内容 |
|------|------|
| 2026-06-30 | 初版: 10 曲お試し・選曲のみ無料・`aiMode`・多層防御・Phase A–D を確定 |
| 2026-06-30 | **ユーザーの種類** 章追加（軸 A–D · 合成 U1–U8 · 状態遷移） |
| 2026-06-30 | **3種類大枠** + **表示名・バッジ判別ルール** 追加 |
| 2026-06-30 | **確定**: 10 曲お試しは Google/メール **登録ユーザーのみ**（ゲスト 0 曲） |
| 2026-06-30 | **メール登録 Confirm email ON**: `emailRedirectTo` · 未確認ログイン拒否 · 再送信 · コールバック案内（Supabase ダッシュボードで Confirm email ON が必要） |
| 2026-06-30 | **日次 3 曲 cap 廃止**: お試しは **生涯合計のみ**。`songs_used_today` / `trial_day_key` はデータモデルから除外 |
| 2026-06-29 | **Phase B**: `user_ai_trial` · `aiMode` · API ガード · 二段選曲 UI · `AI_TRIAL_ENFORCEMENT_ENABLED` |
| 2026-07-01 | **ゲスト UX（U1）**: `@` ブロック · 単独時視聴履歴セッション限定 · 初回選曲ヒント · 登録比較表（モーダル・マイページ） |
| 2026-07-01 | **Phase C 着手**: `user_ai_trial_consumption_log` SQL + 消費時 INSERT |
| 2026-07-01 | **登録ユーザー UX 追補**: `aiMode` 既定 `full` 修正 · `@` 枠消費修正 · バナー折りたたみ · 質問履歴タブ · 料金目安 · `@質問 残` 表示 |
| 2026-07-01 | **ローカル実機**: ハチアカウントで 8/10 曲・@質問 4/5 消費・質問履歴表示を確認 |
| 2026-07-02 | **プリペイド方針確定目安**: プリペイド中心 · ¥500＝20曲 · ¥1,000＝40曲 · 1曲＝1クレジット · `docs/00-prepaid-pricing-summary.md` |
| 2026-07-18 | **お試し付与 10→20 曲**（`AI_TRIAL_SONGS_GRANTED`）。既存行は差分加算で 20 に揃える（`computeTrialSongsGrantBump` · 任意 SQL） |

---

## 次のステップ（優先順・Todo）

### いま（運用・検証）

- [ ] **Vercel デプロイ** — 最新 main（登録ユーザー UX 追補込み）
- [ ] **本番 env** — `AI_TRIAL_ENFORCEMENT_ENABLED=1` · `GEMINI_API_KEY` · `SUPABASE_SERVICE_ROLE_KEY`
- [ ] **Supabase** — `user_ai_trial` 作成済み確認（済ならスキップ）
- [ ] **10 曲 + @5 回の実機検証**（本番 URL · 登録アカウント）— 残数減少・曲解説・質問履歴・料金目安
- [ ] **任意** — `user_ai_trial_consumption_log` SQL 実行（`docs/supabase-user-ai-trial-table.md` 末尾）

### Phase B 残・UX 任意

- [ ] 選曲行 **`aiMode` + ✦** 表示（チャット上で AI 付き選曲だった印）
- [ ] **`participantTier`** バッジ（ゲスト chip 統一）
- [ ] **10 曲 / @5 回 使い切り後**の案内強化（専用バナー・マイページ文言。課金導線は Phase D まで簡易で可）

### Phase C — 不正・運用

- [ ] 同一 IP 新規アカウント **ソフト上限** + 管理通知
- [x] 管理画面: **ユーザー別 trial 残数・消費ログ**（`/admin/user-ai-trial`）
- [ ] `CHAT_AI_RATE_LIMIT_*` 本番チューニング

### Phase D — 課金（`docs/00-prepaid-pricing-summary.md`）

- [ ] Stripe プリペイド（¥500＝20 · ¥1,000＝40）
- [ ] クレジット残高テーブル + trial 枯渇後の `full` 判定
- [ ] 利用規約・FAQ（お試し 10 曲・選曲のみ無料・プリペイド残高）

---

## 次のステップ（要約・1 行）

1. **デプロイ → 本番 10 曲検証**（最優先）
2. **Phase C** — IP 上限・管理画面 trial 一覧
3. **Phase A 任意** — ✦ · participantTier
4. **Phase D** — 課金接続

---

## 関連ドキュメント

| ファイル | 内容 |
|----------|------|
| **`docs/00-prepaid-pricing-summary.md`** | **プリペイド商品・¥1,000＝40曲・損益（Phase D 価格正本）** |
| `docs/monetization-options.md` | 収益モデル・収支シミュ・クレジット詳細 |
| `docs/room-gathering-history-and-ai-billing-project.md` | 原価帰属・管理画面 Phase 1–3 |
| `docs/ai-paid-service-reference-examples.md` | 他社 AI 有料事例 |
| `docs/email-registration-spec.md` | メール登録・Confirm email |
| `src/lib/song-selection-cost-guide.ts` | 運営原価目安（表示用・請求ではない） |
| `src/lib/at-question-cost-guide.ts` | @ 運営原価目安（表示用・請求ではない） |
| `docs/supabase-user-ai-trial-table.md` | `user_ai_trial` · `consumption_log` SQL |

---

## 更新ルール（コーディング AI・運用者向け）

1. **方針変更**（曲数・ゲストルール）→ 本 MD の表 + **実装ログ** + 必要なら `ai-usage-disclosure-copy.ts`
2. **Phase 完了** → チェックリストを `[x]` + ステータス行更新
3. **SQL 追加** → `docs/supabase-user-ai-trial-table.md` を作成し本 MD からリンク
4. **課金商品確定** → `monetization-options.md` と本 MD の Phase D を同期

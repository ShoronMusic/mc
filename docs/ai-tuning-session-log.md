# AI チューニング・セッションログ（時系列）

**目的**: 実際の会話で出た課題 → コード／プロンプトの変更 → 期待する効果を短く残し、後から AI や人間で振り返り・効果検証する。

**運用**: チューニングや仕様変更があった日に追記する。古いものはアーカイブせず上に近いほど新しい（または日付見出しで逆順にする）。**本ファイルは日付見出し＝新しい順**推奨。

---

## 2026-04-09（木）

| 時系列 | 会話・事象（要約） | 修正箇所 | 対応内容・期待効果 |
|--------|-------------------|----------|-------------------|
| 1 | `@アヴリル・ラヴィーンは２０００年代半ばバブルガム・パンク…` に対し、AI がデビュー（『Let Go』、`Complicated` / `Sk8er Boi`）に戻り、ユーザー指定の**年代（半ば）とずれる**。2005–06 頃の話もしたい。 | `src/lib/gemini.ts` | `forceReply` 用 `atMentionBlock` に **年代・時期明示時はその時代の作品・話題を優先**、デビュー／初期例の安易な持ち出し禁止、ジャンル談義でも年表上の位置を尊重、検索用ブロックも本文の時代に合わせる。2 回目再生成追記に「指定年代から外れてデビュー話に戻さない」を追加。 |
| 2 | `@でもこの頃彼女は大きな病気になったとか？`（2013 アルバム文脈）が **AI 質問ガードで非音楽扱い** → イエローカード連動（当時仕様）。アーティスト経歴上の病気・スランプ・スキャンダルは会話の自然な延長。 | `src/lib/ai-question-guard-prompt.ts`<br>`src/lib/is-music-related-ai-question.ts`<br>`is-music-related-ai-question.unit-test.ts` | 分類プロンプトに **キャリア史・バイオとしての病気／活動休止／スランプ等は musicRelated true**（直近にアーティスト文脈があれば特に）。false は **本人・家族の医学相談**に限定。クライアント側に `大きな病気`・`活動休止`・`闘病` 等のキーワードとテストを追加。 |
| 3 | 上記のようなケースで **イエローカードは重すぎる**。非音楽判定時は柔らかく「音楽の話題ではなさそうなので控えて」と出す程度にしたい。 | `src/lib/chat-system-copy.ts`（`buildAiQuestionGuardSoftDeclineMessage` ほか）<br>`RoomWithoutSync.tsx` / `RoomWithSync.tsx`<br>`GuideFullNotice.tsx` / `app/guide/ai/page.tsx`<br>`ChatInput.tsx`<br>`ai-question-guard-exempt-user-ids.ts`（コメント） | ブロック時 **警告カウント増加・イエローカード・強制退場を廃止**。統一の軽い案内文＋異議導線。利用案内・モーダル文言を現仕様に合わせて更新。`applyAiQuestionGuardEvent` の `ban` は互換のため残置（現行ガードからは未送信）。 |
| 4 | 会話→選曲→曲解説が **別プロンプト**でつながっていない。DB 再利用 `[DB]` も文脈なし。 | `src/lib/comment-pack-session-context.ts`<br>`src/app/api/ai/comment-pack/route.ts`<br>`RoomWithSync.tsx` / `RoomWithoutSync.tsx`（`recentMessages` 送信）<br>`AGENTS.md` | `recentMessages`（直近 user/ai 最大18件）を **新規生成の基本・自由スロット**に注入。**ライブラリ返却時**は固定本文の前に **つなぎ 1 呼び出し**（`comment_pack_session_bridge`）。`COMMENT_PACK_SESSION_CONTEXT=0` でオフ。 |
| 5 | ログインユーザー別に **趣向の要約**を持ち、AI をパーソナライズしたい。 | `user_ai_taste_summary`（SQL: `docs/supabase-setup.md` 14）<br>`/api/user/ai-taste-summary`<br>`src/lib/user-ai-taste-summary.ts`<br>`gemini.ts`（`@` 時のみ注入）<br>マイページ「AI向けの趣向メモ」<br>`recorded-data-fields.md` | マイページで編集→**「@」チャット**の `generateChatReply` に短いブロックで注入。`/api/ai/chat` は `credentials: 'include'`。 |
| 6 | 会話ログ・選曲・お気に入り・マイリストを **縦断**して自動要約し、参加直後から AI が読めるようにしたい。 | `user_ai_taste_auto_profile`（SQL: 15）<br>`POST /api/user/ai-taste-auto-refresh`<br>`gather-user-taste-signals.ts`<br>`user-ai-taste-context.ts`<br>マイページ「履歴から自動要約を更新」 | 複数テーブルをテキスト化→Gemini で短文→手動メモと合算して `@` に注入。**入室定型あいさつ**には未注入（将来 tidbit / 入室 API で拡張可）。 |

**検証メモ（後で埋める）**

- [ ] 年代を明示した `@` で、デビュー話に戻りにくくなったか
- [ ] アーティスト経歴フォローがガードで弾かれないか（必要なら本番ログ／異議データ）
- [ ] 非音楽 `@` で案内のみ・カードなしになっているか
- [ ] 会話直後の選曲で基本／自由解説が文脈とずれにくいか、`[DB]` でつなぎが付くか
- [ ] 趣向メモを保存したユーザーで「@」応答が過不足なく寄るか（テーブル未作成時の 503 も確認）

---

## 追記テンプレ（コピー用）

```markdown
### YYYY-MM-DD（曜）

| 順 | 会話・事象 | 修正箇所 | 対応・期待効果 |
|----|------------|----------|----------------|
| 1 | | | |

**検証メモ**

- [ ]
```

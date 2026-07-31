# 運用者向け設定（コードを依頼せずに編集）

## `artist-compound-extra.json`

`&` や `and` が含まれても**1組のアーティスト**として扱う名前の**マスタ一覧**です。要素は**文字列**か、略称を正式名に寄せる**オブジェクト**です。

新規追加の例（文字列）:

```json
[
  "…既存の行…",
  "Crosby, Stills, Nash & Young"
]
```

略称・通称を正式名に揃える例（`Hall & Oates` → `Daryl Hall & John Oates`）:

```json
[
  {
    "canonical": "Daryl Hall & John Oates",
    "aliases": ["Hall & Oates", "Hall and Oates"]
  }
]
```

- 照合は大文字小文字を区別しません。**`and` と `&` は正規化で同一**なので、`Simon & Garfunkel` と `Simon and Garfunkel` のように2行書く必要はありません（先に出した1行の表記が表示用の正規形になります）。
- **配列の前の方に書いた表記が「正規表記」として優先**されます（同じ正規化キーは先勝ち）。
- 編集後は **開発サーバー／本番の再ビルド・再デプロイ** が必要です。

## `music8-main-artist-aliases.json`

画面上のメインアーティスト表記と異なる名前で **Music8 の JSON／スラッグを引きたい**ときに使います。

配列の各要素は次の形です。

| フィールド | 意味 |
|-----------|------|
| `from` | YouTube 由来などの「合体アーティスト」表記（`artist-compound-extra` と揃えておくと安全） |
| `music8As` | Music8 側で検索するときのアーティスト名（例: ソロ名） |

例（ファイル先頭にサンプルとして入っています）:

```json
[
  { "from": "Prince & The Revolution", "music8As": "Prince" }
]
```

- 編集後は **再ビルド・再デプロイ** が必要です。

## `artist-search-nicknames.json`

ライブラリ検索（`/api/library/search`・`match-main-artists`）で、**愛称・略称**から既存アーティストに届けるマスタです。

| フィールド | 意味 |
|-----------|------|
| `canonical` | 優先表示・`artists.name` / `main_artist` に近い正規表記 |
| `nameJa` | 和名（任意） |
| `alsoSearch` | 追加で ilike する別名（任意） |
| `nicknames` | ドリカム・ミスチルなどの愛称 |

- クエリ**全体**が愛称／和名／正規名に一致したときだけ展開します（「ドリカムの曲」は展開しません）。
- アプリ側の展開が主。DB の `artists.aliases`（任意列）にも同じ愛称を入れておくと、JSON 未更新でも配列完全一致でヒットできます。SQL は `docs/supabase-songs-and-performances-tables.md` の「アーティスト愛称」節。
- 編集後は **再ビルド・再デプロイ** が必要です。

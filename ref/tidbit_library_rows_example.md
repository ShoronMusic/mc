# tidbit_library 一例（整理表示）

`tidbit_library_rows.json` の内容をアーティスト・曲ごとに整理した一例です。

---

## 記録日（created_at）の状況

| 項目 | 値 |
|------|-----|
| **総件数** | 47 件 |
| **記録が存在する日** | **2026-03-15 の 1 日だけ** |
| **最古** | 2026-03-15 03:08:04 (UTC) |
| **最新** | 2026-03-15 07:19:48 (UTC) |

→ この JSON は **1 日分（約 4 時間強の利用）** のエクスポートです。  
少なく感じるのは、複数日にわたる蓄積ではなく、**その日のセッションで披露された豆知識だけ**が含まれているためです。  
Supabase の本番テーブルには、別の日に披露された豆知識もあれば、それらはこのファイルには含まれていません。

---

## テーブル構造（カラム）

| カラム | 説明 |
|--------|------|
| id | UUID（主キー） |
| body | 豆知識の本文 |
| video_id | 披露時点の YouTube video_id |
| artist_name | アーティスト名（チャンネル名のままのものあり） |
| song_title | 曲名・動画タイトル |
| keywords | 検索用（artist_name, song_title の連結） |
| room_id | ルームID |
| style | 曲のスタイル（このサンプルでは未設定の行あり） |
| created_at | 登録日時 |

---

## アーティスト別 件数（このサンプル内）

| アーティスト名 | 件数 | 備考 |
|----------------|------|------|
| YG | 8 | 同一曲「STATE OF EMERGENCY」で複数豆知識 |
| Charlie Sexton (CharlieSextonVEVO) | 7 | 同一曲「Beat's So Lonely」で複数 |
| DaBaby | 5 | 同一曲「POP DAT THANG」で複数 |
| Mötley Crüe | 4 | 同一曲「Home Sweet Home」で複数 |
| Glenn Frey (GlennFreyVEVO) | 5 | 同一曲「The Heat Is On」で複数 |
| Def Leppard (DefLeppardVEVO) | 4 | 同一曲「Bringin' On The Heartbreak」で複数 |
| Taylor Swift | 4 | 同一曲「Shake It Off」で複数 |
| Mark Ronson (MarkRonsonVEVO) | 3 | 同一曲「Uptown Funk」で複数 |
| Van Halen | 3 | 同一曲「Can't Stop Lovin' You」で複数 |
| その他 | 各1〜2 | Justin Timberlake, Steve Perry 等 |

---

## 1件の行の例（フル）

```
id:           049966d9-b386-492d-948d-5c478de180f0
body:         YGはこの曲でもそうですが、自身の出身地であるコンプトンのリアルなストリートの声を音楽で表現し続けていますね。
video_id:     PYM_6Pb7MJs
artist_name:  YG
song_title:   YG - STATE OF EMERGENCY [Official Music Video]
keywords:     YG, YG - STATE OF EMERGENCY [Official Music Video]
room_id:      01
created_at:   2026-03-15 03:08:04.752452+00
```

---

## 同一曲で複数豆知識の例（YG - STATE OF EMERGENCY）

| 登録時刻 | 豆知識（body） |
|----------|----------------|
| 03:01 | YGは、西海岸のギャングスタラップシーンを代表するアーティストの一人ですね。この『STATE OF EMERGENCY』というタイトルも、当時の社会情勢を色濃く反映していると言われています。 |
| 03:02 | YGは、ウェストコーストヒップホップの旗手として知られていますが、実は彼の名前「YG」は「Young Gangsta」の略なんです。 |
| 03:03 | YGは、ウェストコースト・ヒップホップの旗手として知られていますが、彼の楽曲には実体験に基づいたリアルなメッセージが込められています。 |
| 03:04 | YGの「STATE OF EMERGENCY」は、2020年にリリースされ、当時のアメリカ社会の緊迫した状況や社会問題を反映した強いメッセージが込められています。 |
| 03:05 | YGといえば、社会問題や政治的なメッセージを込めた楽曲が多いことで知られていて、特にトランプ政権下では大きな話題になりましたね。 |
| 03:06 | YGは、自身の地元コンプトンを「Bompton」と呼ぶことで、自身の所属を表す独特な表現を使うことがありますね。 |
| 03:08 | YGはこの曲でもそうですが、自身の出身地であるコンプトンのリアルなストリートの声を音楽で表現し続けていますね。 |
| 03:09 | YGはこの曲でもタフな姿を見せていますが、彼が所属していた「Bompton」というブロックが、彼のラップスタイルに大きな影響を与えているんですよ。 |

---

## 曲・アーティスト別 代表1件ずつ

| アーティスト | 曲 | 豆知識（抜粋） |
|--------------|-----|----------------|
| **Mötley Crüe** | Home Sweet Home | Mötley Crüeの「Home Sweet Home」は、ジョン・ボン・ジョヴィが自身の「Wanted Dead or Alive」を作るきっかけになったとも言われています。 |
| **Charlie Sexton** | Beat's So Lonely | この曲のチャーリー・セクストン、実は長年ボブ・ディランのツアーバンドで素晴らしいギターを弾いているんですよ。 |
| **Van Halen** | Can't Stop Lovin' You | ところで、80年代後半から90年代にかけて、バラード曲がヒットチャートを賑わすロックバンドも多かったですよね。 |
| **Taylor Swift** | Shake It Off | 2010年代のポップミュージックって、R&Bやエレクトロの要素を取り入れて、よりダンスフロアを意識した曲が増えましたよね。 |
| **Mark Ronson** | Uptown Funk | この曲のようなレトロ感溢れるファンクサウンドは、2010年代に改めて多くのアーティストが取り入れましたよね。 |
| **Glenn Frey** | The Heat Is On | ところで、80年代のポップスは映画やMTVのブームと相まって、音楽シーンを大きく変えましたね。 |
| **Def Leppard** | Bringin' On The Heartbreak | 80年代といえば、ブリティッシュ・ハードロックは多彩な進化を遂げました。メロディアスなアリーナロックから、よりヘヴィなサウンドまで。 |

---

## 補足（このサンプルから分かること）

- **artist_name** にチャンネル名がそのまま入っている行がある（例: `CharlieSextonVEVO`, `GlennFreyVEVO`）。現在の実装では `cleanAuthor` により「Prince - Topic」→「Prince」のように正規化して保存するため、新規登録分はアーティスト名が統一されやすくなる。
- 同一 **video_id**・同一曲で、複数回の無発言トリガーにより **複数の豆知識** が蓄積されている。
- **style** はこのエクスポートには含まれていないが、テーブルには存在し、検索時に再生中曲のジャンルと一致する [DB] のみ返すために使われる。

/**
 * Music8 WP カテゴリー編集の Gemini プロンプト（functions.php rectus_default_gemini_artist_category_prompt）準拠。
 */

export type AdminArtistProfileCatalog = 'domestic' | 'western';

export function buildAdminArtistProfilePrompt(
  artistName: string,
  catalog: AdminArtistProfileCatalog = 'domestic',
): string {
  const domesticNote =
    catalog === 'domestic'
      ? '\n【邦楽（日本のアーティスト）の追加ルール】\n' +
        '- Origin は原則 `JPN`（海外出身で活動拠点が日本の場合は出典に従い `US(based in JPN)` 等の1トークン表記可）。\n' +
        '- 日本語読みは必須（カタカナ。既にカタカナ表記の名前はそのまま）。\n' +
        '- 本文の日本語段落は邦楽アーティストとして自然なトーンで。\n'
      : '';

  const template =
    '以下のアーティストについて、出典（英語版 Wikipedia 等）で裏取りできる事実のみを書く。未確認は値 "-"、推測は書かない。\n\n' +
    `アーティスト名: ${artistName}\n` +
    domesticNote +
    '\n【本文「本文」キーの中身】\n' +
    '英語1行 + 改行 + 日本語1ブロック（連続した1段落。読点・接続でつなぐ）。JSON 内では改行を \\n で表現。\n\n' +
    '■ 英語（1行・1文）\n' +
    'パターン例: [Name] is a [形容] [国籍] [musician/band/singer-songwriter/duo 等], [代表作・時代・ジャンル・受賞などを関係詞で1文に収める].\n' +
    'world-renowned / legendary / Grammy-winning 等の位置づけ語と、ジャンル横断・代表曲・活動の軸を簡潔に含める。\n\n' +
    '■ 日本語（1段落・分量は掲載例に近い おおよそ320～520字。不足・過剰を避ける）\n' +
    '流れの型:\n' +
    '1) 出身地（国・都市）＋一文でいう歴史的位置づけ（伝説的バンド／至宝／頂点／寵児 等、例文に近い評価語可）\n' +
    '2) 結成年・ブレイク・代表盤・対立やムーブメント（ブリットポップ戦争等）など、年号は出典で確認できた場合のみ\n' +
    '3) サウンド・ボーカル・楽曲性・メンバー対比など、最大の特徴をまとめる句\n' +
    '4) 休止・再結成・近年作・ツアー等、出典のある最新の事実があれば短く（未確認なら触れない）\n' +
    '5) 締めを名詞句や言い切りで（〜の結晶／代名詞／生きた伝説／君臨 等、例文のリズムに寄せる）\n\n' +
    '文体: 全体を言い切り調。「です」「ます」「だ」「だぜ」禁止。体言止め・「〜が特徴。」・適宜「〜し続ける。」等、掲載例に近いリズム。\n' +
    '比喩は例文程度に留め、根拠のない誇張や創作エピソードは禁止。\n' +
    '西暦は、出典で検証できる事実としてのみ使用。未確認の未来予測や推測の「現在〜」は書かない。\n\n' +
    '【基本データ】英語版 Wikipedia（https://en.wikipedia.org/wiki/Main_Page から当該記事）で確認できる範囲で埋める。\n' +
    '- Origin: **代表表記は1つのみ**（`/` や `,` で国・都市を並べない）。\n' +
    '  · **US・UK のみ2文字**（`US`, `UK`）。それ以外の国・地域は IOCコード一覧に従い **3文字アルファベット**（例 NOR, CAN, GER, FRA, JPN, AUS, IRL）。ISO 3166-1 alpha-3（DEU, GBR, CHE 等）は使わない。\n' +
    '  · 英国でスコットランド・ウェールズ・北アイルランドなどが出典で明確なとき: 1トークンで `UK(SCO)`, `UK(WAL)`, `UK(NIR)`。\n' +
    '  · イングランド出身の場合は `UK` のみ（`UK(ENG)` は使わない）。\n' +
    '  · 出生地と代表国が異なる場合も1トークンに収める: 例 `US(born UK)`、`UK(based in US)`。\n' +
    '- 活動開始年：例 1977 - 1986 または 1976 - 現在\n' +
    '- 生年月日（個人の場合）：YYYY.MM.DD。バンド等は "-"\n' +
    '- 日本語読み：カタカナ表記（The 付きバンドは慣例に合わせる）\n' +
    '- 永眠（個人の場合）：YYYY.MM.DD。存命またはバンドは "-"\n' +
    '- Occupation：Band / Singer / Singer-songwriter / Duo 等、ACF チェック用に英語。複数はカンマ区切り\n\n' +
    '【出力】\n' +
    '次のキーだけを持つ JSON を1つだけ出力。前置き・マークダウン・コードフェンス禁止。\n' +
    'キー名の完全一致: "本文", "Origin", "活動開始年", "生年月日（個人の場合）", "日本語読み", "永眠（個人の場合）", "Occupation"\n' +
    '各値は文字列。\n';

  return template;
}

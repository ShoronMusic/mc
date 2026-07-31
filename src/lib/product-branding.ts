/** クライアント／サーバー共通（NEXT_PUBLIC_PRODUCT はビルド時にインライン） */
export const IS_MC_PRODUCT = process.env.NEXT_PUBLIC_PRODUCT === 'musicchat';

/** 部屋・マイページ UI（視聴履歴・ライブラリ・チャットサマリ・曲管理等）でスタイルを表示するか。mc では DB に残すが UI は非表示。 */
export function showRoomStyleUi(): boolean {
  return !IS_MC_PRODUCT;
}

/** ライブラリ曲行・詳細の副題（アーティスト / スタイル） */
export function librarySongSubtitleLine(
  artistsLine: string,
  style: string | null | undefined,
): string {
  if (!showRoomStyleUi()) return artistsLine;
  return `${artistsLine} / ${style ?? '—'}`;
}

export function getProductDisplayName(): string {
  return IS_MC_PRODUCT ? 'Music Chat（β版）' : '洋楽AIチャット（β版）';
}

export function getProductDisplayNamePlain(): string {
  return IS_MC_PRODUCT ? 'Music Chat' : '洋楽AIチャット';
}

export function getRoomServiceTagline(): string {
  return IS_MC_PRODUCT ? 'YouTube × 一緒に聴く × チャット' : '一緒に聴く × チャット × AI 解説';
}

/** mc から ma へのリンク（ローカル 3003→3002、本番は musicai.jp） */
export function getMaPublicOrigin(): string {
  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;
    if (port === '3003') return `${protocol}//${hostname}:3002`;
  }
  const fromEnv = process.env.NEXT_PUBLIC_MA_PUBLIC_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return 'https://www.musicai.jp';
}

/** ma から mc へのリンク（ローカル 3002→3003、本番は musicchat.jp） */
export function getMcPublicOrigin(): string {
  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;
    if (port === '3002') return `${protocol}//${hostname}:3003`;
  }
  const fromEnv = process.env.NEXT_PUBLIC_MC_PUBLIC_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return 'https://www.musicchat.jp';
}

/** 姉妹サイトの日本語名（案内・リンク用） */
export function getSisterSiteNameJa(): string {
  return IS_MC_PRODUCT ? '洋楽AIチャット' : 'ミュージックチャット';
}

export function getSisterSiteOrigin(): string {
  return IS_MC_PRODUCT ? getMaPublicOrigin() : getMcPublicOrigin();
}

/**
 * 姉妹サイト＋同一アカウント案内（トップ・同意・フッター等）。
 * 自動 SSO は約束せず、同じ credentials で双方使える旨にとどめる。
 */
export function getSisterSiteAccountNote(): {
  lead: string;
  account: string;
} {
  if (IS_MC_PRODUCT) {
    return {
      lead:
        '姉妹サイトの洋楽AIチャットでは、AI による曲解説や選曲サポートが使えます。',
      account:
        '同じ Google アカウント（または同じメール）で利用でき、マイリストなども共通です。両方を同時に開いて使うこともできます。',
    };
  }
  return {
    lead:
      '姉妹サイトのミュージックチャットは、同期視聴とチャットに特化した完全無料のサービスです（邦楽・洋楽OK）。',
    account:
      '同じ Google アカウント（または同じメール）で利用でき、マイリストなども共通です。両方を同時に開いて使うこともできます。',
  };
}

/** 部屋ヘッダー等の短い一行 */
export function getSisterSiteAccountNoteShort(): string {
  return IS_MC_PRODUCT
    ? '姉妹サイト — 同じアカウントで利用可'
    : '姉妹サイト（ミュージックチャット）— 同じアカウントで利用可';
}

export function getMcTopSubtitle(): string {
  return IS_MC_PRODUCT
    ? '邦楽も洋楽も、みんなで同期視聴×チャット（完全無料）'
    : '部屋を選んで入室してください';
}

/** mc タイトルロゴ（`public/musicchat_icon.png`） */
export const MUSICCHAT_TITLE_LOGO_SRC = '/musicchat_icon.png';

/** ma タイトル／ヘッダーロゴ（テスト: Music_AI_Chat_logo_2_wh_5） */
export const MA_TITLE_LOGO_SRC = '/Music_AI_Chat_logo_2_wh_5.png';

/** ma 部屋ヘッダー用（現状はタイトルと同ファイル） */
export const MA_HEADER_LOGO_SRC = MA_TITLE_LOGO_SRC;

/** チャット進行メッセージの表示名（選曲アナウンス・順番案内等。曲解説 AI とは別） */
export function getRoomProgressChatDisplayName(): string {
  return IS_MC_PRODUCT ? '進行' : 'AI';
}

/** mc: 薄灰BG＋輪郭のアイコンボタン（`globals.css` の `.mc-icon-btn`） */
export const MC_ICON_BTN = 'mc-icon-btn';

/** mc 部屋ヘッダー ma 導線バナー（黒BG・`globals.css` で文字色を維持） */
export const MC_MA_PROMO_HEADER = 'mc-ma-promo-header';

const MA_TOOLBAR_ICON_BTN =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700';

const MA_PLAYER_OVERLAY_ICON_BTN =
  'flex h-9 w-9 items-center justify-center rounded-lg border border-gray-600 bg-gray-900/90 text-gray-200 backdrop-blur-sm hover:bg-gray-800';

const MA_CHAT_HEADER_ICON_BTN =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-gray-600 bg-gray-800/90 text-gray-300 hover:bg-gray-700 hover:text-gray-100';

const MC_TOOLBAR_ICON_BTN = `${MC_ICON_BTN} flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border`;

const MC_PLAYER_OVERLAY_ICON_BTN = `${MC_ICON_BTN} flex h-9 w-9 items-center justify-center rounded-lg border backdrop-blur-sm`;

const MC_CHAT_HEADER_ICON_BTN = `${MC_ICON_BTN} inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border`;

/** 参加者バー・ツールバー（9×9） */
export function roomToolbarIconBtnClass(extra?: string): string {
  const base = IS_MC_PRODUCT ? MC_TOOLBAR_ICON_BTN : MA_TOOLBAR_ICON_BTN;
  return extra ? `${base} ${extra}` : base;
}

/** プレイヤー上オーバーレイ（9×9） */
export function roomPlayerOverlayIconBtnClass(extra?: string): string {
  const base = IS_MC_PRODUCT ? MC_PLAYER_OVERLAY_ICON_BTN : MA_PLAYER_OVERLAY_ICON_BTN;
  return extra ? `${base} ${extra}` : base;
}

const MA_PLAYER_OVERLAY_TEXT_BTN =
  'flex h-10 w-10 flex-col items-center justify-center rounded-lg border border-gray-600 bg-gray-900/90 p-0 text-[9px] font-medium leading-[1.1] text-gray-200 backdrop-blur-sm hover:bg-gray-800';

const MC_PLAYER_OVERLAY_TEXT_BTN = `${MC_ICON_BTN} flex h-10 w-10 flex-col items-center justify-center rounded-lg border p-0 text-[9px] font-medium leading-[1.1] backdrop-blur-sm`;

/** プレイヤー上オーバーレイ（テキストラベル） */
export function roomPlayerOverlayTextBtnClass(extra?: string): string {
  const base = IS_MC_PRODUCT ? MC_PLAYER_OVERLAY_TEXT_BTN : MA_PLAYER_OVERLAY_TEXT_BTN;
  return extra ? `${base} ${extra}` : base;
}

/** チャットヘッダー（7×7） */
export function chatHeaderIconBtnClass(extra?: string): string {
  const base = IS_MC_PRODUCT ? MC_CHAT_HEADER_ICON_BTN : MA_CHAT_HEADER_ICON_BTN;
  return extra ? `${base} ${extra}` : base;
}

/** 部屋ヘッダー — 楽しみ方・サイトマップ・ログアウト・退室（mc は白＋グレー枠で統一） */
export function roomHeaderActionBtnClass(): string {
  if (IS_MC_PRODUCT) {
    return 'inline-flex h-10 w-10 items-center justify-center gap-0 rounded border border-gray-300 bg-white px-0 py-0 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:w-auto sm:gap-1.5 sm:px-3 sm:py-2';
  }
  return 'inline-flex h-10 w-10 items-center justify-center gap-0 rounded border border-gray-600 bg-gray-800 px-0 py-0 text-sm text-gray-200 hover:bg-gray-700 sm:w-auto sm:gap-1.5 sm:px-3 sm:py-2';
}

/** 参加者名メンション（mc は下線なしのシンプルテキスト） */
export function participantMentionBtnClass(): string {
  if (IS_MC_PRODUCT) {
    return 'cursor-pointer rounded border-0 bg-transparent p-0 text-left font-medium hover:text-gray-600';
  }
  return 'cursor-pointer rounded border-0 bg-transparent p-0 text-left underline decoration-dotted underline-offset-1 hover:opacity-90';
}

/** 部屋ヘッダー モバイルメニュー行 */
export function roomHeaderMenuItemClass(): string {
  if (IS_MC_PRODUCT) {
    return 'flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100';
  }
  return 'flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-gray-100 hover:bg-gray-800';
}

export function participantProfileIconBtnClass(hasVisibleProfile: boolean): string {
  if (IS_MC_PRODUCT) {
    return hasVisibleProfile
      ? `${MC_ICON_BTN} mc-icon-btn-profile-visible inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border p-0`
      : `${MC_ICON_BTN} inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border p-0`;
  }
  return hasVisibleProfile
    ? 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-emerald-800/60 bg-emerald-950/35 p-0 text-emerald-200/90 hover:bg-emerald-900/45'
    : 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-gray-600/70 bg-gray-800/50 p-0 text-gray-400 hover:bg-gray-700/60 hover:text-gray-300';
}

/** お気に入りハート（未点灯）のアイコン色 */
export function favoriteHeartIdleIconClass(): string {
  return IS_MC_PRODUCT ? 'text-gray-500' : 'text-gray-400';
}

/** チャット発言欄（mc は薄いグリーンBG） */
export const MC_CHAT_INPUT_FIELD = 'mc-chat-input-field';

export function chatInputFieldClass(locked: boolean): string {
  const base = `box-border h-[3.75rem] w-full min-w-0 rounded border px-3 py-2 text-sm text-gray-900 placeholder-gray-500 outline-none ${
    IS_MC_PRODUCT ? MC_CHAT_INPUT_FIELD : ''
  }`;
  const tone = IS_MC_PRODUCT
    ? 'border-green-200 bg-green-50 focus:border-green-600'
    : 'border-gray-300 bg-gray-100 focus:border-blue-500';
  const lockedCls = locked ? 'cursor-not-allowed opacity-60' : '';
  return `${base} ${tone} ${lockedCls}`.trim();
}

/** チャット入力横の補助ボタン（選曲方法・利用規約等 — mc は薄灰＋輪郭） */
export function chatInputAuxBtnClass(mobile = false): string {
  if (IS_MC_PRODUCT) {
    return `inline-flex h-[1.8rem] items-center gap-1 rounded border border-gray-300 bg-gray-50 px-2 text-xs leading-tight text-gray-700 hover:bg-gray-100 ${
      mobile ? 'whitespace-nowrap' : 'min-h-0 text-left'
    }`;
  }
  return '';
}

/** 視聴履歴「別タブで視聴」（mc は薄灰＋輪郭） */
export function playbackWatchNewTabBtnClass(): string {
  if (IS_MC_PRODUCT) {
    return 'flex flex-shrink-0 items-center gap-1 rounded border border-gray-300 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100';
  }
  return 'flex flex-shrink-0 items-center gap-1 rounded bg-red-600 px-2 py-1 text-xs font-medium text-white shadow hover:bg-red-500';
}

/** 利用規約・ご意見（ma は暗色、mc は chatInputAuxBtnClass） */
export function chatInputLegalLinkBtnClass(mobile = false): string {
  const mc = chatInputAuxBtnClass(mobile);
  if (mc) return mc;
  return mobile
    ? 'inline-flex h-[1.8rem] items-center gap-1 whitespace-nowrap rounded border border-gray-700 bg-gray-800/55 px-2 text-gray-100 hover:bg-gray-700/75'
    : 'inline-flex h-[1.8rem] min-h-0 items-center gap-1 rounded border border-gray-700 bg-gray-800/55 px-2 text-left text-xs leading-tight text-gray-100 hover:bg-gray-700/75';
}

/** 選曲方法（ma は sky） */
export function chatInputSongHowtoBtnClass(mobile = false): string {
  const mc = chatInputAuxBtnClass(mobile);
  if (mc) return mc;
  return mobile
    ? 'inline-flex h-[1.8rem] items-center gap-1 whitespace-nowrap rounded border border-sky-700/60 bg-sky-900/20 px-2 text-sky-100 hover:bg-sky-800/35'
    : 'inline-flex h-[1.8rem] min-h-0 items-center gap-1 rounded border border-sky-700/60 bg-sky-900/20 px-2 text-left text-xs leading-tight text-sky-100 hover:bg-sky-800/35';
}

/** 発言方法（ma は amber） */
export function chatInputUsageGuideBtnClass(mobile = false): string {
  const mc = chatInputAuxBtnClass(mobile);
  if (mc) return mc;
  return mobile
    ? 'inline-flex h-[1.8rem] items-center gap-1 whitespace-nowrap rounded border border-amber-700/60 bg-amber-900/20 px-2 text-amber-100 hover:bg-amber-800/35'
    : 'inline-flex h-[1.8rem] min-h-0 items-center gap-1 rounded border border-amber-700/60 bg-amber-900/20 px-2 text-left text-xs leading-tight text-amber-100 hover:bg-amber-800/35';
}

/** ライブラリモーダル外枠 */
export function libraryModalShellClass(heightClass: string): string {
  if (IS_MC_PRODUCT) {
    return `mc-library-modal relative flex w-full max-w-[100rem] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white ${heightClass}`;
  }
  return `relative flex w-full max-w-[100rem] flex-col overflow-hidden rounded-lg border border-lime-600/60 bg-gray-950 ${heightClass}`;
}

/** ライブラリ — この曲を選曲（mc はチャット送信と同じ緑） */
export function librarySelectSongBtnClass(padding = 'px-3'): string {
  if (IS_MC_PRODUCT) {
    return `mc-accent-primary h-11 rounded border text-sm font-semibold disabled:opacity-50 ${padding}`;
  }
  return `h-11 rounded border border-lime-500/70 bg-lime-900/40 text-sm font-semibold text-lime-100 hover:bg-lime-900/70 disabled:opacity-50 ${padding}`;
}

/** ライブラリ — URLコピー・マイリスト追加等の副ボタン */
export function librarySecondaryBtnClass(padding = 'px-3'): string {
  if (IS_MC_PRODUCT) {
    return `h-11 rounded border border-gray-300 bg-gray-50 text-sm font-medium text-gray-800 hover:bg-gray-100 disabled:opacity-50 ${padding}`;
  }
  return `h-11 rounded border border-gray-600 bg-gray-800 text-sm text-gray-100 hover:bg-gray-700 disabled:opacity-50 ${padding}`;
}

/** ライブラリ曲一覧の行 */
export function librarySongRowBtnClass(active: boolean): string {
  const base = 'w-full rounded border px-3 py-2 text-left';
  if (IS_MC_PRODUCT) {
    return active
      ? `${base} border-green-300 bg-green-50`
      : `${base} border-gray-200 bg-white hover:bg-gray-50`;
  }
  return active
    ? `${base} border-lime-500/70 bg-lime-950/40`
    : `${base} border-gray-800 bg-gray-900/60 hover:bg-gray-900`;
}

/** ライブラリ — チップ・ソート・動画バージョン */
export function libraryChipBtnClass(active: boolean, inactiveMuted = false): string {
  const base = 'rounded px-2 py-1 text-xs';
  if (IS_MC_PRODUCT) {
    return active
      ? `${base} mc-accent-primary border font-medium`
      : `${base} border border-gray-300 bg-gray-50 font-medium ${inactiveMuted ? 'text-gray-500' : 'text-gray-700'} hover:bg-gray-100`;
  }
  return active
    ? `${base} bg-lime-700 text-white`
    : `${base} border border-gray-700 bg-gray-900 ${inactiveMuted ? 'text-gray-400' : 'text-gray-300'} hover:bg-gray-800`;
}

/** ライブラリ A–Z 索引 */
export function libraryIndexLetterBtnClass(active: boolean): string {
  const base = 'shrink-0 rounded px-1 py-0.5 text-center text-[11px] font-semibold tabular-nums lg:w-full';
  if (IS_MC_PRODUCT) {
    return active
      ? `${base} mc-accent-primary border`
      : `${base} border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100`;
  }
  return active
    ? `${base} bg-lime-700 text-white`
    : `${base} border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800`;
}

/** ライブラリ曲詳細タイトルカード */
export function libraryTitleCardClass(): string {
  return IS_MC_PRODUCT
    ? 'mb-2 rounded border border-gray-200 bg-gray-50 px-3 py-2'
    : 'mb-2 rounded border border-gray-800 bg-gray-900/60 px-3 py-2';
}

export function libraryTitleTextClass(): string {
  return IS_MC_PRODUCT ? 'text-sm font-medium text-gray-900' : 'text-sm font-medium text-gray-100';
}

export function librarySongRowTitleClass(): string {
  return IS_MC_PRODUCT
    ? 'line-clamp-2 min-w-0 flex-1 text-sm font-medium text-gray-900'
    : 'line-clamp-2 min-w-0 flex-1 text-sm font-medium text-gray-100';
}

export function librarySongRowMetaClass(): string {
  return IS_MC_PRODUCT
    ? 'mt-1 text-[11px] leading-snug text-gray-600'
    : 'mt-1 text-[11px] leading-snug text-gray-400';
}

/** ライブラリヘッダー検索ボタン */
export function libraryHeaderSearchBtnClass(compact: boolean, grow = false): string {
  const size = compact ? 'h-8 px-2.5' : 'h-9 px-3';
  const flex = grow ? 'min-w-0 flex-1' : 'shrink-0';
  if (IS_MC_PRODUCT) {
    return `mc-accent-primary inline-flex ${flex} items-center justify-center rounded border text-xs disabled:opacity-50 ${size}`;
  }
  return `inline-flex ${flex} items-center justify-center rounded border border-lime-500/70 bg-lime-900/30 text-xs text-lime-100 hover:bg-lime-900/60 disabled:opacity-50 ${size}`;
}

/** ライブラリヘッダー副ボタン（リセット・閉じる） */
export function libraryHeaderSecondaryBtnClass(compact: boolean, grow = false): string {
  const size = compact ? 'h-8 px-2.5' : 'h-9 px-3';
  const flex = grow ? 'min-w-0 flex-1' : 'shrink-0';
  if (IS_MC_PRODUCT) {
    return `inline-flex ${flex} items-center justify-center rounded border border-gray-300 bg-gray-50 text-xs text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 ${size}`;
  }
  return `inline-flex ${flex} items-center justify-center rounded border border-lime-700/60 bg-gray-800 text-xs text-lime-100 hover:bg-gray-700 ${size}`;
}

export function libraryPanelDividerClass(): string {
  return IS_MC_PRODUCT ? 'border-gray-200' : 'border-lime-900/60';
}

/** ライブラリヘッダー見出し */
export function libraryPanelTitleClass(mobileLandscape: boolean): string {
  const size = mobileLandscape ? 'text-xs' : 'text-sm';
  return IS_MC_PRODUCT
    ? `shrink-0 font-semibold text-gray-900 ${size}`
    : `shrink-0 font-semibold text-white ${size}`;
}

type LibraryCatalogFilterKey = 'all' | 'western' | 'domestic';

/** ライブラリ — 洋楽 / 邦楽 / すべてタブ */
export function libraryCatalogTabBtnClass(filter: LibraryCatalogFilterKey, active: boolean): string {
  const base =
    'min-w-[3.25rem] rounded-md px-3 py-1.5 text-xs font-semibold transition sm:min-w-[3.75rem] sm:px-4 sm:py-2 sm:text-sm';

  if (IS_MC_PRODUCT) {
    const state = active ? 'mc-library-catalog-tab--active' : 'mc-library-catalog-tab--idle';
    return `${base} mc-library-catalog-tab mc-library-catalog-tab--${filter} ${state}`;
  }

  const styles: Record<LibraryCatalogFilterKey, { active: string; idle: string }> = {
    all: {
      active: 'bg-sky-600 text-white shadow-sm ring-1 ring-sky-400/50',
      idle: 'border border-sky-500/60 bg-sky-900/55 text-sky-100 hover:bg-sky-800/70',
    },
    western: {
      active: 'bg-violet-600 text-white shadow-sm ring-1 ring-violet-400/50',
      idle: 'border border-violet-500/60 bg-violet-900/55 text-violet-100 hover:bg-violet-800/70',
    },
    domestic: {
      active: 'bg-pink-600 text-white shadow-sm ring-1 ring-pink-400/50',
      idle: 'border border-pink-500/60 bg-pink-900/55 text-pink-100 hover:bg-pink-800/70',
    },
  };
  return `${base} ${active ? styles[filter].active : styles[filter].idle}`;
}

/** ライブラリ検索入力 */
export function librarySearchInputClass(compact: boolean, idleRing = false): string {
  const h = compact ? 'h-8' : 'h-9';
  const px = compact ? 'px-2 text-xs' : 'px-3 text-sm';
  const ring = idleRing ? 'ring-1 ring-amber-500/50' : '';
  if (IS_MC_PRODUCT) {
    return `${chatInputFieldClass(false)} min-w-0 flex-1 ${h} ${px} outline-none ${ring}`;
  }
  return `${h} min-w-0 flex-1 rounded border border-gray-700 bg-gray-900 ${px} text-gray-100 outline-none focus:border-lime-500 ${ring}`;
}

/** ライブラリ — アーティスト一覧・索引モーダル内の行 */
export function libraryListItemBtnClass(active: boolean, textSize = 'text-[10px]'): string {
  const base = `flex w-full shrink-0 items-center justify-between gap-1 rounded px-1.5 py-1.5 text-left ${textSize}`;
  if (IS_MC_PRODUCT) {
    return active
      ? `${base} mc-accent-primary border font-medium`
      : `${base} border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100`;
  }
  return active
    ? `${base} bg-lime-700 text-white`
    : `${base} border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800`;
}

/** ライブラリ — モバイル検索結果のアーティスト横スクロールチップ */
export function libraryArtistChipBtnClass(active: boolean): string {
  const base =
    'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-2.5 py-1.5 text-xs font-medium tabular-nums';
  if (IS_MC_PRODUCT) {
    return active
      ? `${base} mc-accent-primary border`
      : `${base} border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100`;
  }
  return active
    ? `${base} bg-lime-700 text-white`
    : `${base} border border-lime-700/45 bg-lime-950/70 text-lime-100 hover:bg-lime-900/70`;
}

/** ライブラリ — 曲一覧ソートチップ（小） */
export function librarySortChipBtnClass(active: boolean): string {
  const base = 'rounded px-2 py-0.5 text-[10px] font-medium tabular-nums';
  if (IS_MC_PRODUCT) {
    return active
      ? `${base} mc-accent-primary border`
      : `${base} border border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100`;
  }
  return active
    ? `${base} bg-lime-700 text-white`
    : `${base} border border-gray-700 text-gray-400 hover:bg-gray-800`;
}

/** ライブラリ — モバイル横向きの曲詳細パネル */
export function libraryMobileDetailPanelClass(): string {
  return IS_MC_PRODUCT
    ? 'rounded-lg border border-gray-200 bg-gray-50 p-2.5'
    : 'rounded-lg border border-amber-700/55 bg-amber-950/35 p-2.5';
}

/** ライブラリ — モバイル縦向きの曲詳細シェル */
export function libraryMobileSongDetailShellClass(focusSplit: boolean): string {
  const focus =
    focusSplit
      ? 'max-lg:min-h-0 max-lg:max-h-[38vh] max-lg:flex-1 max-lg:basis-0 max-lg:border-t max-lg:shadow-none'
      : 'max-lg:hidden';
  if (IS_MC_PRODUCT) {
    return `flex min-h-0 flex-col border-t border-gray-200 bg-white lg:hidden ${focus}`;
  }
  return `flex min-h-0 flex-col border-t-2 border-amber-600/50 bg-amber-950/40 lg:hidden ${focus}`;
}

// === マイページ（ライブラリと同系 UI） ===

export function mypageModalShellClass(): string {
  if (IS_MC_PRODUCT) {
    return 'mc-mypage-modal relative flex h-[88vh] w-full max-w-[100rem] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white text-left shadow-xl';
  }
  return 'mc-mypage-modal relative flex h-[88vh] w-full max-w-[100rem] flex-col overflow-hidden rounded-lg border border-sky-600/50 bg-gray-950 text-left shadow-xl';
}

export function mypageHeaderTitleClass(): string {
  return IS_MC_PRODUCT ? 'text-sm font-semibold text-gray-900 sm:text-base' : 'text-sm font-semibold text-white sm:text-base';
}

export function mypageHeaderSubtitleClass(): string {
  return IS_MC_PRODUCT ? 'mt-0.5 text-[11px] text-gray-500 sm:text-xs' : 'mt-0.5 text-[11px] text-gray-400 sm:text-xs';
}

export function mypageTabBtnClass(active: boolean): string {
  const base = 'rounded px-3 py-1.5 text-sm font-medium';
  if (IS_MC_PRODUCT) {
    return active
      ? `${base} mc-accent-primary border`
      : `${base} border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100`;
  }
  return active
    ? `${base} bg-gray-700 text-white`
    : `${base} bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200`;
}

export function mypagePanelClass(): string {
  return IS_MC_PRODUCT
    ? 'rounded border border-gray-200 bg-white p-3'
    : 'rounded border border-gray-700 bg-gray-800/50 p-3';
}

export function mypageSectionTitleClass(): string {
  return IS_MC_PRODUCT ? 'mb-2 text-sm font-medium text-gray-800' : 'mb-2 text-sm font-medium text-gray-300';
}

export function mypageBodyTextClass(): string {
  return IS_MC_PRODUCT ? 'text-sm text-gray-600' : 'text-sm text-gray-400';
}

export function mypagePrimaryBtnClass(): string {
  if (IS_MC_PRODUCT) {
    return 'mc-accent-primary rounded border px-3 py-2 text-sm font-medium disabled:opacity-50';
  }
  return 'rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50';
}

export function mypageSecondaryBtnClass(compact = false): string {
  if (IS_MC_PRODUCT) {
    return compact
      ? 'rounded border border-gray-300 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40'
      : 'rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50';
  }
  return compact
    ? 'rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40'
    : 'rounded border border-gray-600 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-50';
}

export function mypageDateGroupClass(): string {
  return IS_MC_PRODUCT
    ? 'rounded border border-gray-200 bg-gray-50 p-2'
    : 'rounded border border-gray-700 bg-gray-800/50 p-2';
}

export function mypageActiveRowClass(): string {
  return IS_MC_PRODUCT
    ? 'rounded border border-green-300 bg-green-50 px-1 ring-1 ring-green-200'
    : 'rounded bg-lime-950/20 px-1 ring-1 ring-lime-700/40';
}

export function mypagePlayBtnClass(active: boolean): string {
  const base = 'shrink-0 rounded border px-2 py-1 text-xs font-medium';
  if (IS_MC_PRODUCT) {
    return active
      ? `${base} mc-accent-primary`
      : `${base} border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100`;
  }
  return active
    ? `${base} border-lime-500 bg-lime-800 text-white`
    : `${base} border-lime-700/60 bg-lime-900/30 text-lime-200 hover:bg-lime-900/50`;
}

export function mypagePickSongBtnClass(): string {
  if (IS_MC_PRODUCT) {
    return 'shrink-0 mc-accent-primary rounded border px-2 py-1 text-xs font-medium';
  }
  return 'shrink-0 rounded border border-emerald-700/60 bg-emerald-900/30 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-900/50';
}

export function mypageMetaBadgeClass(): string {
  return IS_MC_PRODUCT
    ? 'rounded border border-gray-200 bg-white px-1.5 py-0.5'
    : 'rounded border border-gray-700/70 bg-gray-900/40 px-1.5 py-0.5';
}

export function mypagePaginationBtnClass(active: boolean): string {
  const base = 'min-w-[1.75rem] rounded border px-1.5 py-1 text-sm';
  if (IS_MC_PRODUCT) {
    return active
      ? `${base} mc-accent-primary border`
      : `${base} border-gray-300 text-gray-700 hover:bg-gray-100`;
  }
  return active
    ? `${base} border-violet-600/70 bg-violet-900/40 text-violet-100`
    : `${base} border-gray-600 text-gray-300 hover:bg-gray-700`;
}

export function mypageInputClass(minWidth = 'min-w-0'): string {
  if (IS_MC_PRODUCT) {
    return `flex-1 ${minWidth} rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-green-500`;
  }
  return `flex-1 ${minWidth} rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white`;
}

export function mypageSectionBorderClass(): string {
  return IS_MC_PRODUCT ? 'border-t border-gray-200' : 'border-t border-gray-800';
}

export function mypagePreviewShellClass(): string {
  return IS_MC_PRODUCT
    ? 'rounded border border-gray-200 bg-gray-50 p-3'
    : 'rounded border border-lime-900/50 bg-gray-900/30 p-3';
}

/** 曲行（マイリスト・お気に入り等） */
export function mypageSongRowClass(active = false): string {
  const base = IS_MC_PRODUCT
    ? 'rounded border border-gray-200 bg-white p-2'
    : 'rounded border border-gray-700 bg-gray-800/50 p-2';
  return active ? `${base} ${mypageActiveRowClass()}` : base;
}

/** 注意・結果メッセージ */
export function mypageMessageBannerClass(): string {
  return IS_MC_PRODUCT
    ? 'mb-3 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900'
    : 'mb-3 rounded border border-amber-800/50 bg-amber-900/20 px-2 py-1.5 text-xs text-amber-100';
}

/** 削除など破壊的操作 */
export function mypageDangerBtnClass(compact = false): string {
  const pad = compact ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm';
  if (IS_MC_PRODUCT) {
    return `shrink-0 rounded border border-red-300 bg-red-50 ${pad} font-medium text-red-700 hover:bg-red-100`;
  }
  return `shrink-0 rounded border border-red-900/50 bg-red-900/30 ${pad} text-red-200 hover:bg-red-900/50`;
}

/** マイリスト編集フォーム内フィールド */
export function mypageFieldClass(): string {
  if (IS_MC_PRODUCT) {
    return 'w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-green-500';
  }
  return 'w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-sm text-white';
}

/** マイページモーダル副題 */
export function getMypageSubtitle(): string {
  return IS_MC_PRODUCT
    ? 'プロフィール・選曲参加・曲管理などの設定です。'
    : 'ユーザー設定＝自分の選曲時の AI（opt-out）。部屋設定（オーナー）＝全員の上限と AI エージェント。';
}

export function getMypageGuestSubtitle(): string {
  return IS_MC_PRODUCT
    ? '表示名・テキスト色・選曲参加の設定ができます。'
    : '表示名・テキスト色・選曲参加の設定ができます。';
}

/** 部屋画面の大枠ブロック（プレイヤー・チャット・履歴・フッタ等） */
export function roomFrameBlockClass(extra?: string): string {
  const base = IS_MC_PRODUCT
    ? 'mc-room-frame-block overflow-hidden rounded-lg border bg-white'
    : 'overflow-hidden rounded-lg border border-gray-700 bg-gray-900/50';
  return extra ? `${base} ${extra}`.trim() : base;
}

/** ブロック内の見出し行（チャットヘッダー・履歴タブ等） */
export function roomFrameInnerHeaderClass(extra?: string): string {
  const base = IS_MC_PRODUCT
    ? 'mc-room-frame-inner border-b px-3 py-2'
    : 'border-b border-gray-700 px-3 py-2';
  return extra ? `${base} ${extra}`.trim() : base;
}

/** 部屋ビューポート上部ヘッダー */
export function roomViewportHeaderClass(extra?: string): string {
  const base = IS_MC_PRODUCT
    ? 'mc-room-frame-block mc-room-frame-header relative mb-2 flex shrink-0 flex-row items-center justify-between gap-2 px-3 py-2 sm:gap-3'
    : 'relative mb-2 flex shrink-0 flex-row items-center justify-between gap-2 border-b border-gray-800 pb-2 sm:gap-3';
  return extra ? `${base} ${extra}`.trim() : base;
}

/** 参加者バー外枠 */
export function roomUserBarShellClass(mobile = false): string {
  if (IS_MC_PRODUCT) {
    return mobile
      ? 'mc-room-frame-block flex min-h-11 shrink-0 items-start gap-1.5 overflow-hidden px-2 py-1.5'
      : 'mc-room-frame-block flex items-center justify-between gap-3 overflow-x-auto px-3 py-2';
  }
  return mobile
    ? 'flex min-h-11 shrink-0 items-start gap-1.5 overflow-hidden rounded-lg border border-gray-700 bg-gray-900/50 px-2 py-1.5'
    : 'flex items-center justify-between gap-3 overflow-x-auto rounded-lg border border-gray-700 bg-gray-900/50 px-3 py-2';
}

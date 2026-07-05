/** 特定商取引法に基づく表示 — 販売事業者情報（正本） */

/**
 * バーチャルオフィス契約完了後に true にし、所在地・電話番号をページへ掲載する。
 */
export const COMMERCIAL_TRANSACTIONS_VIRTUAL_OFFICE_CONTRACTED = false;

/**
 * 個人氏名（販売事業者・運営責任者）を公開する前は false。
 * 公開時は true にし、sellerName / representativeName が表示される。
 */
export const COMMERCIAL_TRANSACTIONS_PERSONAL_NAME_PUBLISHED = false;

export const COMMERCIAL_TRANSACTIONS_OPERATOR = {
  /** 販売事業者（個人の氏名） */
  sellerName: '前橋雄治',
  /** 屋号・サービス名 */
  tradeName: '洋楽AIチャット',
  businessType: '個人',
  representativeName: '前橋雄治',
  /** バーチャルオフィス住所。契約後に設定 */
  address: '',
  /** 050 番号。取得後に設定（090 等の個人番号は掲載しない） */
  phone: '',
  email: 'musicai@gol.com',
} as const;

/** 個人氏名非公開時の運営責任者行 */
export const COMMERCIAL_TRANSACTIONS_REPRESENTATIVE_NAME_UNPUBLISHED_NOTICE =
  '公開準備中です。お問い合わせは下記メールアドレスにてお願いいたします。請求があった場合は、法令に基づき遅滞なく開示いたします。';

/** 特商法ページ「販売事業者」行の表示 */
export function formatCommercialTransactionsSellerDisplay(): string {
  const { sellerName, businessType, tradeName } = COMMERCIAL_TRANSACTIONS_OPERATOR;
  if (!COMMERCIAL_TRANSACTIONS_PERSONAL_NAME_PUBLISHED) {
    return `${tradeName}（${businessType}事業主）`;
  }
  return `${sellerName}（${businessType}事業主・屋号：${tradeName}）`;
}

/** 特商法ページ「運営責任者」行の表示 */
export function formatCommercialTransactionsRepresentativeDisplay(): string {
  if (!COMMERCIAL_TRANSACTIONS_PERSONAL_NAME_PUBLISHED) {
    return COMMERCIAL_TRANSACTIONS_REPRESENTATIVE_NAME_UNPUBLISHED_NOTICE;
  }
  return COMMERCIAL_TRANSACTIONS_OPERATOR.representativeName;
}

/** 規約・プライバシー等フッターの運営者表記 */
export function formatCommercialTransactionsOperatorFooter(): string {
  const { sellerName, tradeName } = COMMERCIAL_TRANSACTIONS_OPERATOR;
  if (!COMMERCIAL_TRANSACTIONS_PERSONAL_NAME_PUBLISHED) {
    return tradeName;
  }
  return `${sellerName}（${tradeName}）`;
}

/** バーチャルオフィス契約前に所在地・電話へ表示する文言 */
export const COMMERCIAL_TRANSACTIONS_CONTACT_UNPUBLISHED_NOTICE =
  '諸準備完了まで非掲載です。お問い合わせは下記メールアドレスにてお願いいたします。請求があった場合は、法令に基づき遅滞なく開示いたします。';

export function isCommercialTransactionsContactPublished(): boolean {
  return COMMERCIAL_TRANSACTIONS_VIRTUAL_OFFICE_CONTRACTED;
}

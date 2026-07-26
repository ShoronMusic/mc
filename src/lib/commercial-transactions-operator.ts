/** 特定商取引法に基づく表示 — 販売事業者情報（正本） */

/** 特定商取引法ページの「最終更新」表示（年月日） */
export const COMMERCIAL_TRANSACTIONS_LAST_UPDATED_LABEL = '2026年7月26日';

/**
 * 所在地（VO 住所）をページへ掲載する。
 * 住所確定後に true。電話番号とは独立（050 は別フラグ）。
 */
export const COMMERCIAL_TRANSACTIONS_ADDRESS_PUBLISHED = true;

/**
 * 電話番号（050）をページへ掲載する。
 * 050 取得後（目安: 2026年9月以降）に true。それまでは非掲載案内。
 */
export const COMMERCIAL_TRANSACTIONS_PHONE_PUBLISHED = false;

/**
 * @deprecated 所在地・電話は ADDRESS_PUBLISHED / PHONE_PUBLISHED を使う。
 * 互換のため「所在地が掲載済み」と同義。
 */
export const COMMERCIAL_TRANSACTIONS_VIRTUAL_OFFICE_CONTRACTED =
  COMMERCIAL_TRANSACTIONS_ADDRESS_PUBLISHED;

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
  /** バーチャルオフィス住所 */
  address: '〒530-0001 大阪府大阪市北区梅田1-1-3 大阪駅前第3ビル 29階 1-1-1号室',
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

/** 所在地・電話の非掲載案内（請求時は法令に基づき開示） */
export const COMMERCIAL_TRANSACTIONS_CONTACT_UNPUBLISHED_NOTICE =
  '諸準備完了まで非掲載です。お問い合わせは下記メールアドレスにてお願いいたします。請求があった場合は、法令に基づき遅滞なく開示いたします。';

export function isCommercialTransactionsAddressPublished(): boolean {
  return COMMERCIAL_TRANSACTIONS_ADDRESS_PUBLISHED;
}

export function isCommercialTransactionsPhonePublished(): boolean {
  return COMMERCIAL_TRANSACTIONS_PHONE_PUBLISHED;
}

/** 公開用お問い合わせメール（規約・プライバシー・ガイド等で統一表示） */
export function getCommercialTransactionsContactEmail(): string {
  return COMMERCIAL_TRANSACTIONS_OPERATOR.email;
}

/** @deprecated 所在地掲載判定。電話は isCommercialTransactionsPhonePublished を使う */
export function isCommercialTransactionsContactPublished(): boolean {
  return isCommercialTransactionsAddressPublished();
}

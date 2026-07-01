/** メール登録・パスワード再設定の最低文字数（Supabase ダッシュボードも同値に揃える） */
export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_POLICY_HINT = `${PASSWORD_MIN_LENGTH}文字以上で設定してください`;

export function passwordTooShortMessage(): string {
  return `パスワードは${PASSWORD_MIN_LENGTH}文字以上にしてください。`;
}

export function isPasswordLongEnough(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH;
}

/**
 * Regra de senha do PRO-MAT, igual à configurada no Supabase Auth (quem trava de fato):
 * mínimo de 8, com minúscula, maiúscula, número e símbolo.
 */
export const MIN_PASSWORD_LENGTH = 8

export const PASSWORD_RULE_TEXT = `pelo menos ${MIN_PASSWORD_LENGTH} caracteres, com letra minúscula, maiúscula, número e símbolo`

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return 'A senha precisa ter letra minúscula, maiúscula, número e símbolo.'
  }
  return null
}

/** Senha aleatória para conta criada por importação: ninguém a conhece; o usuário cria a dele pelo e-mail. */
export function randomPassword(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint8Array(32)
  globalThis.crypto.getRandomValues(bytes)
  return `${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}Aa1!`
}

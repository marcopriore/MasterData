/**
 * Regra de senha do PRO-MAT. A mesma regra precisa estar no Supabase Auth
 * (Authentication → Policies/Providers → Password), que é quem trava de fato.
 */
export const MIN_PASSWORD_LENGTH = 8

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`
  if (!/\p{L}/u.test(password) || !/\p{N}/u.test(password)) return 'A senha precisa ter letras e números.'
  return null
}

/** Senha aleatória para conta criada por importação: ninguém a conhece; o usuário cria a dele pelo e-mail. */
export function randomPassword(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return `${Buffer.from(bytes).toString('base64url')}a1`
}

/** Textos da redefinição de senha. Sem banco, para testar. */
import { MIN_PASSWORD_LENGTH, passwordProblem } from '@/lib/password-policy'

export { MIN_PASSWORD_LENGTH }

export const RESET_SENT_MESSAGE =
  'Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha. Confira também a caixa de spam.'

/** Erro do Supabase Auth em português, sem revelar se o e-mail existe. */
export function translateResetError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('for security purposes') || m.includes('only request this after')) {
    return 'Aguarde um minuto antes de pedir outro link.'
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Muitos pedidos de redefinição. Tente de novo em alguns minutos.'
  }
  if (m.includes('error sending') || m.includes('smtp')) {
    return 'Não foi possível enviar o e-mail agora. Fale com o administrador do sistema.'
  }
  if (m.includes('expired') || m.includes('invalid') || m.includes('otp')) {
    return 'O link expirou ou já foi usado. Peça um novo link na tela de login.'
  }
  if (m.includes('should be different') || m.includes('same password')) {
    return 'A nova senha precisa ser diferente da atual.'
  }
  if (m.includes('password should be at least') || m.includes('weak')) {
    return `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres, com letras e números, e não pode ser fácil de adivinhar.`
  }
  return 'Não foi possível concluir a redefinição. Tente de novo.'
}

/** Validação da nova senha antes de enviar. Devolve o problema ou null. */
export function newPasswordProblem(password: string, confirmation: string): string | null {
  const problem = passwordProblem(password)
  if (problem) return problem
  if (password !== confirmation) return 'As senhas não coincidem.'
  return null
}

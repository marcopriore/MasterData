import { describe, expect, it } from 'vitest'
import { newPasswordProblem, translateResetError } from './password-reset-messages'

describe('translateResetError', () => {
  it('limite de tempo entre pedidos', () => {
    expect(translateResetError('For security purposes, you can only request this after 47 seconds.')).toMatch(/Aguarde/)
  })

  it('limite de envio do Auth', () => {
    expect(translateResetError('email rate limit exceeded')).toMatch(/Muitos pedidos/)
  })

  it('falha de SMTP aponta para o administrador', () => {
    expect(translateResetError('Error sending recovery email')).toMatch(/administrador/)
  })

  it('link vencido', () => {
    expect(translateResetError('Email link is invalid or has expired')).toMatch(/expirou/)
  })

  it('senha igual à atual', () => {
    expect(translateResetError('New password should be different from the old password.')).toMatch(/diferente/)
  })

  it('mensagem desconhecida não vaza o texto original', () => {
    expect(translateResetError('User not found')).not.toMatch(/not found/i)
  })
})

describe('newPasswordProblem', () => {
  it('senha curta', () => expect(newPasswordProblem('123', '123')).toMatch(/pelo menos/))
  it('sem letras', () => expect(newPasswordProblem('12345678', '12345678')).toMatch(/letras e números/))
  it('confirmação diferente', () => expect(newPasswordProblem('senhaBoa1', 'senhaBoa2')).toMatch(/não coincidem/))
  it('válida', () => expect(newPasswordProblem('senhaBoa1', 'senhaBoa1')).toBeNull())
})

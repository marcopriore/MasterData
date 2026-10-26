import { describe, expect, it } from 'vitest'
import { passwordProblem, randomPassword } from './password-policy'

describe('regra de senha', () => {
  it('exige 8 caracteres com letra e número', () => {
    expect(passwordProblem('abc123')).toMatch(/8 caracteres/)
    expect(passwordProblem('abcdefgh')).toMatch(/letras e números/)
    expect(passwordProblem('12345678')).toMatch(/letras e números/)
    expect(passwordProblem('senhaBoa1')).toBeNull()
  })

  it('senha aleatória passa na regra e não se repete', () => {
    const a = randomPassword()
    expect(passwordProblem(a)).toBeNull()
    expect(a).not.toBe(randomPassword())
  })
})

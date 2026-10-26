import { describe, expect, it } from 'vitest'
import { passwordProblem, randomPassword } from './password-policy'

describe('regra de senha', () => {
  it('exige 8 caracteres com minúscula, maiúscula, número e símbolo', () => {
    expect(passwordProblem('Ab1!')).toMatch(/8 caracteres/)
    expect(passwordProblem('senhaboa1!')).toMatch(/maiúscula/)
    expect(passwordProblem('SENHABOA1!')).toMatch(/minúscula/)
    expect(passwordProblem('SenhaBoa!!')).toMatch(/número/)
    expect(passwordProblem('SenhaBoa12')).toMatch(/símbolo/)
    expect(passwordProblem('SenhaBoa1!')).toBeNull()
  })

  it('senha aleatória passa na regra e não se repete', () => {
    const a = randomPassword()
    expect(passwordProblem(a)).toBeNull()
    expect(a).not.toBe(randomPassword())
  })
})

import { describe, expect, it } from 'vitest'
import { pdmShortDescription } from './pdm-description'

describe('descrição curta pelo PDM', () => {
  const template = {
    name: 'Parafuso',
    attributes: [
      { id: 'b', order: 2, includeInDescription: true, allowedValues: [{ value: 'Inox 304', abbreviation: 'INOX304' }] },
      { id: 'a', order: 1, includeInDescription: true },
      { id: 'c', order: 3, includeInDescription: false },
      { id: 'd', order: 4, includeInDescription: true },
    ],
  }

  it('nome, atributos marcados na ordem, abreviação da lista e unidade', () => {
    expect(pdmShortDescription(template, { a: { value: '15', unit: 'MM' }, b: 'Inox 304', c: 'X', d: 'galv' })).toBe('PARAFUSO 15MM INOX304 GALV')
  })

  it('valor vazio fica de fora; sem PDM, vazio', () => {
    expect(pdmShortDescription(template, { a: '', b: 'Outro' })).toBe('PARAFUSO OUTRO')
    expect(pdmShortDescription(null, {})).toBe('')
  })
})

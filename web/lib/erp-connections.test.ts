import { randomBytes } from 'crypto'
import { describe, expect, it } from 'vitest'
import { parseErpConnection, resolveEndpointUrl } from './erp-connections'
import { openSecret, sealSecret, secretBoxReady } from './secret-box'

const prod = { hasSecret: false, allowHttp: false }
const base = {
  name: 'Criação SAP',
  operation: 'criar_material',
  http_method: 'POST',
  endpoint_url: 'https://erp.exemplo.com/materiais',
}

describe('integração com o ERP', () => {
  it('exige nome, operação, tipo e URL', () => {
    const result = parseErpConnection({}, prod)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toContain('nome é obrigatório')
      expect(result.errors).toContain('operação inválida')
      expect(result.errors).toContain('tipo de integração deve ser POST, PATCH, DELETE ou GET')
      expect(result.errors).toContain('URL do endpoint é obrigatória')
    }
  })

  it('autenticação pede o segredo na primeira vez', () => {
    const result = parseErpConnection({ ...base, auth_type: 'bearer' }, prod)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toContain('campo "Token" é obrigatório')
  })

  it('segredo em branco mantém o que já está gravado', () => {
    const result = parseErpConnection({ ...base, auth_type: 'bearer', secret: '' }, { hasSecret: true, allowHttp: false })
    expect(result).toMatchObject({ ok: true, value: { secret: { action: 'keep' } } })
  })

  it('sem autenticação apaga o segredo antigo', () => {
    const result = parseErpConnection({ ...base, auth_type: 'none' }, { hasSecret: true, allowHttp: false })
    expect(result).toMatchObject({ ok: true, value: { secret: { action: 'clear' } } })
  })

  it('http só fora de produção', () => {
    expect(parseErpConnection({ ...base, endpoint_url: 'http://erp.local/api' }, prod).ok).toBe(false)
    expect(parseErpConnection({ ...base, endpoint_url: 'http://erp.local/api' }, { hasSecret: false, allowHttp: true }).ok).toBe(true)
  })

  it('URL aceita só {id_erp} e {id_sistema}', () => {
    expect(parseErpConnection({ ...base, endpoint_url: 'https://erp.exemplo.com/materiais/{id_erp}' }, prod).ok).toBe(true)
    const wrong = parseErpConnection({ ...base, endpoint_url: 'https://erp.exemplo.com/{codigo}' }, prod)
    expect(wrong.ok).toBe(false)
  })

  it('troca os códigos na URL', () => {
    expect(resolveEndpointUrl('https://erp/m/{id_erp}?ref={id_sistema}', { idErp: 'MAT 1', idSistema: 'MDM-000001' }))
      .toBe('https://erp/m/MAT%201?ref=MDM-000001')
  })

  it('OAuth2 pede client ID e URL do token', () => {
    const result = parseErpConnection({ ...base, auth_type: 'oauth2_client_credentials', secret: 's' }, prod)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toContain('client ID é obrigatório')
      expect(result.errors).toContain('URL do token é obrigatória')
    }
  })

  it('descarta campos que não são do tipo escolhido', () => {
    const result = parseErpConnection(
      { ...base, auth_type: 'api_key', auth_header_name: 'x-api-key', auth_username: 'sobra', secret: 'k' },
      prod,
    )
    expect(result).toMatchObject({ ok: true, value: { auth_header_name: 'x-api-key', auth_username: null, http_method: 'POST' } })
  })
})

describe('cofre de segredos', () => {
  const key = randomBytes(32).toString('base64')

  it('cifra e decifra com a mesma chave', () => {
    const sealed = sealSecret('token-do-erp', key)
    expect(sealed.startsWith('v1:')).toBe(true)
    expect(sealed).not.toContain('token-do-erp')
    expect(openSecret(sealed, key)).toBe('token-do-erp')
  })

  it('chave diferente não abre', () => {
    const sealed = sealSecret('token-do-erp', key)
    expect(() => openSecret(sealed, randomBytes(32).toString('base64'))).toThrow()
  })

  it('recusa chave de tamanho errado', () => {
    expect(secretBoxReady('curta')).toBe(false)
    expect(() => sealSecret('x', 'curta')).toThrow()
  })
})

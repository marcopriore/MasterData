import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

/**
 * Paridade entre a função do banco (request_duplicate_codes, migration 054) e a regra em memória.
 * Só leitura. Não roda na `check`: precisa do banco e da migration aplicada.
 *
 *   DUP_PARITY=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/erp/duplicate-parity.test.ts
 *
 * DUP_PARITY_TENANT limita a uma empresa; DUP_PARITY_LIMIT (padrão 300) limita os materiais.
 */
const enabled = process.env.DUP_PARITY === '1'

describe.skipIf(!enabled)('função do banco × regra em memória (solicitação)', () => {
  it('dá os mesmos códigos para os materiais com solicitação e PDM', async () => {
    const { supabaseAdmin } = await import('@/lib/supabase/admin')
    const { requestDuplicateCodes } = await import('@/lib/erp/duplicate-guard')
    const tenant = process.env.DUP_PARITY_TENANT ? Number(process.env.DUP_PARITY_TENANT) : null
    const limit = Number(process.env.DUP_PARITY_LIMIT ?? 300)

    let mats = supabaseAdmin
      .from('material_database')
      .select('id, tenant_id, id_sistema, status, technical_attributes, pdm_code, request_id')
      .not('request_id', 'is', null)
      .not('pdm_code', 'is', null)
      .limit(limit)
    if (tenant != null) mats = mats.eq('tenant_id', tenant)
    const { data: materials, error } = await mats
    if (error) throw new Error(error.message)
    const rows = materials ?? []

    const mismatches: string[] = []
    let compared = 0
    let withDuplicates = 0
    for (const material of rows) {
      const { data: sqlCodes, error: rpcError } = await supabaseAdmin.rpc('request_duplicate_codes', {
        p_tenant_id: material.tenant_id,
        p_material_id: material.id,
      })
      if (rpcError) throw new Error(rpcError.message)

      const { data: pdm } = await supabaseAdmin
        .from('pdm_templates')
        .select('id, attributes')
        .eq('tenant_id', material.tenant_id)
        .eq('internal_code', material.pdm_code)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle()
      const keys = Array.isArray(pdm?.attributes)
        ? (pdm.attributes as Array<{ id?: unknown; includeInDescription?: unknown }>)
            .filter((a) => typeof a.id === 'string' && a.includeInDescription === true)
            .map((a) => a.id as string)
        : []
      const [{ data: mates }, { data: reqs }] = await Promise.all([
        supabaseAdmin.from('material_database')
          .select('id, id_sistema, status, technical_attributes')
          .eq('tenant_id', material.tenant_id).eq('pdm_code', material.pdm_code),
        pdm
          ? supabaseAdmin.from('material_requests')
              .select('id, id_sistema, status, technical_attributes, target_material_id')
              .eq('tenant_id', material.tenant_id).eq('pdm_id', pdm.id)
          : Promise.resolve({ data: [] as never[] }),
      ])
      const memory = requestDuplicateCodes(
        { ...material, technical_attributes: material.technical_attributes },
        { keys, materials: (mates ?? []) as never[], requests: (reqs ?? []) as never[] }
      )

      compared += 1
      if (memory.length > 0) withDuplicates += 1
      const a = [...((sqlCodes ?? []) as string[])].sort().join('|')
      const b = [...memory].sort().join('|')
      if (a !== b) mismatches.push(`material ${material.id} (tenant ${material.tenant_id}): banco=[${a}] memória=[${b}]`)
    }

    console.log(`paridade: ${compared} materiais comparados (${withDuplicates} com duplicidade pela regra), ${mismatches.length} divergências`)
    for (const line of mismatches.slice(0, 20)) console.log(`  ${line}`)
    expect(mismatches).toEqual([])
  }, 300_000)
})

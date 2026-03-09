const RUN_ID = Date.now()

export const TEST_TENANT = {
  name: `Empresa Teste E2E ${RUN_ID}`,
  slug: `e2e-${RUN_ID}`,
}

export const TEST_ADMIN = {
  name: 'Admin E2E',
  email: `admin.e2e.${RUN_ID}@test.com`,
  password: 'Senha@123456',
}

export const TEST_OPERATOR = {
  name: 'Operador E2E',
  email: `operador.e2e.${RUN_ID}@test.com`,
  password: 'Senha@123456',
}

export const TEST_PDM = {
  name: `PDM E2E ${RUN_ID}`,
  internal_code: `E2E${String(RUN_ID).slice(-8)}`,
  attributes: [
    {
      id: `tipo_${RUN_ID}`,
      name: 'Tipo',
      dataType: 'lov',
      isRequired: true,
      order: 1,
      allowedValues: [
        { value: 'OPÇÃO A', abbreviation: 'OPA' },
        { value: 'OPÇÃO B', abbreviation: 'OPB' },
      ],
      includeInDescription: true,
    },
    {
      id: `tamanho_${RUN_ID}`,
      name: 'Tamanho',
      dataType: 'numeric',
      isRequired: true,
      order: 2,
      includeInDescription: true,
    },
  ],
}

export const TEST_REQUEST = {
  justification: 'Solicitação criada por teste automatizado E2E',
  urgency: 'medium',
}

// Estado compartilhado entre todas as suites
export const ctx: {
  tenantId?: number
  adminToken?: string
  adminUserId?: number
  operatorUserId?: number
  pdmId?: number
  requestId?: number
  materialId?: number
} = {}

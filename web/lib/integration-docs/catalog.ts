/**
 * Contratos publicados das integrações de material. A tela de documentação e o OpenAPI saem daqui.
 * Os exemplos passam pela validação real (payload.test) e o JSON do ERP sai de buildErpPayload.
 */
import { parseMaterialInput, toApiMaterial } from '@/lib/material-api/payload'
import { RATE_LIMIT_PER_KEY } from '@/lib/material-api/limits'
import { buildErpDeletePayload, buildErpPayload, MESSAGE_PATHS } from '@/lib/erp/payload'
import { ERP_AUTH_LABEL, ERP_AUTH_TYPES, ERP_OPERATION_LABEL, DEFAULT_METHOD, type ErpOperation } from '@/lib/erp-connections'

export type DocField = { name: string; type: string; required?: boolean; description: string }
export type DocError = { status: number; when: string }

export type DocEndpoint = {
  id: string
  group: 'materiais' | 'solicitacoes'
  method: 'GET' | 'POST' | 'PATCH'
  path: string
  title: string
  summary: string
  pathParams?: DocField[]
  query?: DocField[]
  body?: DocField[]
  requestExample?: unknown
  responseStatus: number
  responseExample: unknown
  errors: DocError[]
}

export const API_BASE_PATH = '/api/v1'

// ─── Exemplos de entrada ─────────────────────────────────────────────────────

export const MATERIAL_CREATE_EXAMPLE = {
  descricao: 'APARELHO TELEF S/FIO PT',
  descricao_detalhada: 'Aparelho telefônico sem fio, cor preta, com identificador de chamadas',
  pdm_codigo: 'PDM-001',
  tipo_material: 'FERT',
  unidade_medida: 'PCE',
  ncm: '8542.31.20',
  grupo_mercadoria: '402003',
  atributos: { COR: 'PRETO' },
  eans: [
    { categoria: 'IC', codigo: '17896637612569' },
    { categoria: 'HE', codigo: '7899298700104' },
  ],
  dimensoes: [
    { nome: 'LENGTH', quantidade: '1.0', unidade: 'CR' },
    { nome: 'GROSS_WT', quantidade: '1.0', unidade: 'CR' },
  ],
  vendas: [{ salesOrganization: '1000', distributionChannel: '01', groupCode1: '01' }],
  site: { siteCode: '1001 1002 1003', profitCenter: '41113' },
  caracteristicas: [
    { nome: 'Z_NECESSITA_LI', valor: 'N' },
    { nome: 'Z_PROG_CANAIS', valor: '1' },
    { nome: 'Z_PROG_CANAIS', valor: '2' },
  ],
  campos_adicionais: { divisionCode: '01', formatTaxICMS: 'EXONERADO' },
}

export const MATERIAL_UPDATE_EXAMPLE = {
  ncm: '8517.11.00',
  caracteristicas: [{ nome: 'Z_NECESSITA_LI', valor: 'S' }],
}

export const REQUEST_CREATE_EXAMPLE = {
  pdm_codigo: 'PDM-001',
  solicitante: 'Portal de Compras',
  descricao: 'PARAFUSO SEXTAVADO M8',
  centro_custo: 'CC100',
  urgencia: 'media',
  justificativa: 'Reposição de estoque da linha 2',
  referencia_externa: 'RC-2026-00451',
  atributos: { DIAMETRO: 'M8', COMPRIMENTO: '40 mm' },
}

/** Linha de material_database equivalente ao exemplo de criação, já com o que o PRO-MAT preenche. */
export function exampleMaterialRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const parsed = parseMaterialInput(MATERIAL_CREATE_EXAMPLE, 'create')
  if (!parsed.ok) throw new Error(`exemplo de material inválido: ${parsed.errors.join('; ')}`)
  return {
    ...parsed.value,
    id_sistema: 'MDM-000123',
    id_erp: null,
    status: 'Ativo',
    erp_status: 'pendente_erp',
    source: 'api',
    created_at: '2026-10-20T13:00:00.000Z',
    updated_at: null,
    ...overrides,
  }
}

const materialExample = () => toApiMaterial(exampleMaterialRow())

// ─── Campos ──────────────────────────────────────────────────────────────────

export const MATERIAL_FIELDS: DocField[] = [
  { name: 'descricao', type: 'texto (200)', required: true, description: 'Descrição curta. Obrigatória na criação; não pode ser apagada na alteração.' },
  { name: 'descricao_detalhada', type: 'texto (2000)', description: 'Descrição longa.' },
  { name: 'status', type: 'Ativo | Bloqueado | Obsoleto', description: 'Padrão Ativo.' },
  { name: 'pdm_codigo', type: 'texto (50)', description: 'Código interno de um PDM do tenant. Se informado, precisa existir.' },
  { name: 'unidade_medida', type: 'texto (20)', description: 'Vai para unitMeasure no ERP.' },
  { name: 'ncm', type: 'texto (20)', description: 'Vai para ncmCode no ERP.' },
  { name: 'grupo_mercadoria', type: 'texto (100)', description: 'Vai para internalGroup no ERP.' },
  { name: 'tipo_material', type: 'texto (100)', description: 'Vai para type no ERP.' },
  { name: 'atributos', type: 'objeto { chave: valor }', description: 'Atributos do PDM. Na alteração, mescla chave a chave.' },
  { name: 'eans', type: 'lista [{ categoria, codigo }]', description: 'Até 50. Na alteração, substitui a lista inteira.' },
  { name: 'dimensoes', type: 'lista [{ nome, quantidade, unidade }]', description: 'Até 50. quantidade numérica. O mesmo nome pode repetir com outra unidade.' },
  { name: 'vendas', type: 'lista [{ chave ERP: valor }]', description: 'Uma linha por organização e canal, com as chaves que o ERP usa.' },
  { name: 'site', type: 'objeto { chave ERP: valor }', description: 'Centro e centro de lucro.' },
  { name: 'caracteristicas', type: 'lista [{ nome, valor }]', description: 'Até 300. O mesmo nome pode repetir (ex.: Z_PROG_CANAIS).' },
  { name: 'campos_adicionais', type: 'objeto { chave ERP: valor }', description: 'Campos do cabeçalho do ERP sem campo próprio aqui (ex.: divisionCode, formatTaxICMS).' },
]

export const REQUEST_FIELDS: DocField[] = [
  { name: 'pdm_codigo', type: 'texto (50)', required: true, description: 'Código interno de um PDM ativo do tenant.' },
  { name: 'solicitante', type: 'texto (200)', required: true, description: 'Nome de quem pediu, como aparece na governança.' },
  { name: 'descricao', type: 'texto (200)', description: 'Descrição proposta.' },
  { name: 'centro_custo', type: 'texto (100)', description: '' },
  { name: 'urgencia', type: 'baixa | media | alta', description: 'Padrão baixa.' },
  { name: 'justificativa', type: 'texto (2000)', description: '' },
  { name: 'referencia_externa', type: 'texto (100)', description: 'Código do pedido no sistema de origem, devolvido na consulta.' },
  { name: 'atributos', type: 'objeto { chave: valor }', description: 'Valores do PDM já conhecidos.' },
]

const CODE_PARAM: DocField = { name: 'codigo', type: 'texto', required: true, description: 'id_sistema (MDM-######) ou id_erp.' }

const AUTH_ERRORS: DocError[] = [
  { status: 401, when: 'x-api-key ausente, inválida ou revogada, ou tenant inativo.' },
  { status: 429, when: `Mais de ${RATE_LIMIT_PER_KEY} chamadas no último minuto com a mesma chave. Header Retry-After: 60.` },
  { status: 500, when: 'Erro interno. A chamada fica no monitor.' },
]

// ─── Endpoints de entrada ────────────────────────────────────────────────────

export function inboundEndpoints(): DocEndpoint[] {
  const material = materialExample()
  return [
    {
      id: 'criar-material',
      group: 'materiais',
      method: 'POST',
      path: `${API_BASE_PATH}/materials`,
      title: 'Criar material',
      summary: 'Grava o material direto na base, com código MDM-###### e Pendente ERP. Não abre solicitação nem chama o ERP; uma pessoa integra depois.',
      body: MATERIAL_FIELDS,
      requestExample: MATERIAL_CREATE_EXAMPLE,
      responseStatus: 201,
      responseExample: { material },
      errors: [
        { status: 400, when: 'JSON inválido, campo desconhecido, id_sistema / id_erp / erp_status no corpo, ou validação. detalhes lista cada problema.' },
        { status: 413, when: 'Corpo acima de 1 MB.' },
        { status: 422, when: 'pdm_codigo não existe no tenant.' },
        ...AUTH_ERRORS,
      ],
    },
    {
      id: 'alterar-material',
      group: 'materiais',
      method: 'PATCH',
      path: `${API_BASE_PATH}/materials/{codigo}`,
      title: 'Alterar material',
      summary: 'Altera só o que vier no corpo. O material volta para Pendente ERP até uma pessoa integrar, mesmo que já tenha id_erp.',
      pathParams: [CODE_PARAM],
      body: MATERIAL_FIELDS.map((field) => ({ ...field, required: false })),
      requestExample: MATERIAL_UPDATE_EXAMPLE,
      responseStatus: 200,
      responseExample: {
        material: toApiMaterial(exampleMaterialRow({
          id_erp: '91',
          ncm: MATERIAL_UPDATE_EXAMPLE.ncm,
          characteristics: [{ name: 'Z_NECESSITA_LI', value: 'S' }],
          updated_at: '2026-10-21T09:30:00.000Z',
        })),
      },
      errors: [
        { status: 400, when: 'Validação, corpo vazio ou descricao: null.' },
        { status: 404, when: 'Código não encontrado no tenant.' },
        { status: 409, when: 'Material em integração com o ERP neste momento.' },
        { status: 413, when: 'Corpo acima de 1 MB.' },
        { status: 422, when: 'pdm_codigo não existe no tenant.' },
        ...AUTH_ERRORS,
      ],
    },
    {
      id: 'consultar-material',
      group: 'materiais',
      method: 'GET',
      path: `${API_BASE_PATH}/materials/{codigo}`,
      title: 'Consultar material',
      summary: 'Procura primeiro pelo id_sistema e depois pelo id_erp.',
      pathParams: [CODE_PARAM],
      responseStatus: 200,
      responseExample: { material },
      errors: [
        { status: 400, when: 'Código com caracteres inválidos.' },
        { status: 404, when: 'Código não encontrado no tenant.' },
        ...AUTH_ERRORS,
      ],
    },
    {
      id: 'listar-materiais',
      group: 'materiais',
      method: 'GET',
      path: `${API_BASE_PATH}/materials`,
      title: 'Listar materiais',
      summary: 'Lista paginada do tenant, ordenada pelo id interno.',
      query: [
        { name: 'q', type: 'texto', description: 'Busca em descrição, id_sistema e id_erp.' },
        { name: 'status', type: 'Ativo | Bloqueado | Obsoleto', description: '' },
        { name: 'erp_status', type: 'pendente_erp | integrando | integrado_erp | erro_erp', description: '' },
        { name: 'pdm_codigo', type: 'texto', description: '' },
        { name: 'alterado_desde', type: 'data ISO', description: 'Criados ou alterados a partir desta data. Serve para sincronização incremental.' },
        { name: 'pagina', type: 'número', description: 'Padrão 1.' },
        { name: 'limite', type: 'número', description: 'Padrão 50, máximo 100.' },
      ],
      responseStatus: 200,
      responseExample: { total: 1, pagina: 1, limite: 50, itens: [material] },
      errors: [{ status: 400, when: 'Filtro fora dos valores aceitos.' }, ...AUTH_ERRORS],
    },
    {
      id: 'criar-solicitacao',
      group: 'solicitacoes',
      method: 'POST',
      path: `${API_BASE_PATH}/requests`,
      title: 'Abrir solicitação',
      summary: 'Abre a solicitação no workflow ativo do tenant, como se tivesse sido aberta no PRO-MAT. A primeira etapa recebe o aviso. Na última etapa, o material nasce na base e é criado no ERP.',
      body: REQUEST_FIELDS,
      requestExample: REQUEST_CREATE_EXAMPLE,
      responseStatus: 201,
      responseExample: {
        solicitacao: {
          id: 451,
          codigo: 'REQ-0451',
          status: 'cadastro',
          etapa: 'Central de Cadastro',
          referencia_externa: REQUEST_CREATE_EXAMPLE.referencia_externa,
          criada_em: '2026-10-20T13:00:00.000Z',
        },
      },
      errors: [
        { status: 400, when: 'Validação. detalhes lista cada problema.' },
        { status: 413, when: 'Corpo acima de 1 MB.' },
        { status: 422, when: 'PDM inexistente ou inativo, ou tenant sem workflow ativo.' },
        ...AUTH_ERRORS,
      ],
    },
    {
      id: 'consultar-solicitacao',
      group: 'solicitacoes',
      method: 'GET',
      path: `${API_BASE_PATH}/requests/{id}`,
      title: 'Acompanhar solicitação',
      summary: 'Etapa atual e, depois da última etapa, o material criado com id_sistema e, se já integrado, id_erp.',
      pathParams: [{ name: 'id', type: 'número ou REQ-####', required: true, description: 'Id devolvido na abertura.' }],
      responseStatus: 200,
      responseExample: {
        solicitacao: {
          id: 451,
          codigo: 'REQ-0451',
          status: 'finalizado',
          etapa: 'Finalizado',
          situacao: 'finalizada',
          origem: 'externo',
          referencia_externa: REQUEST_CREATE_EXAMPLE.referencia_externa,
          criada_em: '2026-10-20T13:00:00.000Z',
        },
        material: toApiMaterial(exampleMaterialRow({ id_erp: '91', erp_status: 'integrado_erp', source: 'manual' })),
      },
      errors: [
        { status: 400, when: 'Id em formato inválido.' },
        { status: 404, when: 'Solicitação não encontrada no tenant.' },
        ...AUTH_ERRORS,
      ],
    },
  ]
}

export const ERROR_EXAMPLE = {
  erro: 'dados inválidos',
  detalhes: ['descricao é obrigatório', 'eans[0].codigo é obrigatório', 'campo desconhecido: cor'],
}

// ─── Saída para o ERP ────────────────────────────────────────────────────────

export type OutboundDoc = {
  operation: ErpOperation
  title: string
  defaultMethod: string
  when: string
  payload: unknown
  success: string
  responseExample: unknown
}

export function outboundOperations(): OutboundDoc[] {
  const created = exampleMaterialRow()
  const integrated = exampleMaterialRow({ id_erp: '91', erp_status: 'pendente_erp' })
  return [
    {
      operation: 'criar_material',
      title: ERP_OPERATION_LABEL.criar_material,
      defaultMethod: DEFAULT_METHOD.criar_material,
      when: 'Material Ativo sem id_erp: Sincronizar com ERP (individual ou em lote) e conclusão da última etapa do workflow. Material marcado como duplicado não é enviado.',
      payload: buildErpPayload(created),
      success: 'Resposta 2xx com o código do material no campo configurado na integração (padrão productId). Sem código, conta como erro.',
      responseExample: { productId: '91' },
    },
    {
      operation: 'alterar_material',
      title: ERP_OPERATION_LABEL.alterar_material,
      defaultMethod: DEFAULT_METHOD.alterar_material,
      when: 'Material Ativo com id_erp em Pendente ERP ou Erro ERP: Sincronizar com ERP depois de padronização ou alteração por API. Material marcado como duplicado não é enviado.',
      payload: buildErpPayload(integrated),
      success: 'Resposta 2xx. O corpo da resposta é ignorado.',
      responseExample: { productId: '91' },
    },
    {
      operation: 'eliminar_material',
      title: ERP_OPERATION_LABEL.eliminar_material,
      defaultMethod: DEFAULT_METHOD.eliminar_material,
      when: 'Material Obsoleto com id_erp em Sincronizar com ERP, ou botão Eliminar no ERP no detalhe. Com sucesso, fica Obsoleto no PRO-MAT. Duplicado pode ser eliminado.',
      payload: buildErpDeletePayload(integrated),
      success: 'Resposta 2xx.',
      responseExample: null,
    },
  ]
}

export const ERP_AUTH_DOCS = ERP_AUTH_TYPES.map((type) => ({
  type,
  label: ERP_AUTH_LABEL[type],
  how: {
    none: 'Nenhum header de autenticação.',
    api_key: 'Header com o nome configurado (padrão x-api-key) e a chave como valor.',
    bearer: 'Authorization: Bearer <token>.',
    basic: 'Authorization: Basic base64(usuário:senha).',
    oauth2_client_credentials:
      'POST na URL do token com grant_type=client_credentials, client_id, client_secret e scope (form). O access_token vai em Authorization: Bearer e é reaproveitado até expirar.',
  }[type],
}))

export const ERP_ERROR_EXAMPLE = { error: { message: 'NCM 8542.31.20 não permitido para o tipo FERT' } }

export const ERP_MESSAGE_PATHS = MESSAGE_PATHS

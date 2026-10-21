import { API_BASE_PATH, ERROR_EXAMPLE, inboundEndpoints, type DocEndpoint, type DocField } from './catalog'

function example(value: unknown) {
  return { 'application/json': { example: value } }
}

function parameter(field: DocField, where: 'path' | 'query') {
  return {
    name: field.name,
    in: where,
    required: where === 'path' ? true : Boolean(field.required),
    description: [field.type, field.description].filter(Boolean).join(' — '),
    schema: { type: 'string' },
  }
}

function operation(endpoint: DocEndpoint) {
  const responses: Record<string, unknown> = {
    [endpoint.responseStatus]: { description: 'Sucesso', content: example(endpoint.responseExample) },
  }
  for (const error of endpoint.errors) {
    responses[error.status] = { description: error.when, content: example(error.status === 400 ? ERROR_EXAMPLE : { erro: error.when }) }
  }
  return {
    operationId: endpoint.id,
    summary: endpoint.title,
    description: endpoint.summary,
    tags: [endpoint.group],
    parameters: [
      ...(endpoint.pathParams ?? []).map((field) => parameter(field, 'path')),
      ...(endpoint.query ?? []).map((field) => parameter(field, 'query')),
    ],
    ...(endpoint.requestExample
      ? {
          requestBody: {
            required: true,
            description: (endpoint.body ?? []).map((field) => `${field.name}${field.required ? ' (obrigatório)' : ''}: ${field.type}`).join('; '),
            content: example(endpoint.requestExample),
          },
        }
      : {}),
    responses,
  }
}

/** OpenAPI 3.0 das APIs de entrada, gerado do mesmo catálogo da tela de documentação. */
export function buildOpenApi(serverUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const endpoint of inboundEndpoints()) {
    paths[endpoint.path] = { ...(paths[endpoint.path] ?? {}), [endpoint.method.toLowerCase()]: operation(endpoint) }
  }
  return {
    openapi: '3.0.3',
    info: {
      title: 'PRO-MAT — APIs de material',
      version: '1.0.0',
      description: 'Criação, alteração e consulta de material e abertura de solicitação por sistemas externos. A empresa sai da chave de API.',
    },
    servers: [{ url: serverUrl.replace(/\/$/, '') }],
    security: [{ apiKey: [] }],
    tags: [
      { name: 'materiais', description: 'Material direto na base (Pendente ERP até uma pessoa integrar).' },
      { name: 'solicitacoes', description: 'Solicitação no workflow (cria e integra o material na última etapa).' },
    ],
    components: {
      securitySchemes: { apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' } },
    },
    paths,
    'x-base-path': API_BASE_PATH,
  }
}

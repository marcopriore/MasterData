'use client'

import { useEffect, useMemo, useState } from 'react'
import { Copy, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  API_BASE_PATH,
  ERP_AUTH_DOCS,
  ERP_ERROR_EXAMPLE,
  ERP_MESSAGE_PATHS,
  ERROR_EXAMPLE,
  inboundEndpoints,
  outboundOperations,
  type DocEndpoint,
  type DocError,
  type DocField,
} from '@/lib/integration-docs/catalog'
import { buildOpenApi } from '@/lib/integration-docs/openapi'

const METHOD_STYLE: Record<string, string> = {
  GET: 'bg-blue-100 text-blue-800 border-blue-200',
  POST: 'bg-green-100 text-green-800 border-green-200',
  PATCH: 'bg-amber-100 text-amber-800 border-amber-200',
  DELETE: 'bg-red-100 text-red-800 border-red-200',
}

function MethodBadge({ method }: { method: string }) {
  return (
    <span className={`inline-flex rounded border px-2 py-0.5 font-mono text-xs font-semibold ${METHOD_STYLE[method] ?? 'bg-slate-100 text-slate-800'}`}>
      {method}
    </span>
  )
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  async function copy() {
    await navigator.clipboard.writeText(code)
    toast.success('Copiado.')
  }
  return (
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-1.5">
        <span className="text-xs text-slate-400">{label ?? 'JSON'}</span>
        <button type="button" onClick={() => void copy()} className="text-slate-400 hover:text-white" aria-label="Copiar">
          <Copy className="size-3.5" />
        </button>
      </div>
      <pre className="max-h-96 overflow-auto p-3 text-xs leading-relaxed text-emerald-100">{code}</pre>
    </div>
  )
}

const json = (value: unknown) => JSON.stringify(value, null, 2)

function FieldsTable({ title, fields }: { title: string; fields: DocField[] }) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Campo</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Descrição</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field.name} className="border-t">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                  {field.name}
                  {field.required && <span className="ml-1 text-red-600">*</span>}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{field.type}</td>
                <td className="px-3 py-2 text-xs">{field.description || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ErrorsTable({ errors }: { errors: DocError[] }) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">Erros</h4>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <tbody>
            {errors.map((error) => (
              <tr key={`${error.status}-${error.when}`} className="border-t first:border-t-0">
                <td className="w-16 px-3 py-2 font-mono text-xs text-red-700">{error.status}</td>
                <td className="px-3 py-2 text-xs">{error.when}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function curlFor(endpoint: DocEndpoint, origin: string) {
  const path = endpoint.path.replace('{codigo}', 'MDM-000123').replace('{id}', '451')
  const lines = [`curl -X ${endpoint.method} "${origin}${path}" \\`, '  -H "x-api-key: pmat_SUA_CHAVE"']
  if (endpoint.requestExample) {
    lines[lines.length - 1] += ' \\'
    lines.push('  -H "Content-Type: application/json" \\', `  -d '${JSON.stringify(endpoint.requestExample)}'`)
  }
  return lines.join('\n')
}

function EndpointCard({ endpoint, origin }: { endpoint: DocEndpoint; origin: string }) {
  return (
    <Card id={endpoint.id} className="scroll-mt-6 bg-card text-card-foreground">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <MethodBadge method={endpoint.method} />
          <code className="font-mono text-sm">{endpoint.path}</code>
        </div>
        <CardTitle className="mt-2 text-base">{endpoint.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{endpoint.summary}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {endpoint.pathParams && <FieldsTable title="Parâmetros do caminho" fields={endpoint.pathParams} />}
        {endpoint.query && <FieldsTable title="Filtros (query string)" fields={endpoint.query} />}
        {endpoint.body && <FieldsTable title="Corpo" fields={endpoint.body} />}
        <div className="grid gap-4 lg:grid-cols-2">
          {endpoint.requestExample ? (
            <CodeBlock label="Exemplo de corpo" code={json(endpoint.requestExample)} />
          ) : (
            <CodeBlock label="Exemplo de chamada" code={curlFor(endpoint, origin)} />
          )}
          <CodeBlock label={`Resposta ${endpoint.responseStatus}`} code={json(endpoint.responseExample)} />
        </div>
        {endpoint.requestExample != null && <CodeBlock label="Exemplo com curl" code={curlFor(endpoint, origin)} />}
        <ErrorsTable errors={endpoint.errors} />
      </CardContent>
    </Card>
  )
}

export function IntegrationDocs() {
  const [origin, setOrigin] = useState('')
  useEffect(() => { setOrigin(window.location.origin) }, [])
  const endpoints = useMemo(() => inboundEndpoints(), [])
  const outbound = useMemo(() => outboundOperations(), [])

  function downloadOpenApi() {
    const blob = new Blob([json(buildOpenApi(origin))], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'pro-mat-openapi.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Tabs defaultValue="entrada">
      <TabsList>
        <TabsTrigger value="entrada" className="data-[state=active]:bg-card">APIs de entrada</TabsTrigger>
        <TabsTrigger value="saida" className="data-[state=active]:bg-card">Saída para o ERP</TabsTrigger>
      </TabsList>

      <TabsContent value="entrada" className="mt-4 space-y-4">
        <Card className="bg-card text-card-foreground">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
            <div>
              <CardTitle className="text-base">Como chamar</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Para sistemas externos que criam, alteram ou consultam material e abrem solicitação no PRO-MAT.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={downloadOpenApi} disabled={!origin}>
              <Download className="size-4" />
              Baixar OpenAPI
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Endereço: <code className="font-mono text-xs">{origin}{API_BASE_PATH}</code>. Enquanto o PRO-MAT não tiver domínio público,
                só funciona na rede onde ele roda.
              </li>
              <li>
                Autenticação: header <code className="font-mono text-xs">x-api-key</code> com a chave do sistema. O Master gera a chave em
                Tenants → Configuração → Chaves de API. A empresa sai da chave; nenhum corpo leva tenant.
              </li>
              <li>Corpo em JSON (<code className="font-mono text-xs">Content-Type: application/json</code>), até 1 MB. Chaves em português.</li>
              <li><code className="font-mono text-xs">id_sistema</code>, <code className="font-mono text-xs">id_erp</code> e <code className="font-mono text-xs">erp_status</code> são do PRO-MAT e não são aceitos na entrada.</li>
              <li>Toda chamada, inclusive com chave inválida, aparece no Monitor de integrações, sem o corpo e sem a chave.</li>
            </ul>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h4 className="mb-2 text-sm font-semibold">Formato de erro</h4>
                <CodeBlock label="Resposta 400" code={json(ERROR_EXAMPLE)} />
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold">Rotas</h4>
                <ul className="space-y-1.5">
                  {endpoints.map((endpoint) => (
                    <li key={endpoint.id}>
                      <a href={`#${endpoint.id}`} className="inline-flex items-center gap-2 hover:underline">
                        <MethodBadge method={endpoint.method} />
                        <span className="font-mono text-xs">{endpoint.path}</span>
                        <span className="text-xs text-muted-foreground">{endpoint.title}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
        {endpoints.map((endpoint) => <EndpointCard key={endpoint.id} endpoint={endpoint} origin={origin} />)}
      </TabsContent>

      <TabsContent value="saida" className="mt-4 space-y-4">
        <Card className="bg-card text-card-foreground">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Como o PRO-MAT chama o ERP</CardTitle>
            <p className="text-sm text-muted-foreground">Para quem vai expor no ERP (ou no middleware) os endpoints que o PRO-MAT chama.</p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Cada tenant cadastra uma integração por operação em Tenants → Configuração → Integrações com o ERP: URL, tipo (POST, PATCH,
                DELETE ou GET), tempo limite e autenticação. Só uma fica ativa por operação.
              </li>
              <li>
                A URL aceita <code className="font-mono text-xs">{'{id_erp}'}</code> e <code className="font-mono text-xs">{'{id_sistema}'}</code>,
                trocados pelo código do material.
              </li>
              <li>Headers: <code className="font-mono text-xs">Content-Type: application/json</code> e <code className="font-mono text-xs">Accept: application/json</code>. GET vai sem corpo.</li>
              <li>
                Qualquer resposta 2xx é sucesso. Fora de 2xx, ou sem resposta dentro do tempo limite, o material fica Erro ERP com a mensagem e a
                pessoa tenta de novo pela base.
              </li>
              <li>O ERP só responde. Ele não chama o PRO-MAT para criar, alterar ou consultar.</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="bg-card text-card-foreground">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Autenticação</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <tbody>
                  {ERP_AUTH_DOCS.map((auth) => (
                    <tr key={auth.type} className="border-t first:border-t-0">
                      <td className="w-56 px-3 py-2 font-medium">{auth.label}</td>
                      <td className="px-3 py-2 text-xs">{auth.how}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {outbound.map((op) => (
          <Card key={op.operation} className="bg-card text-card-foreground">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <MethodBadge method={op.defaultMethod} />
                <span className="text-xs text-muted-foreground">tipo sugerido; o tenant pode trocar</span>
              </div>
              <CardTitle className="mt-2 text-base">{op.title}</CardTitle>
              <p className="text-sm text-muted-foreground">{op.when}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm"><span className="font-medium">Sucesso:</span> {op.success}</p>
              <div className="grid gap-4 lg:grid-cols-2">
                <CodeBlock label="Corpo enviado (JSON do ERP v1)" code={json(op.payload)} />
                {op.responseExample != null && <CodeBlock label="Resposta esperada" code={json(op.responseExample)} />}
              </div>
            </CardContent>
          </Card>
        ))}

        <Card className="bg-card text-card-foreground">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Mensagem de erro do ERP</CardTitle>
            <p className="text-sm text-muted-foreground">
              O PRO-MAT procura a mensagem nestes campos, nesta ordem, e mostra no material: {ERP_MESSAGE_PATHS.join(', ')}. Sem nenhum deles,
              usa o texto da resposta.
            </p>
          </CardHeader>
          <CardContent>
            <CodeBlock label="Exemplo de resposta 422" code={json(ERP_ERROR_EXAMPLE)} />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}

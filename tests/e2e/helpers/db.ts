import { Client } from 'pg'

export async function getDbClient(): Promise<Client> {
  const client = new Client({ connectionString: process.env.TEST_DB_URL })
  await client.connect()
  return client
}

export async function cleanupTestTenant(tenantId: number) {
  const client = await getDbClient()
  try {
    await client.query('SET session_replication_role = replica')
    await client.query('DELETE FROM material_requests WHERE tenant_id = $1', [tenantId])
    await client.query('DELETE FROM material_database WHERE tenant_id = $1', [tenantId])
    await client.query('DELETE FROM pdm_templates WHERE tenant_id = $1', [tenantId])
    await client.query('DELETE FROM value_dictionary WHERE tenant_id = $1', [tenantId])
    await client.query('DELETE FROM users WHERE tenant_id = $1', [tenantId])
    await client.query('DELETE FROM roles WHERE tenant_id = $1', [tenantId])
    await client.query('DELETE FROM workflow_config WHERE workflow_id IN (SELECT id FROM workflow_header WHERE tenant_id = $1)', [tenantId])
    await client.query('DELETE FROM workflow_header WHERE tenant_id = $1', [tenantId])
    await client.query('DELETE FROM field_dictionary WHERE tenant_id = $1', [tenantId])
    await client.query('DELETE FROM tenants WHERE id = $1', [tenantId])
    await client.query('SET session_replication_role = DEFAULT')
    console.log(`Tenant ${tenantId} removido com sucesso.`)
  } finally {
    await client.end()
  }
}

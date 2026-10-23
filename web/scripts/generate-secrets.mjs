#!/usr/bin/env node
/** Gera valores aleatórios para os segredos do PRO-MAT. Nada é gravado em disco. */
import { randomBytes } from 'node:crypto'

console.log('Copie só o que for usar. Cada execução gera valores novos.\n')
console.log(`INTEGRATION_SECRET_KEY=${randomBytes(32).toString('base64')}`)
console.log(`AXISDESK_WEBHOOK_SECRET=${randomBytes(32).toString('hex')}`)
console.log('\nATENÇÃO: se o banco já tem integrações ERP salvas, NÃO troque a INTEGRATION_SECRET_KEY;')
console.log('use a mesma do ambiente atual, senão os segredos gravados deixam de abrir.')

import { test as setup } from '@playwright/test'
import { authFile, ROLES } from '../helpers/state'
import { loginAs } from '../helpers/ui'

/** Um login de verdade por papel; as suítes reaproveitam a sessão salva. */
for (const role of ROLES) {
  setup(`sessão de ${role}`, async ({ page }) => {
    await loginAs(page, role)
    await page.context().storageState({ path: authFile(role) })
  })
}

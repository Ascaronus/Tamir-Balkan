import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { IStoreModuleService } from "@medusajs/types/dist/store/service"

/**
 * В админке список локалей для Store неполный — сербского может не быть в UI.
 * Store API принимает любой locale_code (BCP 47). Скрипт добавляет коды к магазину
 * без выбора из списка.
 *
 * По умолчанию: en + sr (как на витрине). Свои коды: STORE_LOCALE_CODES=en,sr-RS
 *
 * Запуск: cd backend && npx medusa exec ./src/scripts/add-store-locales.ts
 */
export default async function addStoreLocales({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const storeModule = container.resolve(Modules.STORE) as IStoreModuleService

  const raw = process.env.STORE_LOCALE_CODES?.trim() || "en,sr"
  const toAdd = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  const [store] = await storeModule.listStores(
    {},
    { relations: ["supported_locales"], take: 1 }
  )
  if (!store?.id) {
    logger.error("No store found.")
    return
  }

  const existingCodes = (store.supported_locales ?? [])
    .map((l) => l.locale_code)
    .filter((c): c is string => Boolean(c))
  const merged = [...new Set([...existingCodes, ...toAdd])]

  const supported_locales = merged.map((locale_code) => ({ locale_code }))

  await storeModule.updateStores(store.id, { supported_locales })

  logger.info(`Store locales set: ${merged.join(", ")}`)
  logger.info(
    "На фронте задай NEXT_PUBLIC_MEDUSA_LOCALE_SR и NEXT_PUBLIC_MEDUSA_LOCALE_EN под эти же коды."
  )
}

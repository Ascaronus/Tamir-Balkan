import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { IStoreModuleService } from "@medusajs/types/dist/store/service"
import type { ITranslationModuleService } from "@medusajs/types/dist/translation/service"

/**
 * В админке список локалей для Store неполный — сербского может не быть в UI.
 * Store API принимает любой locale_code (BCP 47). Скрипт добавляет коды к магазину
 * без выбора из списка.
 *
 * Важно: страница Settings → Translations в админке ждёт, что у каждой записи
 * supported_locales будет связанный объект locale (name, code) из модуля Translation.
 * Только locale_code на store недостаточно — UI падает на locale.name.
 * Поэтому для каждого кода сначала создаётся запись через Translation (если её ещё нет).
 *
 * По умолчанию: en + sr (как на витрине). Свои коды: STORE_LOCALE_CODES=en,sr-RS
 *
 * Запуск: cd backend && npx medusa exec ./src/scripts/add-store-locales.ts
 */
function localeDisplayName(code: string): string {
  const lang = /^[a-z]{2,3}/i.exec(code)?.[0]?.toLowerCase() ?? code
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(lang) ?? code
  } catch {
    return code
  }
}

async function ensureTranslationLocales(
  translation: ITranslationModuleService,
  codes: string[],
  logger: { info: (msg: string) => void }
) {
  for (const code of codes) {
    const existing = await translation.listLocales({ code }, { take: 1 })
    if (existing.length) {
      continue
    }
    await translation.createLocales({
      code,
      name: localeDisplayName(code),
    })
    logger.info(`Translation locale created: ${code}`)
  }
}

export default async function addStoreLocales({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const storeModule = container.resolve(Modules.STORE) as IStoreModuleService
  const translation = container.resolve(
    Modules.TRANSLATION
  ) as ITranslationModuleService

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

  await ensureTranslationLocales(translation, merged, logger)

  const supported_locales = merged.map((locale_code) => ({ locale_code }))

  await storeModule.updateStores(store.id, { supported_locales })

  logger.info(`Store locales set: ${merged.join(", ")}`)
  logger.info(
    "На фронте задай NEXT_PUBLIC_MEDUSA_LOCALE_SR и NEXT_PUBLIC_MEDUSA_LOCALE_EN под эти же коды."
  )
}

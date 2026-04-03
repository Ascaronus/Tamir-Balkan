import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createRegionsWorkflow,
  createTaxRegionsWorkflow,
  updateStoresStep,
} from "@medusajs/medusa/core-flows"
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"

const updateStoreCurrencies = createWorkflow(
  "update-store-currencies-balkan",
  (input: {
    supported_currencies: { currency_code: string; is_default?: boolean }[]
    store_id: string
  }) => {
    const normalizedInput = transform({ input }, (data) => {
      return {
        selector: { id: data.input.store_id },
        update: {
          supported_currencies: data.input.supported_currencies.map(
            (currency) => ({
              currency_code: currency.currency_code,
              is_default: currency.is_default ?? false,
            })
          ),
        },
      }
    })

    const stores = updateStoresStep(normalizedInput)

    return new WorkflowResponse(stores)
  }
)

export default async function addBalkanRegions({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const regionModuleService = container.resolve(Modules.REGION)
  const storeModuleService = container.resolve(Modules.STORE)

  const [store] = await storeModuleService.listStores()

  await updateStoreCurrencies(container).run({
    input: {
      store_id: store.id,
      supported_currencies: [
        { currency_code: "eur", is_default: true },
        { currency_code: "usd" },
        { currency_code: "rsd" },
      ],
    },
  })

  const existing = await regionModuleService.listRegions(
    {},
    { take: 100 }
  )
  const names = new Set(existing.map((r: { name: string }) => r.name))

  if (!names.has("Serbia")) {
    logger.info("Creating region Serbia (RSD)...")
    await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "Serbia",
            currency_code: "rsd",
            countries: ["rs"],
            payment_providers: ["pp_system_default"],
          },
        ],
      },
    })
  }

  if (!names.has("Montenegro")) {
    logger.info("Creating region Montenegro (EUR)...")
    await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "Montenegro",
            currency_code: "eur",
            countries: ["me"],
            payment_providers: ["pp_system_default"],
          },
        ],
      },
    })
  }

  await createTaxRegionsWorkflow(container).run({
    input: [
      { country_code: "rs", provider_id: "tp_system" },
      { country_code: "me", provider_id: "tp_system" },
    ],
  })

  logger.info("Balkan regions ready (Serbia RSD, Montenegro EUR).")
}

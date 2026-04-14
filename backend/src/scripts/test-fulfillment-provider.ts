import {
  AbstractFulfillmentProviderService,
  ModuleProvider,
  Modules,
} from "@medusajs/framework/utils"

/**
 * Временный тестовый провайдер (без реальной доставки).
 * В админке: id `test_test`, опция «Test shipping (temp)».
 */
class TestFulfillmentProviderService extends AbstractFulfillmentProviderService {
  static identifier = "test"

  constructor() {
    super()
  }

  async getFulfillmentOptions() {
    return [
      {
        id: "test-shipping",
        name: "Test shipping (temp)",
      },
    ]
  }

  async validateFulfillmentData(
    _optionData: unknown,
    data: Record<string, unknown>,
    _context: Record<string, unknown>
  ) {
    return data
  }

  async calculatePrice(): Promise<never> {
    throw new Error("Test fulfillment does not calculate prices")
  }

  async canCalculate() {
    return false
  }

  async validateOption() {
    return true
  }

  async createFulfillment() {
    return { data: {}, labels: [] }
  }

  async cancelFulfillment() {
    return {}
  }

  async createReturnFulfillment() {
    return { data: {}, labels: [] }
  }
}

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [TestFulfillmentProviderService],
})

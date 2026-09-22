/** Recover partial registration only after authenticating with the supplied password. */
export async function completeRegistration<T>(steps: {
  register: () => Promise<string>
  login: () => Promise<string>
  findCustomer: (token: string) => Promise<T | null>
  createCustomer: (token: string) => Promise<T>
  saveToken: (token: string) => void
  ensureAddress: (customer: T, token: string) => Promise<T>
}): Promise<T> {
  let token: string
  try {
    token = await steps.register()
  } catch (registrationError) {
    // CAPTCHA/rate-limit failures must never enter partial-account recovery.
    if (registrationError instanceof Error && /CAPTCHA|TOO_MANY_REQUESTS|REVIEWS_UNAVAILABLE/.test(registrationError.message)) throw registrationError
    try { token = await steps.login() }
    catch { throw registrationError }
  }
  steps.saveToken(token)
  let customer = await steps.findCustomer(token)
  if (!customer) {
    try { customer = await steps.createCustomer(token) }
    catch (createError) {
      // The response can be lost after the server committed the profile.
      token = await steps.login()
      steps.saveToken(token)
      customer = await steps.findCustomer(token)
      if (!customer) throw createError
    }
  }
  // A pre-profile token does not carry the newly linked customer identity.
  token = await steps.login()
  steps.saveToken(token)
  return steps.ensureAddress(customer, token)
}

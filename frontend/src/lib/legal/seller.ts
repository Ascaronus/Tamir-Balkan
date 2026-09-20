export function getSeller() {
  const details = {
    name: process.env.TAMIR_SELLER_NAME?.trim(),
    address: process.env.TAMIR_SELLER_ADDRESS?.trim(),
    pib: process.env.TAMIR_SELLER_PIB?.trim(),
    registration: process.env.TAMIR_SELLER_REGISTRATION?.trim(),
    email: process.env.TAMIR_SELLER_EMAIL?.trim(),
    phone: process.env.TAMIR_SELLER_PHONE?.trim(),
    returns: process.env.TAMIR_SELLER_RETURNS_ADDRESS?.trim(),
  }
  return { details, published: process.env.TAMIR_TERMS_PUBLISHED === "true" && Object.values(details).every(Boolean) }
}

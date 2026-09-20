export function getSeller() {
  const details = {
    name: process.env.TAMIR_SELLER_NAME?.trim() || "Igor Demin pr Novi Sad",
    address: process.env.TAMIR_SELLER_ADDRESS?.trim(),
    pib: process.env.TAMIR_SELLER_PIB?.trim() || "113932057",
    registration: process.env.TAMIR_SELLER_REGISTRATION?.trim() || "67195051",
    email: process.env.TAMIR_SELLER_EMAIL?.trim(),
    phone: process.env.TAMIR_SELLER_PHONE?.trim(),
    returns: process.env.TAMIR_SELLER_RETURNS_ADDRESS?.trim(),
  }
  return { details, published: process.env.TAMIR_TERMS_PUBLISHED === "true" && Object.values(details).every(Boolean) }
}

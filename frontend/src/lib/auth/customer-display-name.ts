type DisplayCustomer = {
  first_name?: string | null
  display_name?: string | null
  email?: string | null
  metadata?: Record<string, unknown> | null
}

export function customerDisplayName(customer: DisplayCustomer): string {
  const names = [customer.first_name, customer.display_name, customer.metadata?.display_name]
  for (const name of names) if (typeof name === "string" && name.trim()) return name.trim()
  return customer.email?.split("@")[0]?.trim() || ""
}

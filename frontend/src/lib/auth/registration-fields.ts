// Preserve international numbers; Serbian local numbers are normalized before submission.
export function normalizePhone(value: string) {
  const compact = value.replace(/[\s().-]/g, "")
  if (compact.startsWith("00")) return "+" + compact.slice(2)
  if (compact.startsWith("0")) return "+381" + compact.slice(1)
  return compact.startsWith("381") ? "+" + compact : compact
}
export function formatPhone(value: string) {
  const phone = normalizePhone(value)
  if (!phone.startsWith("+381")) return value.replace(/[^+0-9 ()-]/g, "").slice(0, 25)
  const digits = phone.slice(4).replace(/\D/g, "")
  return "+381" + (digits ? " " + digits.slice(0, 2) : "") + (digits.length > 2 ? " " + digits.slice(2, 5) : "") + (digits.length > 5 ? " " + digits.slice(5) : "")
}
export const registrationCities = ["Beograd", "Novi Sad", "Niš", "Kragujevac", "Subotica", "Zrenjanin", "Pančevo", "Čačak", "Kraljevo", "Novi Pazar", "Kruševac", "Leskovac", "Valjevo", "Smederevo", "Šabac", "Užice", "Vranje", "Sombor", "Požarevac", "Pirot", "Zaječar", "Kikinda", "Sremska Mitrovica", "Jagodina", "Vršac", "Bor", "Prokuplje", "Loznica"].sort((a, b) => a.localeCompare(b, "sr-Latn"))
export type RegistrationFields = { firstName: string; lastName: string; email: string; phone: string; password: string; postalCode: string; city: string; notes: string; consent: boolean }
export function registrationErrors(fields: RegistrationFields): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const key of ["firstName", "lastName", "email", "phone", "password", "postalCode"] as const) {
    if (!fields[key].trim()) errors[key] = "required"
  }
  if (fields.firstName.includes("@") || fields.firstName.length > 60) errors.firstName = "name"
  if (fields.lastName.length > 100) errors.lastName = "name"
  if (fields.email.trim() && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim()) || fields.email.trim().length > 254)) errors.email = "email"
  if (fields.phone.trim() && !/^\+[1-9]\d{7,14}$/.test(normalizePhone(fields.phone))) errors.phone = "phone"
  if (fields.password && (fields.password.length < 8 || fields.password.length > 256)) errors.password = "password"
  if (fields.postalCode.trim() && !/^\d{5}$/.test(fields.postalCode.trim())) errors.postalCode = "postalCode"
  if (fields.city.length > 100 || fields.notes.length > 1000) errors.notes = "length"
  if (!fields.consent) errors.consent = "consent"
  return errors
}

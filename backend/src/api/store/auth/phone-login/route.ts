import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

type Body = {
  phone?: string
  password?: string
}

function normalizePhone(input: string): string {
  return input.replace(/[^\d+]/g, "").trim()
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { phone, password } = (req.body ?? {}) as Body

  if (typeof phone !== "string" || typeof password !== "string" || !phone || !password) {
    return res.status(400).json({ message: "phone and password are required" })
  }

  const normalizedPhone = normalizePhone(phone)
  if (!normalizedPhone) {
    return res.status(400).json({ message: "invalid phone" })
  }

  // Lookup customer by phone on the server side, then authenticate using the built-in emailpass flow.
  const query = req.scope.resolve("query")

  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id", "email", "phone"],
    filters: {
      phone: normalizedPhone,
    },
  })

  const customer = customers?.[0]
  if (!customer?.email) {
    // Avoid leaking whether a phone exists.
    return res.status(401).json({ message: "invalid credentials" })
  }

  // Never forward credentials to a destination controlled by the request Host.
  const port = Number(process.env.PORT || 9000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return res.status(503).json({ message: "authentication unavailable" })
  const baseUrl = `http://127.0.0.1:${port}`

  const authResp = await fetch(`${baseUrl}/auth/customer/emailpass`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: customer.email,
      password,
    }),
  }).catch(() => null)

  if (!authResp) return res.status(503).json({ message: "authentication unavailable" })
  if (!authResp.ok) {
    return res.status(401).json({ message: "invalid credentials" })
  }

  const contentType = authResp.headers.get("content-type") || ""

  if (contentType.includes("application/json")) {
    const json: any = await authResp.json()
    const token = json?.token ?? json?.access_token ?? json
    if (typeof token !== "string") {
      return res.status(502).json({ message: "unexpected auth response" })
    }
    return res.json({ token })
  }

  const text = (await authResp.text()).trim()
  if (!text) {
    return res.status(502).json({ message: "unexpected auth response" })
  }

  return res.json({ token: text })
}


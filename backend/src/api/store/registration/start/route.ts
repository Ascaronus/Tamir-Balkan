import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { registrationEmail, issueCode } from "../../../../utils/registration-code"
import { verifyCaptcha } from "../../../../utils/captcha"
import { rateLimit, reviewDb, reviewFailure } from "../../../../utils/review-http"
import { sendRegistrationCode } from "../../../../utils/registration-email"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  try {
    const body = req.body as Record<string, unknown>
    const email = registrationEmail(body?.email)
    await rateLimit(req, "registration-send-ip", 30)
    await verifyCaptcha(body?.captcha_token, "register")
    await rateLimit(req, "registration-send-email", 5, email)
    const result = await issueCode(reviewDb(req), email, code => sendRegistrationCode(email, code))
    return res.json(result)
  } catch (error) { return reviewFailure(error, res) }
}

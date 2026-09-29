import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { registrationEmail } from "../../../../utils/registration-code"
import { issuePasswordReset } from "../../../../utils/password-reset"
import { verifyCaptcha } from "../../../../utils/captcha"
import { rateLimit, reviewDb, reviewFailure } from "../../../../utils/review-http"
import { sendPasswordResetCode } from "../../../../utils/registration-email"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  try {
    const body = req.body as Record<string, unknown>
    const email = registrationEmail(body?.email)
    await rateLimit(req, "password-reset-send-ip", 30)
    await verifyCaptcha(body?.captcha_token, "password_reset")
    await rateLimit(req, "password-reset-send-email", 5, email)
    return res.json(await issuePasswordReset(reviewDb(req), email, code => sendPasswordResetCode(email, code)))
  } catch (error) { return reviewFailure(error, res) }
}

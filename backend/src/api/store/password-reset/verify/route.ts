import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { registrationEmail } from "../../../../utils/registration-code"
import { confirmPasswordReset, validateNewPassword } from "../../../../utils/password-reset"
import { rateLimit, reviewDb, reviewFailure } from "../../../../utils/review-http"
import { ReviewError } from "../../../../utils/review-validation"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  try {
    await rateLimit(req, "password-reset-verify", 60)
    const body = req.body as Record<string, unknown>
    const email = registrationEmail(body?.email)
    if (typeof body.challenge_id !== "string" || !/^[a-f0-9]{64}$/.test(body.challenge_id) || typeof body.code !== "string" || body.code.length > 32) throw new ReviewError(400, "CODE_INVALID")
    const password = validateNewPassword(body.password)
    await confirmPasswordReset(reviewDb(req), email, body.challenge_id, body.code, async entity_id => {
      const result = await req.scope.resolve(Modules.AUTH).updateProvider("emailpass", { entity_id, password })
      if (!result.success || !result.authIdentity) throw new ReviewError(503, "RESET_UNAVAILABLE")
    })
    return res.json({ success: true })
  } catch (error) { return reviewFailure(error, res) }
}

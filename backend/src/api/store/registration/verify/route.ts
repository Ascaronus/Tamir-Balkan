import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { registrationEmail, confirmCode } from "../../../../utils/registration-code"
import { rateLimit, reviewDb, reviewFailure } from "../../../../utils/review-http"
import { ReviewError } from "../../../../utils/review-validation"
import { activateRegistration, registrationProfile } from "../../../../utils/activate-registration"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  try {
    await rateLimit(req, "registration-verify", 60)
    const body = req.body as Record<string, unknown>
    const email = registrationEmail(body?.email)
    if (typeof body.challenge_id !== "string" || !/^[a-f0-9]{64}$/.test(body.challenge_id) || typeof body.code !== "string" || body.code.length > 32) throw new ReviewError(400, "CODE_INVALID")
    const profile = registrationProfile(body)
    await confirmCode(reviewDb(req), email, body.challenge_id, body.code,
      previous => activateRegistration(req, email, body.challenge_id as string, profile, previous))
    return res.json({ verified: true })
  } catch (error) { return reviewFailure(error, res) }
}

import { authenticate, defineMiddlewares, type MedusaRequest, type MedusaResponse, type MedusaNextFunction } from "@medusajs/framework/http"
import { verifyCaptcha } from "../utils/captcha"
import { rateLimit, reviewFailure } from "../utils/review-http"

async function registrationCaptcha(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  try {
    await rateLimit(req, "register", 30)
    await verifyCaptcha((req.body as Record<string, unknown>)?.captcha_token, "register")
    delete (req.body as Record<string, unknown>).captcha_token
    next()
  } catch (error) { reviewFailure(error, res) }
}
export default defineMiddlewares({ routes: [
  { matcher: "/auth/customer/:provider/register", methods: ["POST"], middlewares: [registrationCaptcha] },
  { matcher: "/store/reviews", methods: ["POST"], middlewares: [authenticate("customer", ["bearer", "session"])] },
  { matcher: "/store/reviews", methods: ["GET"], middlewares: [authenticate("customer", ["bearer", "session"], { allowUnauthenticated: true })] },
  { matcher: "/store/reviews/:id/vote", methods: ["POST"], middlewares: [authenticate("customer", ["bearer", "session"])] },
  { matcher: "/admin/reviews*", middlewares: [authenticate("user", ["bearer", "session"])] },
] })

import { authenticate, defineMiddlewares, type MedusaRequest, type MedusaResponse, type MedusaNextFunction } from "@medusajs/framework/http"
// New customer accounts must be created by the OTP verification route.
// Blocking both legacy endpoints prevents bypass with an old unregistered JWT.
function verifiedRegistrationRequired(_req: MedusaRequest, res: MedusaResponse, _next: MedusaNextFunction) {
  return res.status(403).json({ code: "EMAIL_VERIFICATION_REQUIRED", message: "EMAIL_VERIFICATION_REQUIRED" })
}
export default defineMiddlewares({ routes: [
  { matcher: "/auth/customer/:provider/register", methods: ["POST"], middlewares: [verifiedRegistrationRequired] },
  { matcher: "/store/customers", methods: ["POST"], middlewares: [verifiedRegistrationRequired] },
  { matcher: "/store/reviews", methods: ["POST"], middlewares: [authenticate("customer", ["bearer", "session"])] },
  { matcher: "/store/reviews", methods: ["GET"], middlewares: [authenticate("customer", ["bearer", "session"], { allowUnauthenticated: true })] },
  { matcher: "/store/reviews/:id/vote", methods: ["POST"], middlewares: [authenticate("customer", ["bearer", "session"])] },
  { matcher: "/admin/reviews*", middlewares: [authenticate("user", ["bearer", "session"])] },
] })

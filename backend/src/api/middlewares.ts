import { protectCustomerCart } from "../utils/customer-cart"
import { bannerUploadLimit } from "../utils/banner-media"
import { authenticate, defineMiddlewares, type MedusaRequest, type MedusaResponse, type MedusaNextFunction } from "@medusajs/framework/http"
import { catalogMiddlewares } from "../utils/catalog-http"
import { loginRateLimit } from "../utils/login-rate-limit"
// New customer accounts must be created by the OTP verification route.
// Blocking both legacy endpoints prevents bypass with an old unregistered JWT.
function verifiedRegistrationRequired(_req: MedusaRequest, res: MedusaResponse, _next: MedusaNextFunction) {
  return res.status(403).json({ code: "EMAIL_VERIFICATION_REQUIRED", message: "EMAIL_VERIFICATION_REQUIRED" })
}
/** Public production API origins. Any other public host is a non-searchable instance. */
const SEARCHABLE_API_HOSTS = new Set(["api.tamir.rs", "www.api.tamir.rs"])
const NOINDEX_TAG = "noindex, nofollow, noarchive, nosnippet"
/**
 * Behind the local proxy the API also answers requests whose Host is the bind address.
 * Such a request carries no public hostname that a crawler could index, and treating it
 * as searchable keeps the production API working when its proxy forwards $proxy_host.
 */
const LOCAL_BIND_HOST = /^(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|::1|\[::1\])$/

function requestHostname(req: MedusaRequest): string {
  // Host is the only authoritative origin: Express ignores X-Forwarded-Host when routing,
  // that header is attacker controlled, while cloudflared keeps the public Host header.
  const host = req.headers.host
  const value = Array.isArray(host) ? host[0] : host
  return (value || "").trim().toLowerCase().replace(/:\d+$/, "")
}

/**
 * Staging runs the same code as production and serves the admin UI at /app, so the
 * durable protection is a response header: any public hostname that is not a
 * production API origin gets an unconditional X-Robots-Tag.
 */
function blockSearchEngines(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const hostname = requestHostname(req)
  if (!hostname || (!SEARCHABLE_API_HOSTS.has(hostname) && !LOCAL_BIND_HOST.test(hostname))) {
    res.setHeader("X-Robots-Tag", NOINDEX_TAG)
  }
  return next()
}
export default defineMiddlewares({ routes: [
  // "*" is the global bucket of the Medusa route sorter; a bare "/" matcher is dropped.
  { matcher: "*", middlewares: [blockSearchEngines] },
  { matcher: "/store/customer-cart", methods: ["POST"], bodyParser: { sizeLimit: "2kb" }, middlewares: [authenticate("customer", ["bearer", "session"])] },
  { matcher: "/store/carts/*", middlewares: [authenticate("customer", ["bearer", "session"], { allowUnauthenticated: true }), protectCustomerCart] },
  { matcher: "/admin/tamir-chat*", bodyParser: { sizeLimit: "32kb" }, middlewares: [authenticate("user", ["bearer", "session"])] },
  { matcher: "/store/chat*", bodyParser: { sizeLimit: "8kb" }, middlewares: [authenticate("customer", ["bearer", "session"], { allowUnauthenticated: true })] },
  { matcher: "/hooks/tamir-chat", bodyParser: { sizeLimit: "32kb" }, middlewares: [] },
  { matcher: "/admin/homepage-banners*", bodyParser: { sizeLimit: `${Math.ceil(bannerUploadLimit()*4/3)+4096}b` }, middlewares: [authenticate("user", ["bearer", "session"])] },
  { matcher: "/store/wishlist", methods: ["GET", "POST"], bodyParser: { sizeLimit: "2kb" }, middlewares: [authenticate("customer", ["bearer", "session"])] },
  { matcher: "/store/wishlist/:productId", methods: ["DELETE"], middlewares: [authenticate("customer", ["bearer", "session"])] },
  { matcher: "/admin/products/:id/localized-url", methods: ["GET", "POST"], bodyParser: { sizeLimit: "8kb" }, middlewares: [authenticate("user", ["bearer", "session"])] },
  { matcher: "/admin/products/:id/option-translations/translate", methods: ["POST"], bodyParser: { sizeLimit: "64kb" }, middlewares: [authenticate("user", ["bearer", "session"])] },
  { matcher: "/admin/rozetka*", bodyParser: { sizeLimit: "25mb" }, middlewares: [authenticate("user", ["bearer", "session"])] },
  { matcher: "/store/catalog/products", methods: ["GET"], middlewares: catalogMiddlewares },
  { matcher: "/auth/customer/:provider/register", methods: ["POST"], middlewares: [verifiedRegistrationRequired] },
  { matcher: "/auth/customer/emailpass", methods: ["POST"], middlewares: [loginRateLimit] },
  { matcher: "/store/customers", methods: ["POST"], middlewares: [verifiedRegistrationRequired] },
  { matcher: "/store/reviews", methods: ["POST"], middlewares: [authenticate("customer", ["bearer", "session"])] },
  { matcher: "/store/reviews", methods: ["GET"], middlewares: [authenticate("customer", ["bearer", "session"], { allowUnauthenticated: true })] },
  { matcher: "/store/reviews/:id/vote", methods: ["POST"], middlewares: [authenticate("customer", ["bearer", "session"])] },
  { matcher: "/admin/reviews*", middlewares: [authenticate("user", ["bearer", "session"])] },
] })

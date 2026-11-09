import { errorHandler, type MedusaErrorHandlerFunction } from '@medusajs/framework/http'

const medusaErrorHandler = errorHandler()

// Body-parser runs before route handlers, so their failure() catch cannot handle
// upload limits. Medusa's default handler maps entity.too.large to an unknown 500.
export const chatBodyErrorHandler: MedusaErrorHandlerFunction = (error, req, res, next) => {
  if (
    /^\/(?:store\/chat|admin\/tamir-chat)(?:\/|$)/.test(req.path) &&
    error?.type === 'entity.too.large' &&
    error.status === 413
  ) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(413).json({ code: 'PAYLOAD_TOO_LARGE' })
    return
  }
  return medusaErrorHandler(error, req, res, next)
}

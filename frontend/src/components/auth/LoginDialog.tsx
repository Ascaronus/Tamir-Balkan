"use client"

import { useEffect, useId, useRef } from "react"
import type { RefObject } from "react"
import { LoginForm } from "./LoginForm"
import { useTranslations } from "@/components/i18n/LocaleProvider"
import { trackDialogBackdropPress, dismissDialogFromBackdrop } from "@/lib/dialog-backdrop"

type Props = { message?: string; onSuccess?: () => void; onDismiss: () => void; trigger: RefObject<HTMLButtonElement | null> }

export function LoginDialog({ onDismiss, trigger, message, onSuccess }: Props) {
  const t = useTranslations()
  const dialog = useRef<HTMLDialogElement>(null)
  const navigating = useRef(false)
  const titleId = useId()
  useEffect(() => {
    const node = dialog.current
    if (!node) return
    const previousOverflow = document.body.style.overflow
    node.showModal()
    node.querySelector<HTMLInputElement>('input[type="email"]')?.focus({ preventScroll: true })
    document.body.style.overflow = "hidden"
    return () => {
      node.close()
      document.body.style.overflow = previousOverflow
      if (!navigating.current && trigger.current?.isConnected) trigger.current.focus({ preventScroll: true })
    }
  }, [trigger])
  return <dialog ref={dialog} className="login-dialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onDismiss() }}
    onPointerDown={trackDialogBackdropPress} onClick={event => dismissDialogFromBackdrop(event, onDismiss)}>
    <div className="login-dialog-heading">
      <h2 id={titleId}>{t("auth.login.title")}</h2>
      <button type="button" className="login-dialog-close" onClick={onDismiss} aria-label={t("common.close")}><span aria-hidden="true">×</span></button>
    </div>
    {message && <p className="mb-4 text-sm">{message}</p>}
    <LoginForm countryCode="rs" modal onSuccess={onSuccess ?? onDismiss} onNavigate={() => { navigating.current = true; onDismiss() }} />
  </dialog>
}

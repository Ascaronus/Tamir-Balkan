"use client"
import { createContext, useContext } from "react"
import type { Locale } from "@/lib/i18n/config"
export const LanguagePaths = createContext<Partial<Record<Locale, string>>>({})
export function useLanguagePaths() { return useContext(LanguagePaths) }

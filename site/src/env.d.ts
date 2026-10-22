interface ImportMetaEnv {
  readonly PUBLIC_APP_URL?: string
  readonly PUBLIC_SUPABASE_URL?: string
  readonly PUBLIC_SUPABASE_ANON_KEY?: string
  readonly PUBLIC_POSTHOG_KEY?: string
  readonly PUBLIC_POSTHOG_HOST?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}

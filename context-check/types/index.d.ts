/** `startedAt` of the session the check was already offered in; null until then. */
export type AskedFor = number | null

declare module 'claude-code' {
  interface PluginState {
    'context-check': { askedFor: AskedFor }
  }
}

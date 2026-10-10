import type { Register } from 'claude-code'

import type { AskedFor } from '../types'

import { CHOICES, estimateTokens, fmt, question } from './advice'

// `startedAt` of the session the check was already offered in. A resumed
// session has turns before its first prompt; a fresh one has none. Keyed on
// startedAt so a hot reload (session.start fires again) does not re-ask.
const askedFor = { plugin: 'context-check', key: 'askedFor' } as const

export const register: Register = on => {
  // Armed for the next user prompt when the session already holds turns.
  let armed = false

  on('session.start', async ($, e, next) => {
    const turns = await $.session.turns()
    if (turns > 0) {
      const { startedAt } = await $.session.usage()
      const { value } = await $.state.get(askedFor)
      armed = value !== startedAt
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const isTyped = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
    if (!armed || !isTyped) return next(e)
    armed = false

    let usage
    try {
      usage = await $.session.usage({ breakdown: 'summary' })
    } catch (err) {
      $.ui.log(`context-check: could not read usage (${String(err)})`, { to: 'debug' })
      return next(e)
    }
    const asked: AskedFor = usage.startedAt
    await $.state.set(askedFor, asked)

    const window = usage.context.window
    const context = usage.context.breakdown?.totalTokens ?? usage.context.tokens ?? 0
    const prompt = estimateTokens(e.text)

    let choice: string
    try {
      choice = await $.ui.ask(question({ context, prompt, window }), {
        options: CHOICES,
        header: 'Context',
      })
    } catch {
      // Dismissed, or nobody to ask: let the prompt through untouched.
      return next(e)
    }

    if (choice === 'Compact') {
      try {
        const result = await $.session.compact()
        if ('skip' in result) {
          $.ui.toast(`Compaction skipped: ${String(result.skip)}`)
        } else {
          const after = await $.session.usage({ breakdown: 'summary' })
          const now = after.context.breakdown?.totalTokens ?? after.context.tokens
          $.ui.toast(
            now === undefined
              ? 'Compacted; sending your prompt.'
              : `Compacted: ${fmt(context)} → ${fmt(now)} tokens. Sending your prompt.`,
          )
        }
      } catch (err) {
        $.ui.toast(`Compaction failed (${String(err)}); sending your prompt as is.`)
      }
      return next(e)
    }

    if (choice === 'Clear') {
      const { text, attachments } = e
      // Both calls wait for an idle session, so start them after this hook
      // has dropped the prompt rather than while the turn is waiting on it.
      $.clock.after(0, () => {
        $.command
          .run({ command: 'clear' })
          .then(() => $.prompt.submit({ text, attachments, asUser: true }))
          .catch(err => $.ui.toast(`Clear failed: ${String(err)}`))
      })
      return {
        drop: `Cleared ${fmt(context)} tokens of context; resubmitting your prompt in a fresh session.`,
      }
    }

    return next(e)
  })
}

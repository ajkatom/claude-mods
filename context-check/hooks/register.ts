import type { Register } from 'claude-code'

import type { AskedFor } from '../types'

import { CHOICES, estimateTokens, fmt, question } from './advice'

// `startedAt` of the session the check was already settled for (asked, or
// found fresh). Lives in $.state so a hot reload does not re-ask; /clear
// resets startedAt, so a cleared session is a new one.
const askedFor = { plugin: 'context-check', key: 'askedFor' } as const

// Prompts a person typed, wherever they typed them. Deliveries from tasks,
// peers, schedules and plugins pass straight through.
const TYPED = new Set(['composer', 'bridge', 'sdk'])

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    if (!TYPED.has(e.origin.kind)) return next(e)

    let usage
    try {
      usage = await $.session.usage({ breakdown: 'summary' })
    } catch (err) {
      $.ui.log(`context-check: could not read usage (${String(err)})`)
      return next(e)
    }

    const { value: settled } = await $.state.get(askedFor)
    if (settled === usage.startedAt) return next(e)
    const asked: AskedFor = usage.startedAt
    await $.state.set(askedFor, asked)

    // A fresh session has no messages yet; only a resumed one is worth a check.
    const prior = (await $.session.messages()).length
    if (prior === 0) {
      $.ui.log('context-check: fresh session, no check', { to: 'debug' })
      return next(e)
    }

    const window = usage.context.window
    const context = usage.context.breakdown?.totalTokens ?? usage.context.tokens ?? 0
    const prompt = estimateTokens(e.text)
    $.ui.log(
      `context-check: resumed session, ${prior} messages, ~${fmt(context)} context tokens`,
      { to: 'debug' },
    )

    let choice: string
    try {
      choice = await $.ui.ask(question({ context, prompt, window }), {
        options: CHOICES,
        header: 'Context',
      })
    } catch (err) {
      // Dismissed, or nobody to ask: let the prompt through untouched.
      $.ui.log(`context-check: dialog closed (${String(err)}); continuing`, { to: 'debug' })
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

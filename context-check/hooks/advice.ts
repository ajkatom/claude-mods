export type Choice = 'Continue' | 'Compact' | 'Clear'

export const CHOICES: readonly Choice[] = ['Continue', 'Compact', 'Clear']

/** Rough token count of typed text: ~4 characters per token. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4)

export const fmt = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n)

/** Which option to recommend for a context this full. */
export const recommend = (
  tokens: number,
  window: number,
): { choice: Choice; why: string } => {
  const pct = window > 0 ? (tokens / window) * 100 : 0
  if (pct >= 70) {
    return {
      choice: 'Clear',
      why: 'the window is mostly full; a fresh start is cheaper and leaves room to work',
    }
  }
  if (pct >= 35) {
    return {
      choice: 'Compact',
      why: 'a fair amount of history would be re-sent every turn; a summary keeps the gist',
    }
  }
  return { choice: 'Continue', why: 'the context is still small' }
}

export const question = (args: {
  context: number
  prompt: number
  window: number
}): string => {
  const total = args.context + args.prompt
  const pct = args.window > 0 ? Math.round((total / args.window) * 100) : 0
  const rec = recommend(total, args.window)
  return (
    `This prompt will send ~${fmt(total)} tokens ` +
    `(${fmt(args.context)} existing context + ${fmt(args.prompt)} prompt, ` +
    `${pct}% of a ${fmt(args.window)} window). ` +
    `Recommended: ${rec.choice} — ${rec.why}. What do you want to do?`
  )
}

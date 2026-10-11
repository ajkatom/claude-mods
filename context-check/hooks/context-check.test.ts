import { expect, test } from 'claude-code/testing'

import { estimateTokens, fmt, question, recommend } from './advice'

test('recommends by how full the window is', async () => {
  expect(recommend(10_000, 200_000).choice).toBe('Continue')
  expect(recommend(80_000, 200_000).choice).toBe('Compact')
  expect(recommend(150_000, 200_000).choice).toBe('Clear')
  expect(recommend(0, 0).choice).toBe('Continue')
})

test('question carries the totals the user asked for', async () => {
  const q = question({ context: 120_000, prompt: 250, window: 200_000 })
  expect(q).toContain('120k existing context')
  expect(q).toContain('250 prompt')
  expect(q).toContain('60%')
  expect(q).toContain('Recommended: Compact')
  expect(fmt(999)).toBe('999')
  expect(fmt(1500)).toBe('1.5k')
  expect(fmt(150_000)).toBe('150k')
  expect(estimateTokens('abcdefgh')).toBe(2)
})

test('a fresh session lets the first prompt through without asking', async ($, on) => {
  let asked = false
  on('tool.call', { tool: 'AskUserQuestion' }, async (_$, e, next) => {
    asked = true
    return next(e)
  })
  let entered = ''
  on('prompt.submit', async (_$, e) => {
    entered = e.text
    return { text: e.text }
  })

  const result = await $.prompt.submit({
    text: 'hello',
    wait: false,
    origin: { kind: 'composer' },
  })
  expect('drop' in result && result.drop).toBeFalsy()
  expect(entered).toBe('hello')
  expect(asked).toBe(false)
})

test('a resumed session asks before the first prompt', async ($, on) => {
  const logs: string[] = []
  on('ui.log', async (_$, e) => {
    logs.push(e.text)
    return { value: undefined } as never
  })
  on('session.usage', async () => ({
    value: {
      startedAt: 1000,
      context: { window: 200_000, tokens: 120_000, percent: 60 },
      rateLimits: [],
      cost: { usd: 0 },
    },
  }) as never)
  on('session.messages', async () => ({
    value: [
      { role: 'user', text: 'earlier prompt', toolUses: [] },
      { role: 'assistant', text: 'earlier answer', toolUses: [] },
    ],
  }) as never)
  let askedQuestion = ''
  on('tool.call', { tool: 'AskUserQuestion' }, async (_$, e) => {
    const q = (e as unknown as { questions: { question: string }[] }).questions[0]?.question ?? ''
    askedQuestion = q
    return { result: { questions: [], answers: { [q]: 'Continue' } } } as never
  })
  let entered = ''
  on('prompt.submit', async (_$, e) => {
    entered = e.text
    return { text: e.text }
  })

  const result = await $.prompt.submit({ text: 'hello again', wait: false, origin: { kind: 'composer' } })
  expect(entered).toBe('hello again')
  expect(logs.join(' | ')).not.toContain('could not')
  expect(logs.join(' | ')).toContain('120')
  expect(askedQuestion).toContain('tokens')
})

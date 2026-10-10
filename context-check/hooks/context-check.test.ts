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

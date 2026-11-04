// /vocab/<id>/chat: the scene opens by itself (the proactive opener), then each reply is sent and
// answered. The turn meter's aria-label ("N of 8 turns used") is the app's own progress signal.
//   args: <vocab id> [reply ...]   default one reply that uses the word on the page's header
const steps = async ({ page, base, shot, log, args }) => {
  const [id, ...replies] = args
  if (!id) throw new Error('chat.mjs needs a vocab id: -- <id> [reply ...]')
  const meter = page.getByRole('img', { name: /turns used/ })
  const used = async () => Number(((await meter.getAttribute('aria-label')) ?? '0').split(' ')[0])
  await page.goto(`${base}/vocab/${id}/chat`, { waitUntil: 'networkidle' })
  const term = (await page.locator('header span[title]').first().getAttribute('title')) ?? ''
  log(`word: ${term}, meter: ${await meter.getAttribute('aria-label')}`)
  // A fresh word fires the opener on mount; wait until the meter leaves 0 or the open fails.
  const failed = page.getByText('Couldn’t start the scene.')
  await page.waitForFunction(
    () => {
      const m = document.querySelector('[aria-label$="turns used"]')
      return (m && !m.getAttribute('aria-label').startsWith('0 ')) || document.body.innerText.includes('Couldn’t start the scene.')
    },
    null,
    { timeout: 90_000 },
  )
  if (await failed.count()) throw new Error(`opener failed: ${(await page.getByRole('status').allInnerTexts()).join(' | ')}`)
  log(`opened: ${await meter.getAttribute('aria-label')}`)
  await shot('opener')
  const toSend = replies.length
    ? replies
    : (await used()) < 8
      ? [`I think the ${term} tone of that email was a bit much.`]
      : []
  for (const reply of toSend) {
    const before = await used()
    await page.getByLabel('Your reply').fill(reply)
    await page.getByRole('button', { name: 'Send' }).click()
    log(`> ${reply}`)
    await page.waitForFunction(
      (n) => {
        const m = document.querySelector('[aria-label$="turns used"]')
        const status = document.querySelector('[role="status"]')
        return (
          (m && Number(m.getAttribute('aria-label').split(' ')[0]) > n) ||
          (status && status.textContent.trim().length > 0)
        )
      },
      before,
      { timeout: 120_000 },
    )
    log(`< meter: ${await meter.getAttribute('aria-label')}; status: ${(await page.getByRole('status').allInnerTexts()).join(' | ') || '-'}`)
  }
  // At 8 of 8 the composer goes ("Wrapping up") and the page asks for the verdict by itself; the
  // round is over when "Practise again" appears. Opening a chat already at 8 does the same.
  if ((await used()) >= 8) {
    await page.getByRole('button', { name: 'Practise again' }).waitFor({ timeout: 120_000 })
    log('closed: the verdict is in; "Practise again" is offered')
  }
  const bubbles = await page.locator('main, body').first().innerText()
  log(`transcript: ${bubbles.replace(/\s+/g, ' ').slice(0, 1500)}`)
  await shot('after-replies')
}
export default steps

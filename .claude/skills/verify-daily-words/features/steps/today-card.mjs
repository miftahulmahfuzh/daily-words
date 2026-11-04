// /today -> "Make today's card" -> six rows, the streak pill moves, the reward toast (if any).
// The no-scroll guarantee is asserted on the real screen, not only on /kitchen-sink.
const steps = async ({ page, base, shot, log }) => {
  await page.goto(`${base}/today`, { waitUntil: 'networkidle' }) // let it hydrate
  await page.getByTestId('no-card-yet').waitFor()
  log(`before: ${(await page.locator('main, body').first().innerText()).replace(/\s+/g, ' ').slice(0, 160)}`)
  await shot('no-card-yet')
  await page.getByRole('button', { name: 'Make today’s card' }).click()
  await page.getByTestId('daily-card').waitFor({ timeout: 60_000 })
  const rows = page.getByTestId('daily-card-row')
  await rows.nth(0).waitFor()
  const terms = await page.getByTestId('row-term').allInnerTexts()
  log(`card rows: ${await rows.count()} -> ${terms.join(', ')}`)
  const toast = page.getByRole('status')
  if (await toast.count()) log(`toast: ${(await toast.first().innerText()).replace(/\s+/g, ' ')}`)
  const scroll = await page.evaluate(() => ({
    doc: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }))
  log(`vertical overflow of the page: ${scroll.doc}px (the card must not scroll)`)
  if (scroll.doc > 0) throw new Error(`/today scrolls by ${scroll.doc}px`)
  await shot('card')
  // A reload must show the same card, not make another one.
  await page.reload({ waitUntil: 'networkidle' })
  const again = await page.getByTestId('row-term').allInnerTexts()
  log(`after reload: ${again.join(', ')}`)
  if (again.join() !== terms.join()) throw new Error('the card changed on reload')
}
export default steps

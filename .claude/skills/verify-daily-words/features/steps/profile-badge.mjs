// /profile: tap a badge row and a level row -> the app's one <dialog> (showModal, the art hero,
// the condition and gloss) -> Close -> focus back on the row that opened it. Also asserts there is
// exactly one <dialog> element on the page.
//   args: [badge row label regex = "Friday Blessing"] [level row label regex = "streak level"]
const steps = async ({ page, base, shot, log, args }) => {
  const badge = new RegExp(args[0] ?? 'Friday Blessing')
  const level = new RegExp(args[1] ?? 'streak level')
  await page.goto(`${base}/profile`, { waitUntil: 'networkidle' })
  log(`dialogs on the page: ${await page.locator('dialog').count()}`)
  if ((await page.locator('dialog').count()) !== 1) throw new Error('expected exactly one <dialog>')
  for (const [what, re] of [
    ['badge', badge],
    ['level', level],
  ]) {
    const row = page.getByRole('button', { name: re }).first()
    const label = await row.getAttribute('aria-label')
    await row.scrollIntoViewIfNeeded()
    await row.click()
    const dialog = page.locator('dialog[open]')
    await dialog.waitFor()
    const hero = await dialog.locator('img').first().boundingBox()
    log(`${what} "${label}": ${(await dialog.innerText()).replace(/\s+/g, ' ').slice(0, 400)}`)
    log(`  hero ${hero ? `${Math.round(hero.width)}x${Math.round(hero.height)}` : 'none'}; focused: ${await page.evaluate(() => document.activeElement?.textContent?.trim())}`)
    await shot(`${what}-dialog`)
    await dialog.getByRole('button', { name: /close/i }).click()
    await dialog.waitFor({ state: 'detached' }).catch(() => {})
    await page.locator('dialog:not([open])').waitFor({ state: 'attached' })
    const back = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
    log(`  closed; focus returned to: ${back}`)
    if (back !== label) throw new Error(`focus went to ${back}, not the ${what} row`)
  }
}
export default steps

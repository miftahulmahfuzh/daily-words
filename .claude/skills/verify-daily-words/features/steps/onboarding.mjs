// A user who has never onboarded (run as --as newcomer): /today -> /onboarding (the (app) layout's
// gate) -> answer "What do you do?", Next through the rest, Done -> /birthday (the second gate,
// asked once ever) -> a date, Save -> /today (a user with no words gets the card-empty screen).
//   args: [occupation = "nurse"] [birthday = "1990-05-17" | "skip"]
const steps = async ({ page, base, shot, log, args }) => {
  const occupation = args[0] ?? 'nurse'
  const birthday = args[1] ?? '1990-05-17'
  await page.goto(`${base}/today`, { waitUntil: 'networkidle' })
  log(`/today sent this user to ${new URL(page.url()).pathname}`)
  if (new URL(page.url()).pathname === '/onboarding') {
    await page.getByLabel('What do you do?').fill(occupation)
    await shot('q1')
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: 'Next', exact: true }).click()
      await page.waitForTimeout(250)
    }
    await shot('q5')
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await page.waitForURL((u) => u.pathname !== '/onboarding', { timeout: 30_000 })
  }
  // Done pushes /today, and the (app) layout redirects again to /birthday; the URL settles twice
  // and the second hop compiles on first use. Wait for a screen, not for a URL.
  const birthdayQ = page.getByLabel('When is your birthday?')
  const today = page.getByTestId('no-card-yet').or(page.getByTestId('daily-card')).or(page.getByTestId('card-empty'))
  await birthdayQ.or(today).first().waitFor({ timeout: 60_000 })
  if (await birthdayQ.count()) {
    log(`birthday gate: ${new URL(page.url()).pathname}`)
    await shot('birthday')
    if (birthday === 'skip') {
      await page.getByRole('button', { name: /skip|not now/i }).first().click()
    } else {
      await birthdayQ.fill(birthday)
      await page.getByRole('button', { name: 'Save', exact: true }).click()
    }
    await today.first().waitFor({ timeout: 60_000 })
  }
  log(`landed: ${new URL(page.url()).pathname}: ${(await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 200)}`)
  await shot('landed')
}
export default steps

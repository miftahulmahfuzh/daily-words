// /profile/edit, "Card reminders": what the switch says in this browser, then one tap. The fenced
// browser is granted no permission, so Notification.requestPermission() answers "denied" and the
// app must draw its denied copy, never a dead control, and never write a subscription. The success
// path (a real PushManager subscription) is not drivable here: see features/push-reminders.md.
const steps = async ({ page, base, shot, log }) => {
  await page.goto(`${base}/profile/edit`, { waitUntil: 'networkidle' })
  const section = page.getByText('Card reminders').locator('xpath=..')
  await page.waitForFunction(() => !document.body.innerText.includes('Checking…'), null, { timeout: 30_000 })
  await section.scrollIntoViewIfNeeded()
  log(`before: ${(await section.innerText()).replace(/\s+/g, ' ')}`)
  log(`Notification.permission: ${await page.evaluate(() => (typeof Notification === 'undefined' ? 'none' : Notification.permission))}`)
  await shot('reminders')
  const toggle = page.getByRole('switch', { name: "Remind me to make today's card" })
    .or(page.getByRole('checkbox', { name: "Remind me to make today's card" }))
    .or(page.getByRole('button', { name: "Remind me to make today's card" }))
  if (!(await toggle.count())) {
    log('no switch drawn (the app explained why instead)')
    return
  }
  await toggle.first().click()
  await page.waitForTimeout(1500)
  log(`after one tap: ${(await section.innerText()).replace(/\s+/g, ' ')}`)
  await shot('after-tap')
}
export default steps

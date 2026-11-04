// /journal/<id>: "Ask for an insight" (1 z.ai call, claimed before the call) -> the insight panel,
// attributed "Written by the machine. Keep or discard."
//   args: <journal entry id>
const steps = async ({ page, base, shot, log, args }) => {
  const [id] = args
  if (!id) throw new Error('journal-insight.mjs needs an entry id: -- <id>')
  await page.goto(`${base}/journal/${id}`, { waitUntil: 'networkidle' })
  await shot('entry')
  await page.getByRole('button', { name: 'Ask for an insight' }).click()
  await page
    .getByText('Written by the machine. Keep or discard.')
    .or(page.getByText('Insight failed.'))
    .first()
    .waitFor({ timeout: 90_000 })
  if (await page.getByText('Insight failed.').count()) throw new Error('the insight failed')
  const panel = page.getByText('Written by the machine. Keep or discard.').locator('xpath=..')
  log(`insight: ${(await panel.innerText()).replace(/\s+/g, ' ').slice(0, 900)}`)
  await shot('insight')
}
export default steps

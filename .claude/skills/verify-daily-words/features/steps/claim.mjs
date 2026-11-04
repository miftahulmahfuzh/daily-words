// A shared word, claimed by another signed-in user (run as --as stranger): /s/<slug> ->
// "Practise this word" -> /s/<slug>/claim sets the signed dw_claim cookie and 307s to /claim ->
// ClaimRunner submits the form by itself (a server action: one INSERT, the sharer's enrichment
// copied, zero model calls); "Add the word" is only the fallback a human taps if that stalls ->
// wherever the app sends a claimer next. Landing on the word's chat fires its opener (1 call).
//   args: <share slug of a word>
const steps = async ({ page, base, shot, log, args }) => {
  const [slug] = args
  if (!slug) throw new Error('claim.mjs needs a word share slug: -- <slug>')
  await page.goto(`${base}/s/${slug}`, { waitUntil: 'networkidle' })
  await shot('shared-word')
  await page.getByRole('link', { name: 'Practise this word' }).or(page.getByRole('button', { name: 'Practise this word' })).first().click()
  await page.waitForURL(/\/claim(\?|$)/, { timeout: 30_000 })
  const cookies = (await page.context().cookies()).map((c) => c.name)
  log(`at ${new URL(page.url()).pathname}; cookies: ${cookies.join(', ')}`)
  log(`claim page: ${(await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300)}`)
  await shot('claim')
  // Never tap "Add the word" here: the runner's own submit detaches it mid-click.
  await page.waitForURL((u) => !u.pathname.startsWith('/claim'), { timeout: 60_000 })
  await page.waitForLoadState('networkidle')
  log(`landed: ${new URL(page.url()).pathname}${new URL(page.url()).search}`)
  log(`page: ${(await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400)}`)
  await shot('landed')
}
export default steps

// /vocab/<id>: "Share this word" -> a share row and its URL (navigator.share is absent and the
// clipboard is not granted, so the link lands in the always-drawn field) -> the URL read SIGNED OUT
// in the same fenced browser -> "Stop sharing" twice (the two-tap arm) -> the URL is now the
// share 404, the same sentence as a slug that never existed.
//   args: <vocab id>
const steps = async ({ page, context, base, shot, log, allow, args }) => {
  const [id] = args
  if (!id) throw new Error('share.mjs needs a vocab id: -- <id>')
  await page.goto(`${base}/vocab/${id}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Share this word' }).click()
  const field = page.getByLabel('Link to this word')
  await field.waitFor({ timeout: 30_000 })
  const url = await field.inputValue()
  log(`share url: ${url}`)
  if (!url.startsWith(base)) throw new Error(`the link is not on this run's origin (${base}): ${url}`)
  await shot('shared')

  const signedIn = await context.cookies()
  await context.clearCookies()
  const path = new URL(url).pathname
  const res = await page.goto(`${base}${path}`, { waitUntil: 'networkidle' })
  log(`signed out ${path}: HTTP ${res.status()} at ${new URL(page.url()).pathname}`)
  if (res.status() !== 200 || new URL(page.url()).pathname !== path)
    throw new Error('a signed-out reader did not get the share page')
  log(`public page: ${(await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300)}`)
  await shot('public')
  await context.addCookies(signedIn)

  await page.goto(`${base}/vocab/${id}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Stop sharing' }).click()
  await page.getByRole('button', { name: 'Tap again to stop sharing' }).click()
  await page.getByRole('button', { name: 'Share this word' }).waitFor({ timeout: 30_000 })
  log('revoked: "Share this word" is back')

  await context.clearCookies()
  allow(/status of 404/) // the revoked page is a real 404, on purpose
  const gone = await page.goto(`${base}${path}`, { waitUntil: 'networkidle' })
  log(`after revoke, signed out ${path}: HTTP ${gone.status()} -> ${(await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 200)}`)
  if (gone.status() !== 404) throw new Error('a revoked link still answers')
  await shot('revoked')
  await context.addCookies(signedIn)
}
export default steps

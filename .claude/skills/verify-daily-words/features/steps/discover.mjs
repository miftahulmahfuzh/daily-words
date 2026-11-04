// /vocab?tab=discover: "Pick a new word for me" (1 z.ai call returns a batch; "Another" walks it
// without a call until it runs out) -> Keep -> the word is saved as source 'suggested' and listed
// under "Kept from Discover".
//   args: [another = 1]   how many times to tap "Another" before keeping
const steps = async ({ page, base, shot, log, args }) => {
  const another = Number(args[0] ?? 1)
  await page.goto(`${base}/vocab?tab=discover`, { waitUntil: 'networkidle' })
  await shot('empty')
  await page.getByRole('button', { name: 'Pick a new word for me' }).click()
  const keep = page.getByRole('button', { name: 'Keep', exact: true })
  await keep.or(page.getByText(/couldn’t|could not|try again/i)).first().waitFor({ timeout: 90_000 })
  if (!(await keep.count())) throw new Error(`no suggestion: ${(await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400)}`)
  const card = () => keep.locator('xpath=../..')
  log(`suggestion: ${(await card().innerText()).replace(/\s+/g, ' ').slice(0, 400)}`)
  for (let i = 0; i < another; i++) {
    const before = await card().innerText()
    await page.getByRole('button', { name: 'Another' }).click()
    await page.waitForFunction((b) => !document.body.innerText.includes(b.slice(0, 40)), before, { timeout: 90_000 })
    await keep.waitFor()
    log(`another: ${(await card().innerText()).replace(/\s+/g, ' ').slice(0, 400)}`)
  }
  await shot('suggestion')
  const term = (await card().innerText()).split('\n')[0].trim()
  await keep.click()
  await page.getByText('Kept from Discover').waitFor()
  await page.waitForFunction((t) => {
    const h = [...document.querySelectorAll('*')].find((e) => e.textContent === 'Kept from Discover')
    return h && h.parentElement.innerText.includes(t)
  }, term, { timeout: 30_000 })
  log(`kept: ${term}`)
  await shot('kept')
}
export default steps

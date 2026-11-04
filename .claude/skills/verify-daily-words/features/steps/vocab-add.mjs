// /vocab/new, English: type a word -> Add -> the row is saved pending -> enrichment (1 z.ai call)
// fills pronunciation, definition and examples on the card above "Add another".
//   args: [term = "lugubrious"]   a word already held (or one that folds onto one, "winnowed") ends
//   on the existing-word notice instead, with "Add <term> anyway" for a near duplicate
//
// The "Just added" pills under the form are the user's recent words, not this one: never wait on them.
const steps = async ({ page, base, shot, log, args }) => {
  const term = args[0] ?? 'lugubrious'
  await page.goto(`${base}/vocab/new`, { waitUntil: 'networkidle' })
  await page.getByPlaceholder('word').fill(term)
  await shot('typed')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const added = page.getByRole('button', { name: 'Add another' })
  const notice = page.getByText(/You already (have|had)|you marked this mastered|That looks like/i)
  await added.or(notice).first().waitFor({ timeout: 60_000 })
  if (await notice.count()) {
    log(`existing-word notice: ${(await notice.first().locator('xpath=..').innerText()).replace(/\s+/g, ' ')}`)
    await shot('existing')
    return
  }
  // The app's own signal: "finding it…" goes away when enrichment settles (ready or failed).
  await page.getByText('finding it…').waitFor({ state: 'detached', timeout: 90_000 })
  const card = added.locator('xpath=..')
  log(`card: ${(await card.innerText()).replace(/\s+/g, ' ').slice(0, 700)}`)
  await shot('enriched')
}
export default steps

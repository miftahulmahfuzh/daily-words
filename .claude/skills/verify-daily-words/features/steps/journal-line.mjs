// /journal: "+ Line" -> paste a line and where it is from -> Save -> it heads the feed. Then the
// same line again, re-cased and re-spaced -> the near-duplicate warning (layer 1, the normalised
// hash: no provider, no paid call) -> "Never mind" puts the paste back and writes nothing.
//   args: [line]   default a stamped proverb, unique per drive
const steps = async ({ page, base, shot, log, args }) => {
  const stamp = Date.now().toString(36)
  const line = args[0] ?? `Still water breeds mosquitoes, ${stamp}.`
  await page.goto(`${base}/journal`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '+ Line' }).click()
  await page.getByLabel('A line worth keeping').fill(line)
  await page.getByLabel('Where from').fill('heard on the train')
  await shot('composed')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText(line).first().waitFor({ timeout: 30_000 })
  log(`saved and listed: ${line}`)
  await shot('saved')
  // The save refreshes the feed underneath the composer; a tap during that re-render is dropped.
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)

  // The re-paste. Layer 1 folds case, quote glyphs and spacing.
  if (!(await page.getByLabel('A line worth keeping').count()))
    await page.getByRole('button', { name: '+ Line' }).click()
  await page.getByLabel('A line worth keeping').fill(`  ${line.toUpperCase()}  `)
  const save = page.getByRole('button', { name: 'Save', exact: true })
  await save.waitFor()
  log(`re-paste, Save enabled: ${await save.isEnabled()}`)
  await save.click()
  const warning = page.getByRole('status').filter({ hasText: /./ })
  await page.getByRole('button', { name: 'Keep it anyway' }).waitFor({ timeout: 30_000 })
  log(`warning: ${(await warning.first().innerText()).replace(/\s+/g, ' ').slice(0, 400)}`)
  await shot('duplicate-warning')
  await page.getByRole('button', { name: 'Never mind' }).click()
  const kept = await page.getByLabel('A line worth keeping').inputValue().catch(() => '(composer closed)')
  log(`after "Never mind" the composer holds: ${JSON.stringify(kept)}`)
}
export default steps

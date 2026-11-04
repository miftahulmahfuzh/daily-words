// /vocab/new, Non-English: a foreign word plus an optional "as in" sentence -> Look it up (1 z.ai
// call, vocab-translate) -> the English answer -> "Add <term>" inserts it ready, with the origin
// trail, in one statement (no second call).
//   args: [word = "kangen"] [as-in sentence = "aku kangen masakan ibu"]
const steps = async ({ page, base, shot, log, args }) => {
  const word = args[0] ?? 'kangen'
  const asIn = args[1] ?? 'aku kangen masakan ibu'
  await page.goto(`${base}/vocab/new`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Non-English' }).click()
  await page.getByPlaceholder('word').fill(word)
  if (asIn) await page.getByLabel('As in').fill(asIn)
  await shot('typed')
  await page.getByRole('button', { name: 'Look it up' }).click()
  const add = page.getByRole('button', { name: /^Add \S/ })
  const notice = page.getByText(/You already (have|had)/i)
  await add.or(notice).first().waitFor({ timeout: 90_000 })
  if (await notice.count()) {
    log(`existing-word notice: ${(await notice.first().locator('xpath=..').innerText()).replace(/\s+/g, ' ')}`)
    await shot('existing')
    return
  }
  const answer = add.locator('xpath=../..')
  log(`answer: ${(await answer.innerText()).replace(/\s+/g, ' ').slice(0, 700)}`)
  await shot('answer')
  log(`tapping: ${await add.innerText()}`)
  await add.click()
  await page.getByRole('button', { name: 'Add another' }).waitFor({ timeout: 30_000 })
  log(`saved: ${(await page.getByRole('button', { name: 'Add another' }).locator('xpath=..').innerText()).replace(/\s+/g, ' ').slice(0, 300)}`)
  await shot('saved')
}
export default steps

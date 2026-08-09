# F20 — The clipboard gets the bare URL

**Goal.** Tapping **Copy link** — or picking *Copy* out of the iOS share sheet —
must put the share URL in the clipboard and nothing else, for all four share
surfaces (a word, a daily card, one word of a shared card, a journal line), so
that a paste into Safari's address bar is a "paste and go".

**Architecture, for an engineer with zero context.** There is exactly one share
control in the application: `src/components/share/share-button.tsx`, a client
component rendered from three server pages (`/vocab/[id]`, `/card/[date]`,
`/journal/[id]`). It hands the URL off through a three-link chain —
`navigator.share`, then `navigator.clipboard.writeText`, then a read-only
selectable field — and F16 built that chain so that no link failing leaves the
user with nothing. Every pure decision the share feature makes lives in
`src/lib/share/policy.ts`, a module that **imports nothing at all** because the
Edge middleware, a client bundle and a bare `tsx` process all read it, and
`npm run share:check` asserts that emptiness. This change adds one pure function
there and rewires the chain to it.

---

## 1. What the user reported, and where it actually comes from

> copy link button save this in clipboard: "\<word> \<link>" . change it to only
> \<link> . so i can directly "paste and go" in safari.
> i see journal share link behave this way as well. change it to only copy the
> share link to the clipboard

**The clipboard call is already correct.** `share-button.tsx:127` is
`navigator.clipboard.writeText(target)`, where `target` is the bare URL, and the
selectable field at `:213–220` renders that same bare URL. Neither of them has
ever prepended a term.

The `<word> <link>` string is produced by **link 1 of the chain**, not link 2:

```ts
// src/components/share/share-button.tsx:117
await navigator.share({ title, text: title, url: target });
```

On iOS, `navigator.share` with **both** a `text` and a `url` is handed to the
share sheet as one item, and every plain-text target — *Copy*, Notes, the
Messages compose field — receives `text` and `url` concatenated. That is exactly
`"genteel https://…/s/abcd…"`, it is exactly what the user pasted, and it is the
same for a journal line because all three call sites pass a `title` and the one
component builds the same payload from it. `title` **alone** does not have this
effect: Safari treats it as the sheet's heading and `url` as the item.

So the fix is one field: drop `text` from the `navigator.share` payload. §3
covers why `title` stays.

## 2. Every producer of the shared text — the complete inventory

`grep -rn "navigator.share\|writeText" src/` returns two lines, both in one
file. There is no second share control, no clipboard call on any public page,
and no share affordance on `/s/<slug>/<n>` (a stranger gets **Practise this
word**, not a Share button).

| # | File | Lines | What it produces | Change |
|---|---|---|---|---|
| 1 | `src/components/share/share-button.tsx` | 114–134 (`handOff`) | `navigator.share({ title, text: title, url })` — **the bug**; then `writeText(target)` — already bare | Drop `text`; both payloads come from one pure builder |
| 2 | `src/components/share/share-button.tsx` | 210–220 | The selectable field, `value={url}` — already bare | Draw from the same builder, so it cannot drift |
| 3 | `src/app/(app)/vocab/[id]/page.tsx` | 194–201 | `title={entry.term}` → the word | Prop unchanged (§3) |
| 4 | `src/app/(app)/card/[date]/page.tsx` | 101–110 | `title={formatLocalDateLong(cardDate)}` → the date | Prop unchanged (§3) |
| 5 | `src/app/(app)/journal/[id]/entry-view.tsx` | 104–114 | `title={excerptFor(entry.text)}` → an excerpt of the line | Prop unchanged (§3) |

Call sites 3–5 are the only three, and one of them serves the shared card's
nested word route as well: `/s/<slug>/<n>` is a *URL of* the card share, minted
by the same tap on `/card/[date]` and killed by the same `DELETE`. Fixing the
one component fixes all four surfaces by construction; there is no fourth thing
to edit.

## 3. Decisions

### D1 — The sheet keeps `title`; only `text` goes

`navigator.share` legitimately carries a heading, and iOS renders `title` as the
sheet's heading above the link. Sharing a word to WhatsApp with the sheet
saying *"genteel"* is better than a sheet saying nothing, and the user's
complaint is not about the sheet — it is about what lands in the clipboard.
`text` is the field that causes the damage, because it is *plain text that
already contains the link's companion string* and every text-only target
concatenates it with `url`; `title` is metadata about the item and is not
pasted. Dropping `text` and keeping `title` therefore fixes the report exactly
and costs the sheet nothing. **The payload becomes `{ title, url }` — two
fields, and `text` appears nowhere.**

The alternative — going bare on both, `navigator.share({ url })` — was rejected
because it degrades the one link in the chain the user did not complain about,
and because it would make the `title` prop at all three call sites dead weight
that a later session would delete along with the reasoning for it.

### D2 — The field is link 3 and gets the same bare string

The selectable read-only field is the floor of the chain — the state that
always works, on an insecure origin where neither `navigator.share` nor
`navigator.clipboard` exists. If the clipboard were bare and the field were not,
the fix would be half-done for exactly the desktop-without-permission case the
field exists to serve. It already renders the bare URL today; D3 makes that
mechanical rather than coincidental.

### D3 — The payload is built by a pure function in `policy.ts`

`shareHandoff(title, url)` returns `{ sheet, text }`: the object handed to
`navigator.share`, and the plain-text string handed to both the clipboard and
the field. One function, so "the clipboard, the field and the sheet's `url` are
the same string" is a property that can be asserted offline instead of read off
three call sites.

It goes in `policy.ts` because that is where share URLs and every other pure
share decision already live, and **it imports nothing** — no `node:crypto`, no
zod, no `server-only` — so `share:check`'s `policy.ts imports nothing at all`
assertion stays green and the Edge middleware, the phone bundle and the offline
`tsx` process can all still read the module. It does **not** go in
`lib/vocab/links.ts`: `/s/[slug]` is polymorphic, and a journal share must not
reach into the vocab links module to build its URL.

### D4 — No copy changes are needed

`grep -rn "Word and link\|word and link" src/` is empty. The notice is
`SHARE_COPIED_NOTICE = 'Link copied'` (`src/lib/share/policy.ts:394`), which is
already true and becomes *more* true. `SHARE_COPY_LABEL = 'Copy link'` likewise.
Nothing in the F20 diff makes a string lie, so no string changes.

*(`SHARE_FIELD_LABEL = 'Link to this word'` is an `sr-only` label reused on a
card and a journal line, where "word" is wrong. That is an F18 copy bug, it is
not caused by this change and nothing here makes it worse, so it is out of
scope. Named here so the next reader knows it was seen, not missed.)*

### D5 — No share invariant moves

- The slug is still the capability; nothing about slug generation, minting or
  revocation is touched.
- No file gains a `` `/s/${…}` `` template literal, so `share:check`'s
  "only policy.ts builds a /s/ path" stays green.
- `getShareBySlug` and `lib/db/queries/shares.ts` are not opened.
- No route, no middleware, no migration, no server component. The diff is one
  pure function, one client component and one check script.

---

## 4. Tasks

### Task 1 — Build the payload in `policy.ts` and drop `text` from the sheet

**4.1** Edit `src/lib/share/policy.ts`. Insert this immediately after
`sharedCardWordHref` (which ends at line 100) and before the block comment for
`isPublicSharePath`:

```ts
/* --------------------------------- Hand-off -------------------------------- */

/**
 * What leaves the app when the user taps Share, as one pure record.
 *
 * **`sheet` has a `title` and a `url` and deliberately no `text`.** F16 passed
 * `text: title` as well, and on iOS that is the whole of a reported bug: a
 * `navigator.share` payload carrying both a `text` and a `url` is handed to the
 * sheet as a single item, so every plain-text target — *Copy*, Notes, the
 * Messages compose field — receives them concatenated. The clipboard then held
 * `"genteel https://…/s/…"`, which is not a URL and does not "paste and go" in
 * Safari's address bar. `title` alone does not do this: Safari draws it as the
 * sheet's heading and treats `url` as the item, which is why the heading is kept
 * rather than the whole payload going bare.
 *
 * `text` here is the plain-text hand-off — the bare URL — and it is what both
 * the clipboard and the always-drawn selectable field use. One string for both,
 * so "what you copy is what you can select" is arithmetic rather than a
 * convention two call sites happen to share. Nothing is trimmed or decorated on
 * the way out: `url` arrives from `shareHref` behind `APP_URL` and any
 * whitespace in it would already be a bug upstream.
 *
 * It lives here, with the other pure share decisions, because `share:check`
 * drives it offline and this module imports nothing.
 */
export function shareHandoff(
  title: string,
  url: string,
): { sheet: { title: string; url: string }; text: string } {
  return { sheet: { title, url }, text: url }
}
```

**4.2** Edit `src/components/share/share-button.tsx`.

Add `shareHandoff` to the existing import from `@/lib/share/policy` (it is a
sorted named-import list; `shareHandoff` sorts before the `SHARE_*` constants):

```ts
import {
  shareHandoff,
  SHARE_COPIED_NOTICE,
  SHARE_COPY_LABEL,
  SHARE_FIELD_LABEL,
  SHARE_REVOKE_ARMED_LABEL,
  SHARE_REVOKE_LABEL,
} from "@/lib/share/policy";
```

Replace the chain's documentation, lines 53–58 of the file comment, with:

```
 *   1. `navigator.share({ title, url })`. If it rejects with `AbortError`,
 *      **stop** — the user dismissed the sheet, which is a success, and falling
 *      through to the clipboard would silently copy something they declined to
 *      send. **No `text` field**: with one, iOS concatenates it onto the URL and
 *      the sheet's *Copy* yields `"genteel https://…"` rather than a link. The
 *      payload is built by `shareHandoff`, not written out here.
 *   2. Any other rejection, or no `navigator.share`: `navigator.clipboard` gets
 *      `handoff.text`, the bare URL, and a `Link copied` line.
 *   3. Always, regardless: the same bare URL sits in a selectable read-only
 *      field. **The terminal state is never "nothing happened."**
```

Replace `handOff` (lines 113–134) with:

```tsx
  /** Steps 1 and 2 of the chain. Step 3 is the field, which is always drawn. */
  async function handOff(target: string) {
    const { sheet, text } = shareHandoff(title, target);

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(sheet);
        return;
      } catch (err) {
        // The user dismissed the sheet. That is a completed intention, not a
        // failure, and copying behind their back would be the wrong answer.
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // `navigator.clipboard` needs a secure context: localhost:3200 qualifies,
      // http://192.168.x.x:3200 does not. The selectable field below is the
      // floor, and it always works.
    }
  }
```

Then, immediately after the `if (!url) { … }` early return (which ends at line
204) and before the second `return (`, add:

```tsx
  // The same record the chain hands off, so the field cannot drift from the
  // clipboard: both draw `text`.
  const payload = shareHandoff(title, url);
```

and change the field's value:

```tsx
      <TextInput
        id="share-url"
        value={payload.text}
        readOnly
        onFocus={(e) => e.currentTarget.select()}
        className="w-full"
        inputClassName="font-mono text-mono-sm"
      />
```

Finally, retitle the `title` prop's doc comment (line 83), which currently says
"beside the link" and is now precise about which field it is:

```tsx
  /**
   * The native share sheet's heading. Never the sharer's name, and never the
   * `text` field — see `shareHandoff`.
   */
  title: string;
```

**4.3** Verify:

```bash
npm run typecheck        # no output
npm run lint             # no errors
npm run share:check      # ends "All share assertions passed."
npm run claim:check      # ends with its own pass line
```

**4.4** Commit: `F20: the share sheet loses its text field; the clipboard gets the bare URL`

---

### Task 2 — Assert it offline, so it stays fixed

The property is cheap to check and expensive to rediscover on a phone. Add it
to `scripts/check-share.ts`.

**5.1** Add `shareHandoff` to the import list from `../src/lib/share/policy`
(alphabetically, beside `shareHref`).

**5.2** Insert this section at the **end of the structural-assertions section**,
immediately before the final `/** Strips block and line comments… */` helper
(currently line ~1197). Not beside the copy register at line 941: the block reads
`body`, which is built partway down the structural section, and reading it
earlier is a temporal-dead-zone crash rather than a failed assertion.

```ts
/* --------------------------------- Hand-off -------------------------------- */

section('what leaves the app when the user taps Share')

const HANDOFF_URL = `https://dword.site${shareHref('0123456789abcdef')}`
const handoff = shareHandoff('genteel', HANDOFF_URL)

/**
 * The reported bug, as an assertion. F16 passed `text: title` as well, and iOS
 * hands a payload with both a `text` and a `url` to plain-text targets — *Copy*
 * included — concatenated, so the clipboard held `"genteel https://…"` and a
 * paste into Safari's address bar searched instead of navigating.
 */
check('the sheet payload has exactly a title and a url', Object.keys(handoff.sheet), [
  'title',
  'url',
])
check("and no `text` field, which is what iOS concatenates", 'text' in handoff.sheet, false)
check('the heading survives — the sheet is not going bare', handoff.sheet.title, 'genteel')

/** The clipboard and the selectable field draw this one string. */
check('the plain-text hand-off is the URL, exactly', handoff.text, HANDOFF_URL)
check('with no term in front of it', handoff.text.includes('genteel'), false)
check('and no whitespace anywhere in it', /\s/.test(handoff.text), false)
check('so it is untrimmed-identical to what it was given', handoff.text, handoff.text.trim())
check('and it is the same string the sheet gets as its url', handoff.text, handoff.sheet.url)
// A term with spaces in it is the realistic version of the leak: it would have
// arrived in the clipboard whitespace and all.
check(
  'a multi-word title still cannot reach the clipboard',
  shareHandoff('in medias res', HANDOFF_URL).text,
  HANDOFF_URL,
)

/**
 * And the component must actually route through it. The bug was one object
 * literal written at the call site, so what is asserted is that no such literal
 * exists — a second one is how this regresses.
 */
const shareButton = stripComments(body.get('components/share/share-button.tsx') ?? '')
check('the share button exists', shareButton.length > 0, true)
check('it builds its payload through shareHandoff', shareButton.includes('shareHandoff('), true)
check(
  'and hands navigator.share no object literal of its own',
  /navigator\.share\(\s*\{/.test(shareButton),
  false,
)
check(
  'the clipboard is written the hand-off text and nothing else',
  /writeText\(\s*text\s*\)/.test(shareButton),
  true,
)
check(
  'and the selectable field draws the same string',
  /value=\{payload\.text\}/.test(shareButton),
  true,
)
```

`check`, `section`, `body` and `stripComments` are all already defined in that
file; `stripComments` is a hoisted function declaration at the foot, `body` is a
`const` built partway through the structural section, which is what fixes the
placement above.

**5.3** Verify:

```bash
npm run share:check
```

Expected: fourteen new `ok` lines under
`what leaves the app when the user taps Share`, and the run still ends
`All share assertions passed.`

Then confirm the assertion has teeth — reintroduce the bug and watch it fail:

```bash
# temporarily put `text: title,` back into shareHandoff's sheet object
npm run share:check     # FAIL "the sheet payload has exactly a title and a url"; exit 1
# revert
```

**5.4** Commit: `F20: share:check asserts the clipboard gets the bare URL`

---

### Task 3 — Record it where the next session will read it

**6.1** In `CLAUDE.md`, in the Conventions list, immediately after the bullet
beginning "**A share is a snapshot addressed by a slug…**", add:

```markdown
- **The clipboard gets the bare URL, and the sheet keeps its heading.**
  `navigator.share` is handed `{ title, url }` and **never a `text`** — iOS
  concatenates `text` onto `url` for every plain-text target, *Copy* included, so
  a `text: title` put `"genteel https://…/s/…"` on the clipboard and Safari's
  address bar searched for it instead of navigating. `shareHandoff` in
  `lib/share/policy.ts` builds both halves — the sheet object and the one plain
  string the clipboard and the always-drawn selectable field share — so the
  property is asserted by `share:check` rather than remembered at three call
  sites. Only `text` was dropped: the sheet's heading is what a recipient reads
  above the link, and it was never the thing that got pasted.
```

**6.2** Verify nothing else claims otherwise:

```bash
grep -rn "text: title" src/ scripts/         # empty
grep -rn "beside the link" src/              # only the two call-site comments,
                                             # which describe the heading
```

If either call-site comment in `card/[date]/page.tsx:104-105` or
`journal/[id]/entry-view.tsx:108-109` still says "beside the link", change
"beside" to "above" in both. Nothing else.

**6.3** Commit: `F20: note the share hand-off rule in CLAUDE.md`

---

## 5. Verification

### Offline — must all stay green

```bash
npm run typecheck     # no output
npm run lint          # no errors
npm run share:check   # "All share assertions passed."
npm run claim:check   # its own pass line; it greps every `redirectTo:` and is
                      # untouched by this change, so a failure here means
                      # something unrelated moved
```

`nav:check` and `dates:check` are not affected — no `from=` token and no date
arithmetic is involved — but they are cheap and there is no harm in running
them.

### The live pass, on port 3200 and no other

```bash
npm run share:db -- --keep          # prints three live URLs, one per kind
curl -sI http://localhost:3200/s/<slug>         # 200, no cookie jar
curl -sI http://localhost:3200/s/<cardSlug>/3   # 200, no cookie jar
```

Those two must still answer **200 with no cookie jar**. Nothing in F20 touches
the middleware exemption or the route placement, so a `307` here means something
else regressed — but the failure is invisible to a signed-in author, which is
why the curl is in the list at all.

Then, signed in on `http://localhost:3200` in **Firefox** (which has no
`navigator.share` on desktop Linux, so link 2 of the chain is what runs, and
`localhost` is a secure context so the clipboard is available):

1. Open `/vocab/<id>` on a ready word, tap **Share this word**.
2. Expect the `Link copied` line and the URL in the field.
3. Paste into the address bar. It must be exactly `http://localhost:3200/s/<16
   chars>` — no leading term, no leading or trailing space — and pressing Enter
   must navigate rather than search.
4. Repeat on `/card/<date>` (**Share this card**) and `/journal/<id>`
   (**Share this line**). All three must paste identically clean; the journal one
   is the second half of the user's report and its title is a multi-word excerpt,
   which is the case that made the old bug most obvious.

Clean up:

```sql
-- delete this user's daily_card_items and daily_cards first: [R1] is RESTRICT
delete from users where email like 'f16-share-%@example.invalid';
```

### The real device pass — the only proof of "paste and go"

`navigator.share` does not exist on desktop Linux and does not exist on an
insecure origin, so **`http://192.168.x.x:3200` from the phone cannot test
this**: on that origin the button falls straight to the field and the bug is
unreachable. The sheet must be exercised over HTTPS — the deployed origin
(`dword.site`) or an HTTPS tunnel to 3200.

On a real iPhone, in Safari:

1. Sign in, open a ready word at `/vocab/<id>`, tap **Share this word**.
2. The iOS share sheet opens. **The heading must still read the word** — that is
   D1's half of the change, and it is the thing that would silently be lost if
   `title` had been dropped too.
3. Tap **Copy**.
4. Open a new Safari tab, tap the address bar, **Paste and Go**.
5. It must navigate to the shared page. Before this change it searched, because
   the clipboard held `word` + space + URL.
6. Tap Share again and send it to **Messages** instead: the message must contain
   the link once, with a preview card, and **not** the word followed by the link.
   A duplicated link in that compose field is the same `text`/`url` bug
   reappearing.
7. Repeat 1–6 from `/journal/<id>`, where the title is a multi-word excerpt.
8. Tap **Share** on the sheet and then dismiss it without choosing anything: the
   `Link copied` line must **not** appear. That is F16's `AbortError` rule, which
   this change must not disturb.

## 6. What is deliberately not in this plan

- **No change to the three call sites' `title` props.** The word, the date and
  the excerpt are still the right headings; D1 keeps the field they feed.
- **No new copy strings.** D4 — nothing in `policy.ts`'s copy block was made
  untrue by this change.
- **No fix for `SHARE_FIELD_LABEL`'s "word" on a card and a journal line.** A
  real but pre-existing F18 copy bug, unrelated to the clipboard, and folding it
  in here would put an unreviewed string change under a commit message about
  clipboards.
- **No `navigator.clipboard.write` with a `text/uri-list` flavour.** It would be
  a second way to say the same thing, with a Safari support matrix of its own,
  to solve a problem that a deleted field already solves.

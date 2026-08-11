import { isLocalDate, parseLocalDate, type LocalDate } from "@/lib/time/local-date";

/**
 * The birthday, as a rule rather than as a field.
 *
 * One question, asked once, of everybody — and the only profile answer that is
 * not one of F7's five. It is here rather than in `normalize.ts` because
 * `ProfileAnswers` is a closed set of five columns written together by
 * `completeOnboarding`, and adding a sixth would make the claim path
 * (`lib/share/claim.server.ts`, five explicit nulls) write a sixth null it has
 * no opinion about. This is a different resource with a different rule, so it
 * gets its own module, its own route and its own screen.
 *
 * **Why it is not a sixth onboarding question.** ROADMAP_v0.1.0.md line 377 —
 * "Five questions maximum, one per screen" — and `ONBOARDING_STEPS`'s own
 * comment: "Five is a hard cap from the roadmap's first principle. Not a config
 * value." The roadmap wins over a plan, so the ask lives on `/birthday`, a
 * one-screen sibling of the `(app)` group that both a brand-new user and a user
 * who has been here since F1 meet exactly once. One code path, two audiences,
 * and the five-question flow is untouched.
 *
 * No `server-only`: the screen validates before it submits and the route
 * validates again, on the F3/F7 precedent — the client's copy keeps the form
 * honest, the server's is the real gate, and a second implementation is a
 * guarantee the two eventually disagree.
 */

/** Where the gate sends a user who has never been asked. */
export const BIRTHDAY_PROMPT_HREF = "/birthday";

/**
 * The floor on a plausible birth year. Not a validation of humanity — it is a
 * guard against a `0001-01-01` typed into a date field by a stray keystroke,
 * which `<input type="date">` will happily produce and which would then read as
 * a real answer forever.
 */
export const MIN_BIRTHDAY_YEAR = 1900;

export type BirthdayRejection = "not_a_date" | "in_the_future" | "too_old";

export type BirthdayResult =
  | { ok: true; value: LocalDate | null }
  | { ok: false; reason: BirthdayRejection };

/** One sentence per rejection, shown to the user verbatim. */
export const BIRTHDAY_ERRORS: Record<BirthdayRejection, string> = {
  not_a_date: "That is not a date.",
  in_the_future: "That day has not happened yet.",
  too_old: `Nothing before ${MIN_BIRTHDAY_YEAR}.`,
};

/**
 * What the routes and the screen accept.
 *
 * **`null` and `''` both mean "no birthday", and both are `ok`.** That is the
 * skip, and it is also the way back out of a wrong answer from the edit form —
 * "I would rather not say" has to be expressible, exactly as it is for the five
 * answers, or the only way out of a mistake is another mistake.
 *
 * `today` is the user's local date and is passed in rather than read: this
 * module holds no clock, for the reason `lib/gamification/` holds none either.
 * A future birthday is refused because it is the one wrong answer that can never
 * come true in a way the user would notice — the badge simply never arrives, and
 * there is nothing on screen to explain why.
 */
export function normalizeBirthday(raw: unknown, today: LocalDate): BirthdayResult {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, reason: "not_a_date" };

  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, value: null };

  // `isLocalDate`, never a `/^\d{4}-\d{2}-\d{2}$/` shape test. F18 learned that
  // one the expensive way: `2026-13-99` passes the shape and reaches the `date`
  // column, where Postgres raises a cast error and a typo answers 500.
  if (!isLocalDate(trimmed)) return { ok: false, reason: "not_a_date" };
  if (parseLocalDate(trimmed).year < MIN_BIRTHDAY_YEAR) {
    return { ok: false, reason: "too_old" };
  }
  // String comparison, because both sides are 'YYYY-MM-DD' — the whole reason
  // `date` columns are read and written as strings in this app.
  if (trimmed > today) return { ok: false, reason: "in_the_future" };

  return { ok: true, value: trimmed };
}

/**
 * Has this user never been put the question?
 *
 * The predicate the gate in `app/(app)/layout.tsx` and the inverse gate in
 * `app/birthday/page.tsx` both call — strict complements, so at most one of the
 * two can fire for a given row, which is the same shape that makes the
 * onboarding gate loop-free.
 *
 * **Both columns, and `birthday_asked_at` is the load-bearing one.** On
 * `birthday IS NULL` alone, a user who skipped would be asked again on every app
 * open for the rest of their life — the question would stop being a question and
 * become a wall. Answering and skipping both stamp the timestamp, so the ask
 * happens once and the edit form is where it changes afterwards.
 */
export function needsBirthdayPrompt(profile: {
  birthday: string | null;
  birthdayAskedAt: Date | null;
}): boolean {
  return profile.birthday === null && profile.birthdayAskedAt === null;
}

import { notFound } from "next/navigation";
import { z } from "zod";
import { Screen, ScreenBody } from "@/components/layout/screen";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Eyebrow, Meta, Prose } from "@/components/ui/text";
import { ShareButton } from "@/components/share/share-button";
import { CorrectionBanner } from "@/components/vocab/correction-banner";
import { DeleteWordButton } from "@/components/vocab/delete-word-button";
import { RetryEnrichmentButton } from "@/components/vocab/retry-enrichment-button";
import { requireUser } from "@/lib/auth/session";
import { getShareForEntity } from "@/lib/db/queries/shares";
import { getVocabEntryDetail } from "@/lib/db/queries/vocab";
import { env } from "@/lib/env";
import { shareHref, SHARE_ACTION_LABEL } from "@/lib/share/policy";
import { enrichmentCopy, isStalePending } from "@/lib/vocab/display";
import { termSizeClass } from "@/lib/vocab/format";
import { backTarget, parseOrigin, vocabChatHref } from "@/lib/vocab/links";
import { cn } from "@/lib/ui/cn";
import { MasteredToggle } from "./mastered-toggle";

/* A real route, not a modal. On iOS Safari a full-page modal loses the
   edge-swipe back gesture, needs hand-rolled scroll locking, and breaks the
   height budget when the URL bar collapses. See the roadmap's Locked Decisions.

   Everything here is read from the database. No LLM call is issued on load —
   the roadmap's persistence rule — and the one thing on the page that can cause
   a model call is the explicit Try again button. */
export default async function WordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /* Wider than the `string` `/vocab/page.tsx` uses for `tab` and `q`, because
     `parseOrigin` is the thing that has to be honest about a repeated param: a
     `from` given twice arrives as an array and is discarded, not sampled. */
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  /* Where the user came from, resolved once. `parseOrigin` narrows to a closed
     union or `null`, and `backTarget` maps a union member — never a string — to
     a literal href, so a hand-typed `from` of `https://evil.example` cannot
     become a link. The
     absent, unrecognised and `collection` cases all land on the Collection,
     which is what makes this strictly additive: every URL that worked before
     F11 still says exactly what it said. */
  const origin = parseOrigin((await searchParams).from);
  const back = backTarget(origin);

  // A malformed id must never reach the database: compared against a `uuid`
  // column it is a cast error and a 500, where the honest answer is a 404.
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) notFound();

  // Scoped to the session user, and 404 rather than 403 for anyone else's row —
  // a 403 confirms the id exists.
  const entry = await getVocabEntryDetail(user.id, parsed.data);
  if (!entry) notFound();

  const ready = entry.enrichmentStatus === "ready";

  /* F16. A third page-level read rather than a second feature's concern inside
     `getVocabEntryDetail` — one indexed lookup on `shares_vocab_entry_uniq`,
     issued only when the word is ready, because that is the only state in which
     the control renders. It is what lets the button draw its shared state
     without a round trip on open. */
  const share = ready ? await getShareForEntity(user.id, "vocab", entry.id) : null;
  /**
   * A `pending` row older than two minutes is drawn as failed. The user closed
   * the app mid-enrichment and the request died with the page; nothing on the
   * server knows that, because the roadmap forbids scheduled sweepers, so the
   * recovery is a visible button.
   */
  const stalled =
    entry.enrichmentStatus === "failed" ||
    isStalePending(entry.enrichmentStatus, entry.createdAt);
  const failure = stalled ? enrichmentCopy(entry.enrichmentError) : null;
  const examples = Array.isArray(entry.examples) ? entry.examples : [];

  return (
    <Screen>
      <ScreenBody scroll padded={false} className="px-6 pb-7">
        <BackLink href={back.href} label={back.label} />

        {/* F14 D1. Rendered only when the column is non-null, which is the case
            for no correctly spelled word — so F4 §7.3's height budget is
            unchanged by default. Above the term deliberately: the question is
            about which word this row *is*, and everything below it describes
            the corrected spelling rather than the one in the heading. */}
        {entry.suggestedCorrection && (
          <CorrectionBanner
            id={entry.id}
            term={entry.term}
            suggestion={entry.suggestedCorrection}
            origin={origin}
          />
        )}

        {/* `break-words` matters at the smallest bucket: `line-clamp-2` gives a
            long term two lines, but a single unbreakable word has no break
            opportunity, so it stayed on one line and `overflow: hidden` clipped
            it mid-letter with no ellipsis. With this it wraps, and the clamp's
            ellipsis appears only if two lines still are not enough. */}
        <h1
          className={cn(
            "m-0 pt-2 font-normal break-words text-pretty",
            termSizeClass(entry.term),
          )}
          title={entry.term}
        >
          {entry.term}
        </h1>

        {(entry.pronunciation || entry.partOfSpeech) && (
          <div className="flex items-baseline gap-3 pt-3">
            {/* IPA in mono, always: Source Serif 4's latin subset does not
                guarantee the IPA Extensions block and the fallback is visible. */}
            {entry.pronunciation && (
              <span className="font-mono text-mono-lg text-ink-2">
                {entry.pronunciation}
              </span>
            )}
            {entry.partOfSpeech && (
              <span className="text-sm italic text-ink-3">{entry.partOfSpeech}</span>
            )}
          </div>
        )}

        <div className="mt-4.5 h-px bg-rule" />

        {ready && entry.definition && (
          <p className="m-0 py-4.5 pb-6.5 text-[21px] leading-[1.35] tracking-tight text-pretty">
            {entry.definition}
          </p>
        )}

        {!ready && !stalled && (
          <span className="flex items-center gap-2 py-4.5 pb-6.5 text-ink-3">
            <Spinner size={16} />
            <Meta>finding it…</Meta>
          </span>
        )}

        {failure && (
          <div className="flex flex-col items-start gap-3 py-4.5 pb-6.5">
            <Prose size="body">{failure.message}</Prose>
            {failure.retry && <RetryEnrichmentButton entryId={entry.id} label="Try again" />}
          </div>
        )}

        {/* Never a "Usage" heading over nothing — the absence reads better than
            an apology for it. */}
        {ready && examples.length > 0 && (
          <>
            <Eyebrow>Usage</Eyebrow>
            <div className="flex flex-col gap-3.5 pt-3 pb-7">
              {examples.map((example, i) => (
                <Prose key={i} size="body" className="border-l border-rule pl-3.5">
                  {example}
                </Prose>
              ))}
            </div>
          </>
        )}

        {/* Where the word came from, when it came from a non-English lookup.
            Below the entry rather than above it: this row is an English word
            and everything above describes it as one. The trail is why it is
            here, not what it means.

            Drawn wherever the entry is, which is the lesson F14 wrote down
            about `suggested_correction` — a fact recorded only on the screen
            that created it is a fact lost to a reload.

            `originContext` is deliberately quoted and unlabelled beyond "as
            in". It is the user's own sentence in their own language, and it
            never leaves this page: `lib/share/serialize.ts` excludes all three
            of these columns for the reason it excludes a journal entry's
            source note. */}
        {entry.originTerm && (
          <div className="flex flex-col gap-1.5 pb-7">
            <Eyebrow>Added from</Eyebrow>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 pt-1">
              <span className="text-lg tracking-title">{entry.originTerm}</span>
              {entry.originLanguage && <Meta>{entry.originLanguage}</Meta>}
            </div>
            {entry.originContext && (
              <Prose size="sm" className="border-l border-rule pl-3.5 text-ink-2">
                as in: {entry.originContext}
              </Prose>
            )}
          </div>
        )}

        {/* F4 renders exactly one chat entry point, and it stays for a mastered
            word: mastering retires a word from daily cards, not from practice.
            F6 owns the route and must re-verify ownership itself — the button
            is not the only way to reach the URL. */}
        {/* The chat inherits the word's origin rather than becoming one, so
            back out of the chat and back again lands where the user started
            (F11 D6). */}
        <Button
          variant="filled"
          href={ready ? vocabChatHref(entry.id, origin) : undefined}
          disabled={!ready}
        >
          Practise this word
        </Button>
        {!ready && <Meta className="block pt-2">Available once the word is ready</Meta>}

        <MasteredToggle id={entry.id} initial={entry.status === "mastered"} />

        {/* F16. Below the practice and mastered controls, above Delete, which
            stays last. Rendered only when the word is ready: sharing a word that
            still says "finding it…" hands a stranger a page with a term and
            nothing under it, and the page already prints one "Available once the
            word is ready" line — a second would be noise, so this control simply
            is not there yet. */}
        {ready && (
          <ShareButton
            entityType="vocab"
            entityId={entry.id}
            title={entry.term}
            label={SHARE_ACTION_LABEL}
            initialSlug={share?.slug ?? null}
            initialUrl={share ? `${env.APP_URL}${shareHref(share.slug)}` : null}
          />
        )}

        {entry.carded ? (
          /* [R1], verbatim. A past card is a record of a day that happened, and
             deleting a word must never punch a hole in it. */
          <Meta className="block pt-5">
            This word is on past cards. Mark it mastered to retire it.
          </Meta>
        ) : (
          <DeleteWordButton id={entry.id} term={entry.term} />
        )}
      </ScreenBody>
    </Screen>
  );
}

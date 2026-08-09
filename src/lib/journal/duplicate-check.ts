import "server-only";
import {
  findByNormSha,
  findNearest,
  type DuplicateMatchRow,
  type EmbeddingFacts,
} from "@/lib/db/queries/journal-embeddings";
import { embed } from "@/lib/llm/embed";
import { EMBED_TIMEOUT_MS } from "@/lib/journal/limits";
import {
  duplicateVerdict,
  EMBEDDING_DIMENSIONS,
  normShaFor,
  textShaFor,
  type DuplicateVerdict,
  type Layer2Outcome,
} from "@/lib/journal/similarity";

/**
 * "Have I kept this already?", asked once per save, in two layers.
 *
 * The only caller of the query module and (in Phase B) of `embed()`, and the one
 * place the degradation rules live. Everything it can fail at falls through to
 * the INSERT — a provider outage must never prevent a save, which is Product
 * Principle 5 and the property `journal:check` asserts directly.
 *
 * **Layer 1 first, and only on a miss does anything cost a network call.** The
 * re-paste — the same highlight copied twice, different whitespace, different
 * quote glyphs — is the duplicate a user actually creates, and it is caught for
 * zero milliseconds and no key. That is also why blocking the save on this is
 * cheap: most saves never reach Layer 2 at all.
 */

export type DuplicateCheck = {
  verdict: DuplicateVerdict;
  /** Non-null if and only if `verdict === "duplicate"`. */
  match: DuplicateMatchRow | null;
  /**
   * What to write into the sibling row **after** the entry exists.
   *
   * Always present, including when nothing was embedded: recording `norm_sha` on
   * every save is what makes Layer 1 work with no provider at all, and it is
   * exactly [D3]'s "attempted, could not" state that the backfill picks up under
   * `--retry-failed` the moment a provider appears.
   */
  sibling: EmbeddingFacts;
  /** The one server-log line. Never rendered. */
  log: {
    layer1: "hit" | "miss";
    distance: number | null;
    runnerUp: number | null;
    ms: number;
  };
};

export async function checkForDuplicate(
  userId: string,
  text: string,
  opts: { force: boolean },
): Promise<DuplicateCheck> {
  const started = Date.now();
  const textSha = textShaFor(text);
  const normSha = normShaFor(text);

  /**
   * What is known when nothing was embedded.
   *
   * `'failed'` with no attempt counted is not a failed *attempt* — nothing was
   * attempted. It is [D3]'s "attempted, could not" slot being used to record
   * `norm_sha`, which is what makes Layer 1 work on the next save even where no
   * provider was ever configured.
   */
  const unembedded = (reason: string): EmbeddingFacts => ({
    status: "failed",
    textSha,
    normSha,
    reason,
  });

  const done = (
    verdict: DuplicateVerdict,
    match: DuplicateMatchRow | null,
    sibling: EmbeddingFacts,
    log: Partial<DuplicateCheck["log"]> = {},
  ): DuplicateCheck => ({
    verdict,
    match: verdict === "duplicate" ? match : null,
    sibling,
    log: {
      layer1: log.layer1 ?? "miss",
      distance: log.distance ?? null,
      runnerUp: log.runnerUp ?? null,
      ms: Date.now() - started,
    },
  });

  // `force` is unconditional: no query, no model call, no second thoughts.
  if (opts.force) {
    return done("forced", null, unembedded("not embedded"));
  }

  /* ----------------------------- Layer 1, free ----------------------------- */

  const layer1 = await findByNormSha(userId, normSha);
  if (layer1) {
    return done(
      duplicateVerdict({ forced: false, layer1Hit: true, layer2: { kind: "skipped" } }),
      layer1,
      unembedded("not embedded"),
      { layer1: "hit" },
    );
  }

  /* -------------------------- Layer 2, one call ---------------------------- */

  const result = await embed([text], {
    timeoutMs: EMBED_TIMEOUT_MS,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  if (!result.ok) {
    // Provider down, unconfigured, slow, or a width mismatch. Every one of them
    // falls through to the INSERT — the save must work.
    console.warn(
      `[journal.dedup] layer 2 unavailable: ${result.error.kind} ${result.error.detail}`,
    );
    return done(
      duplicateVerdict({ forced: false, layer1Hit: false, layer2: { kind: "error" } }),
      null,
      unembedded(`${result.error.kind}: ${result.error.detail.slice(0, 200)}`),
    );
  }

  const vector = result.vectors[0];
  const nearest = await findNearest(userId, vector);

  // Kept whatever the verdict: the vector has been paid for, and the row about
  // to be inserted needs one whether or not it collided. One save, one call,
  // one row — there is no second pass.
  const sibling: EmbeddingFacts = {
    status: "ready",
    textSha,
    normSha,
    model: result.model,
    embedding: vector,
  };

  const layer2: Layer2Outcome =
    nearest.length === 0 ? { kind: "empty" } : { kind: "ok", distance: nearest[0].distance };

  return done(
    duplicateVerdict({ forced: false, layer1Hit: false, layer2 }),
    nearest[0] ?? null,
    sibling,
    {
      distance: nearest[0]?.distance ?? null,
      runnerUp: nearest[1]?.distance ?? null,
    },
  );
}

/**
 * One line per save, warned or not.
 *
 * This is how the threshold gets re-tuned against a real journal rather than
 * against a twenty-pair corpus, and it is why `findNearest` returns three rows
 * instead of one — the runner-up distance is the interesting half of the data.
 * The user id is truncated: a log line does not need to identify anybody.
 */
export function logDuplicateCheck(
  userId: string,
  check: DuplicateCheck,
  threshold: number,
): void {
  const d = check.log.distance;
  const r = check.log.runnerUp;
  console.log(
    `[journal.dedup] user=${userId.slice(0, 8)} layer1=${check.log.layer1}` +
      ` d=${d === null ? "-" : d.toFixed(3)}` +
      ` runner=${r === null ? "-" : r.toFixed(3)}` +
      ` T=${threshold} verdict=${check.verdict} ms=${check.log.ms}`,
  );
}

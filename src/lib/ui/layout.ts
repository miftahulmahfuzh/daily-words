/**
 * The layout budget, as numbers, so the components and the Playwright spec are
 * asserted against the same values they are built from.
 *
 * ROADMAP [R19] settled the shape of this budget: the no-scroll guarantee is
 * STRUCTURAL, not arithmetic. The card takes the space left after the header,
 * day strip and tab bar, and six `flex: 1 1 0` rows divide it. There is
 * therefore no fixed card height and no fixed screen total to publish — F2's
 * own §7.2 figures (347px card, 520px `todayFixedTotal`) describe a layout the
 * roadmap replaced, and a constant that no longer describes the DOM is worse
 * than its absence.
 *
 * What survives is a floor and a count.
 */
export const LAYOUT = {
  /**
   * The daily-card row floor at the smallest supported viewport (375×667).
   * F2 proved 52px with a seven-device ledger; [R19] keeps it as the floor
   * rather than the fixed height. Rows compress toward it and stop.
   */
  rowMinH: 52,

  /** Resting row height at 390×844, where the slack is comfortable. Informational. */
  rowRestingH: 60,

  /** Words per card. Locked by the roadmap; not configurable in v0.1.0. */
  cardSize: 6,

  /** Every tappable element is at least this on both axes, padding included. */
  touchMin: 44,

  /** The design's horizontal gutter. Mirrored as `--gutter` in globals.css. */
  gutter: 22,

  /**
   * Below this viewport height the budget cannot hold and `.dw-pane-fixed`
   * starts scrolling. Mirrored in the `@media (max-height: …)` rule in
   * globals.css — change both.
   */
  designFloorDvh: 545,
} as const;

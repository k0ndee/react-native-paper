import { describe, expect, it } from '@jest/globals';

import { resolveSharedShrinkWidth } from '../Toolbar/useCollapse';

describe('resolveSharedShrinkWidth', () => {
  it('returns the natural width when nothing has been shrunk yet', () => {
    expect(resolveSharedShrinkWidth(104, 0)).toBe(104);
    expect(resolveSharedShrinkWidth(52, 0)).toBe(52);
  });

  it('subtracts the shrink amount directly while width remains', () => {
    expect(resolveSharedShrinkWidth(104, 40)).toBe(64);
    expect(resolveSharedShrinkWidth(52, 40)).toBe(12);
  });

  it('clamps at 0 instead of going negative once fully shrunk', () => {
    expect(resolveSharedShrinkWidth(52, 52)).toBe(0);
    expect(resolveSharedShrinkWidth(52, 80)).toBe(0);
  });

  // This is the actual bug this function exists to fix: `leading`/
  // `trailing` sit on either side of `children` (the key action) in
  // normal flex flow, so `children` only stays put on screen if both
  // sides lose the same *absolute* amount of width at every instant — not
  // the same fraction of their own size. Springing each side's width
  // independently from its own natural size toward `0` gives the latter
  // (confirmed live: symmetric leading/trailing held `children` in place,
  // any size difference between them made it visibly drift). Driving both
  // from one shared, growing "shrink amount" gives the former, for as
  // long as both sides still have width left.
  it('shrinks differently-sized sides by the same absolute amount while both have width left', () => {
    const leadingNatural = 104; // e.g. two icons
    const trailingNatural = 52; // e.g. one icon

    for (const shrinkAmount of [0, 10, 25, 51]) {
      const leadingWidth = resolveSharedShrinkWidth(
        leadingNatural,
        shrinkAmount
      );
      const trailingWidth = resolveSharedShrinkWidth(
        trailingNatural,
        shrinkAmount
      );
      // Both sides have exactly `shrinkAmount` less than their own
      // natural width — the same absolute loss, not the same fraction
      // (which would make leading, being twice as wide, lose twice as
      // much — exactly the drift this function replaces).
      expect(leadingNatural - leadingWidth).toBe(shrinkAmount);
      expect(trailingNatural - trailingWidth).toBe(shrinkAmount);
    }
  });

  it('only decouples once the narrower side has fully collapsed', () => {
    const leadingNatural = 104;
    const trailingNatural = 52;

    // Once `shrinkAmount` exceeds `trailingNatural`, trailing is already
    // at `0` and can't lose any more — only leading keeps shrinking from
    // here, which is the one point where the two sides' losses genuinely
    // diverge (unavoidable: there's nothing left on the trailing side to
    // keep moving in step).
    const shrinkAmount = 70;
    expect(resolveSharedShrinkWidth(trailingNatural, shrinkAmount)).toBe(0);
    expect(resolveSharedShrinkWidth(leadingNatural, shrinkAmount)).toBe(
      leadingNatural - shrinkAmount
    );
  });
});

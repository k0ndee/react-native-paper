import * as React from 'react';
import type { LayoutChangeEvent, ViewStyle } from 'react-native';

import {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type AnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useReduceMotion } from '../../theme/accessibility/ReduceMotionContext';
import { toRawSpring } from '../../theme/tokens/sys/motion';
import type { InternalTheme } from '../../types';

export type Segment = {
  /**
   * A `width` that always tracks the latest natural measurement directly —
   * never springs, never goes to `0`. Reserves layout space equal to this
   * segment's *expanded* size regardless of the current collapse state, so
   * anything laid out after it (e.g. a paired `fab`) never has to move as
   * this segment collapses/expands — only apply this to a segment whose
   * neighbors need to stay put; the plain squeeze `style` below is enough
   * on its own otherwise.
   */
  reserveStyle: AnimatedStyle<ViewStyle>;
  /** Apply to the wrapper actually being squeezed: animated `width`, clips its (naturally-sized) content as it shrinks. */
  style: AnimatedStyle<ViewStyle>;
  /**
   * Apply to an **offscreen, unconstrained duplicate** of this segment's
   * content (see `Toolbar.tsx`'s render sites) — not to the live, visible
   * copy. The live copy sits inside this segment's own animated `style`
   * ancestor, whose width can be `0` mid-collapse; a view's `onLayout`
   * measurement can't be trusted to still report its true intrinsic size
   * once an ancestor has squeezed it that small, so this is measured on a
   * separate, always full-size copy instead (same technique `FAB.Extended`
   * uses for its own label).
   */
  onLayout: (e: LayoutChangeEvent) => void;
  /**
   * Raw natural (fully expanded) measured width — `0` until the first
   * measurement lands. Exposed so `useCollapse` can combine several
   * segments' natural/current widths into a derived total (see
   * `pillWidthStyle`), not meant for direct use in a render site.
   */
  naturalWidth: SharedValue<number>;
  /** Raw current (possibly mid-collapse) width — same caveat as `naturalWidth`. */
  width: SharedValue<number>;
  /** Whether the first measurement has landed yet. */
  hasMeasured: boolean;
};

/**
 * `leading`/`trailing`'s own live-wrapper style plus the raw measurement
 * plumbing `pillWidthStyle` needs — no `reserveStyle` (unlike `Segment`):
 * nothing anchors against `leading`/`trailing` individually the way `fab`
 * anchors against `group`, so it'd go unused.
 */
export type SharedShrinkSegment = {
  /** Apply to the wrapper actually being squeezed: animated `width`, clips its (naturally-sized) content as it shrinks. */
  style: AnimatedStyle<ViewStyle>;
  /** Same offscreen-duplicate caveat as `Segment.onLayout`. */
  onLayout: (e: LayoutChangeEvent) => void;
};

type UseCollapseResult = {
  /** Wraps `leading`+`children`+`trailing` together, shrinking to `0` — used when paired with a `fab`. */
  group: Segment;
  /** Wraps `leading` alone — used when there's no `fab` (leaves `children` untouched). */
  leading: SharedShrinkSegment;
  /** Wraps `trailing` alone — used when there's no `fab`. */
  trailing: SharedShrinkSegment;
  /** Shared fade for whichever of the segments above is actually rendered. */
  fadeStyle: AnimatedStyle<ViewStyle>;
  /**
   * `PillSurface`'s own explicit width for the no-`fab` case, applied to
   * the wrapping `Reanimated.View` it fills — see its own doc comment at
   * the definition site. Not meaningful/used for the `fab` case, which
   * computes width independently via `group` directly.
   */
  pillWidthStyle: AnimatedStyle<ViewStyle>;
  /**
   * Whether `group`'s current width (not just the `visible` *intent*) is
   * at/near `0` right now — for the `fab` case's `PillSurface` to gate its
   * Android `elevation` snap on, instead of the raw `visible` prop. Gating
   * on `visible` directly snapped the shadow off the instant a collapse
   * *started* (before the width spring had shrunk at all), which read as
   * the pill abruptly vanishing rather than mirroring the show animation
   * — confirmed live. Gating on the pill's actual current size instead
   * keeps the shadow present throughout the shrink, matching the (already
   * correct-looking) expand direction, and only drops it once the pill is
   * already visually gone.
   */
  groupCollapsed: boolean;
};

function useShrinkSegment(visible: boolean, theme: InternalTheme): Segment {
  const reduceMotion = useReduceMotion();
  const naturalWidth = useSharedValue(0);
  const width = useSharedValue(0);
  // Not yet measured until the first `onLayout`. A plain ref (not just the
  // shared value above) so the *first-ever* measurement can be told apart
  // from every later one below, and a companion bit of React state so the
  // style recalculates once that first measurement lands (a shared value's
  // mutation alone doesn't retrigger anything reactive).
  const measuredOnce = React.useRef(false);
  const [hasMeasured, setHasMeasured] = React.useState(false);
  // Always the latest `visible`, readable from `onLayout` without it being
  // in that callback's own dependencies (see why below) — a plain
  // assignment during render, not a ref set from an effect, so it's
  // current even for a native event that was already in flight when
  // `visible` last changed.
  const visibleRef = React.useRef(visible);
  visibleRef.current = visible;

  const onLayout = React.useCallback(
    (e: LayoutChangeEvent) => {
      const measuredWidth = e.nativeEvent.layout.width;
      naturalWidth.value = measuredWidth;
      if (!measuredOnce.current) {
        measuredOnce.current = true;
        // Establishes the resting size the very first time, with no
        // animation — there's nothing to transition from yet, this is
        // just what an ordinary first layout would do. Runs exactly once
        // (guarded by the ref, not the effect below), but still has to
        // pick the *correct* resting size, which depends on whatever
        // `visible` actually is by the time this fires: if a collapse was
        // triggered before the first measurement ever landed, the effect
        // below already bailed out (nothing to animate to/from yet,
        // `hasMeasured` was still `false`), so this is the only place left
        // to establish the correct (collapsed) resting size — unconditionally
        // snapping to `measuredWidth` here regardless of `visible` was
        // exactly that bug: it would flash open to full width right as
        // `hasMeasured` flips true, then immediately spring back down,
        // reading as "collapses, jumps open, collapses again". Reads
        // `visibleRef` rather than closing over `visible` directly so a
        // native event still in flight from an older render can't read a
        // stale value.
        width.value = visibleRef.current ? measuredWidth : 0;
        setHasMeasured(true);
      }
    },
    [naturalWidth, width]
  );

  React.useEffect(() => {
    // Nothing to animate to/from until the first measurement lands —
    // `onLayout` above already established the correct resting size.
    if (!hasMeasured) {
      return;
    }

    const target = visible ? naturalWidth.value : 0;
    const spring = toRawSpring(theme.motion.spring.default.spatial);
    width.value = reduceMotion ? target : withSpring(target, spring);
  }, [visible, hasMeasured, theme, reduceMotion, naturalWidth, width]);

  // Before the first measurement, no `width` override at all — content
  // renders at its natural size, same as if unwrapped.
  const style = useAnimatedStyle(
    () => (hasMeasured ? { width: width.value } : {}),
    [width, hasMeasured]
  );
  // Directly mirrors `naturalWidth` — no spring, never `0`. Only meant to
  // reserve space; the actual collapse visual comes from `style` above,
  // applied to a nested element that shrinks *within* this fixed footprint.
  const reserveStyle = useAnimatedStyle(
    () => ({ width: naturalWidth.value }),
    [naturalWidth]
  );

  return { reserveStyle, style, onLayout, naturalWidth, width, hasMeasured };
}

/**
 * Pure measurement — natural width, whether it's landed yet, and the
 * `onLayout` to feed it — with no spring of its own. `leading`/`trailing`
 * use this instead of `useShrinkSegment` because they need to share a
 * single spring between them (see `useSharedShrink`), not each get their
 * own independent one.
 */
function useMeasuredWidth() {
  const naturalWidth = useSharedValue(0);
  const measuredOnce = React.useRef(false);
  const [hasMeasured, setHasMeasured] = React.useState(false);

  const onLayout = React.useCallback(
    (e: LayoutChangeEvent) => {
      naturalWidth.value = e.nativeEvent.layout.width;
      if (!measuredOnce.current) {
        measuredOnce.current = true;
        setHasMeasured(true);
      }
    },
    [naturalWidth]
  );

  return { naturalWidth, hasMeasured, onLayout };
}

type MeasuredWidth = ReturnType<typeof useMeasuredWidth>;

/**
 * A single shared "shrink amount" spring driving *both* `leading` and
 * `trailing`, rather than each having its own independent spring toward
 * `0`. Needed because `children` (the key action) sits between them in
 * normal flex flow, positioned at whatever `leading`'s *current* width
 * happens to be — so it only stays put if `leading`/`trailing` lose the
 * same absolute amount of width at every instant. A spring per side, each
 * decaying independently from its own natural width toward `0` with the
 * same config, doesn't give that: springs are linear in displacement, so
 * both decay by the same *fraction* of their own size at any instant —
 * the wider side always loses more absolute width than the narrower one,
 * so their difference (which is exactly `children`'s offset from center)
 * keeps shrinking too, dragging it sideways. Confirmed live: symmetric
 * `leading`/`trailing` held `children` in place; any size difference
 * between them made it visibly drift, worse the bigger the imbalance.
 *
 * Subtracting one shared, growing "amount" from each side's own natural
 * width (each clamped at `0`) fixes this: both sides shrink in lockstep
 * by the same amount for as long as both still have width left, and only
 * decouple once the narrower side has already fully collapsed and the
 * wider one has to keep going alone — unavoidable, since there's nothing
 * left on the narrower side to keep moving in step.
 *
 * `hasLeading`/`hasTrailing` matter for the bootstrap below: a side that
 * isn't rendered at all (its `leading`/`trailing` prop is unset) never
 * mounts an offscreen duplicate to measure, so its `hasMeasured` would
 * otherwise never flip `true` — blocking the whole thing forever whenever
 * only one of the two is in use.
 */
function useSharedShrink(
  visible: boolean,
  theme: InternalTheme,
  hasLeading: boolean,
  hasTrailing: boolean,
  leading: MeasuredWidth,
  trailing: MeasuredWidth
): SharedValue<number> {
  const reduceMotion = useReduceMotion();
  const shrinkAmount = useSharedValue(0);
  const bootstrapped = React.useRef(false);
  const visibleRef = React.useRef(visible);
  visibleRef.current = visible;

  const ready =
    (!hasLeading || leading.hasMeasured) &&
    (!hasTrailing || trailing.hasMeasured);

  React.useEffect(() => {
    if (!ready) {
      return;
    }
    const maxNatural = Math.max(
      leading.naturalWidth.value,
      trailing.naturalWidth.value
    );
    if (!bootstrapped.current) {
      bootstrapped.current = true;
      // Same reasoning as `useShrinkSegment`'s own bootstrap: pick the
      // resting value that matches `visible` *right now*, not
      // unconditionally the expanded one, or a collapse triggered before
      // this first measurement would flash open then immediately
      // re-collapse.
      shrinkAmount.value = visibleRef.current ? 0 : maxNatural;
      return;
    }
    const target = visible ? 0 : maxNatural;
    const spring = toRawSpring(theme.motion.spring.default.spatial);
    shrinkAmount.value = reduceMotion ? target : withSpring(target, spring);
  }, [
    visible,
    ready,
    theme,
    reduceMotion,
    shrinkAmount,
    leading.naturalWidth,
    trailing.naturalWidth,
  ]);

  return shrinkAmount;
}

/**
 * The actual width-from-shrink-amount formula, pulled out as a plain,
 * unit-testable function — same reason `resolveScrollTarget` is pulled out
 * of `scrollVisibility.tsx`'s scroll handler: Reanimated's jest mock makes
 * `useAnimatedStyle`/`useSharedValue` non-reactive, so the worklet body
 * itself can't be exercised through the public hooks in tests. This is
 * also the one piece of `useSharedShrink`'s own reasoning (both sides
 * losing the same *absolute* amount of width, not the same fraction) that
 * a test can actually pin down.
 */
export function resolveSharedShrinkWidth(
  naturalWidth: number,
  shrinkAmount: number
): number {
  'worklet';
  return Math.max(0, naturalWidth - shrinkAmount);
}

function useSharedShrinkStyle(
  segment: MeasuredWidth,
  shrinkAmount: SharedValue<number>
): AnimatedStyle<ViewStyle> {
  return useAnimatedStyle(() => {
    if (!segment.hasMeasured) {
      return {};
    }
    return {
      width: resolveSharedShrinkWidth(
        segment.naturalWidth.value,
        shrinkAmount.value
      ),
    };
  }, [segment, shrinkAmount]);
}

/**
 * Provides the width-squeeze machinery for a `Toolbar` paired with a `fab`
 * and/or `leading`/`trailing` content: `group` (the whole
 * leading+children+trailing row, for the `fab` case — the FAB itself is
 * never part of the segment, so it's never resized, and springs
 * independently toward `0`) and `leading`/`trailing` (for the no-`fab`
 * case, leaving `children` — the "key action" — untouched and always
 * visible). Unlike `group`, `leading` and `trailing` do *not* each get
 * their own independent spring — they share a single one (see
 * `useSharedShrink`'s own doc for why: independent springs make `children`
 * visibly drift whenever `leading`/`trailing` have different natural
 * sizes). Replaces `useVisibility`'s whole-toolbar offscreen slide
 * whenever any of these are present (see `Toolbar.tsx`'s
 * `hasCollapseTarget`).
 *
 * Both cases are driven by manually-measured shared values rather than a
 * `layout={LinearTransition}`-style approach (tried and ruled out): a
 * Reanimated layout transition only smoothly interpolates the *tagged
 * view's own frame* — it doesn't make that view's *children* continuously
 * re-layout to match the in-flight size, since React/Yoga computes the
 * whole subtree once, using the final post-collapse props, the instant the
 * commit happens. Confirmed live: `leading`/`trailing` unmounting made
 * `children` snap to its final (centered-in-final-width) position
 * immediately, while only the pill's outer shell kept smoothly
 * interpolating — the two visibly desynced, background catching up around
 * already-repositioned content instead of squeezing together. Driving
 * both the pill's width *and* each segment's width from the same kind of
 * manually-computed shared value (as here) keeps everything in sync
 * frame-by-frame, since nothing is left to Yoga's one-shot commit.
 *
 * Mirrors `FAB.Extended`'s own icon-only/icon+label width squeeze — the
 * closest existing precedent for animating a width to fit arbitrary
 * content — using the `default` spring tier symmetrically for both width
 * and opacity, in both directions, since no exact M3 spec value for this
 * specific transition could be confirmed.
 *
 * Reduce-motion: snap to the final values, no animation.
 */
export function useCollapse(
  visible: boolean,
  theme: InternalTheme,
  hasLeading: boolean,
  hasTrailing: boolean
): UseCollapseResult {
  const reduceMotion = useReduceMotion();
  const group = useShrinkSegment(visible, theme);

  // See `groupCollapsed`'s own doc for why this tracks `group.width`
  // directly rather than deriving it from `visible`. `< 1` rather than
  // `=== 0` since a spring settles asymptotically close to, but not
  // always exactly at, its target.
  const [groupCollapsed, setGroupCollapsed] = React.useState(!visible);
  useAnimatedReaction(
    () => group.width.value < 1,
    (isCollapsed, previouslyCollapsed) => {
      if (isCollapsed !== previouslyCollapsed) {
        scheduleOnRN(setGroupCollapsed, isCollapsed);
      }
    },
    [group.width]
  );

  const leadingMeasured = useMeasuredWidth();
  const trailingMeasured = useMeasuredWidth();
  const shrinkAmount = useSharedShrink(
    visible,
    theme,
    hasLeading,
    hasTrailing,
    leadingMeasured,
    trailingMeasured
  );
  const leading: SharedShrinkSegment = {
    style: useSharedShrinkStyle(leadingMeasured, shrinkAmount),
    onLayout: leadingMeasured.onLayout,
  };
  const trailing: SharedShrinkSegment = {
    style: useSharedShrinkStyle(trailingMeasured, shrinkAmount),
    onLayout: trailingMeasured.onLayout,
  };

  const alpha = useSharedValue(visible ? 1 : 0);
  React.useEffect(() => {
    const target = visible ? 1 : 0;
    const spring = toRawSpring(theme.motion.spring.default.effects);
    alpha.value = reduceMotion ? target : withSpring(target, spring);
  }, [visible, theme, reduceMotion, alpha]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: alpha.value }), [alpha]);

  // `PillSurface`, in the no-`fab` case, has no explicit width of its own
  // — it hugs its row's content via plain Yoga flex sizing. That works
  // fine for a *static* row, but `leading`/`trailing` animate their own
  // width directly (each a leaf, driven by Reanimated) — asking an
  // auto-sized ancestor to smoothly track a descendant's animated width
  // via ordinary layout produced a visible jump on Android. Fixed the
  // same way the `fab` branch already avoids this (giving the pill an
  // explicit, Reanimated-driven width instead of hugging): `group`'s own
  // natural (fully expanded) measurement, minus however much of
  // `leading`/`trailing`'s natural width has currently been squeezed
  // away, gives the row's exact current total width with no separate
  // measurement of `children` needed. Only meaningful for the no-`fab`
  // case — `group.style`/`reserveStyle` already cover the `fab` case's
  // own width, computed independently above.
  //
  // "Squeezed away" here is `min(naturalWidth, shrinkAmount)`, not
  // `naturalWidth - width` — equivalent once expanded out
  // (`naturalWidth - max(0, naturalWidth - shrinkAmount)`), but expressed
  // directly in terms of the shared `shrinkAmount` `useSharedShrink` drives
  // both segments from, matching `useSharedShrinkStyle`'s own formula.
  const pillWidthStyle = useAnimatedStyle(() => {
    if (!group.hasMeasured) {
      return {};
    }
    const shrunkLeading = Math.min(
      leadingMeasured.naturalWidth.value,
      shrinkAmount.value
    );
    const shrunkTrailing = Math.min(
      trailingMeasured.naturalWidth.value,
      shrinkAmount.value
    );
    return { width: group.naturalWidth.value - shrunkLeading - shrunkTrailing };
  }, [group, leadingMeasured, trailingMeasured, shrinkAmount]);

  return {
    group,
    leading,
    trailing,
    fadeStyle,
    pillWidthStyle,
    groupCollapsed,
  };
}

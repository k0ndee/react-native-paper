import * as React from 'react';
import { useWindowDimensions, type View, type ViewStyle } from 'react-native';

import {
  measure,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type AnimatedRef,
  type AnimatedStyle,
} from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';

import { useReduceMotion } from '../../theme/accessibility/ReduceMotionContext';
import { toRawSpring } from '../../theme/tokens/sys/motion';
import type { InternalTheme } from '../../types';

type UseVisibilityArgs = {
  visible: boolean;
  theme: InternalTheme;
};

type UseVisibilityResult = {
  /**
   * Attach to whichever rendered node's on-screen position should be
   * measured to compute the hide distance (see `useVisibility`'s doc).
   */
  ref: AnimatedRef<View>;
  style: AnimatedStyle<ViewStyle>;
};

// Small clearance past the measured exit point, so the shadow fully clears
// the edge before it's considered offscreen.
const EXIT_CLEARANCE = 24;
// Fallback used only if hidden before the ref has ever been measured (e.g.
// `visible={false}` from first render) — a generous guess, since there's
// nothing real to measure yet.
const UNMEASURED_FALLBACK_DISTANCE = 1000;

/**
 * Animates a toolbar in and out: an offscreen slide + fade, driven by a
 * plain boolean rather than a continuously-updating scroll value — so the
 * spring always travels a consistent distance in a consistent time,
 * regardless of what triggered the toggle.
 *
 * Position and opacity are two separate springs, per M3's guidance to pair a
 * spatial spring (for the properties that are expected to overshoot, like
 * position) with an effects spring (for properties that shouldn't, like
 * opacity) — the same pairing `FAB`'s own `useVisibility` uses for its
 * scale/alpha, at the same `fast` speed tier. M3's toolbar examples animate
 * this show/hide with the fast tier too, even though its general size-based
 * guidance (small elements get `fast`, partial-screen surfaces get
 * `default`) would suggest otherwise for something toolbar-sized — the
 * quicker pop in/out reads better here than the more deliberate `default`
 * timing.
 *
 * How far "offscreen" is isn't a fixed distance: a `floating` toolbar can be
 * anchored anywhere on screen (flush to an edge, centered along one, etc.),
 * so a fixed guess is either not enough (leaves it partly visible) or way
 * too much (turns the spring into what looks like a stiff slam). Instead,
 * this measures the ref's actual position via Reanimated's `measure()` at
 * the moment it's asked to hide, and computes exactly how far down clears
 * the bottom of the window.
 *
 * Reduce-motion: snap to the final values, no animation.
 */
export function useVisibility({
  visible,
  theme,
}: UseVisibilityArgs): UseVisibilityResult {
  const reduceMotion = useReduceMotion();
  const { height: windowHeight } = useWindowDimensions();
  const ref = useAnimatedRef<View>();
  // Can't measure before mount, so an initial hidden state starts at the
  // fallback distance rather than `0` — otherwise it'd flash visible for a
  // frame before the effect below corrects it.
  const translateY = useSharedValue(visible ? 0 : UNMEASURED_FALLBACK_DISTANCE);
  const alpha = useSharedValue(visible ? 1 : 0);
  // Caches the last real measurement so a hide triggered while a prior
  // toggle hasn't settled yet (see the `translateY.value === 0` check below)
  // can reuse it instead of re-measuring a position that's currently
  // mid-animation (and therefore not the pill's true resting position).
  const lastMeasuredDistance = useSharedValue(UNMEASURED_FALLBACK_DISTANCE);
  // Tracks the previous `visible` so a `windowHeight`-only change (device
  // rotation) doesn't replay the show springs while already shown and
  // settled. The hide branch below still reacts to `windowHeight` on its
  // own, since the offscreen distance genuinely depends on it.
  const wasVisible = React.useRef(visible);
  // Tracks the previous `windowHeight` so a rotation while already hidden
  // can widen the cached offscreen distance by exactly how much the window
  // grew (see the `windowHeightGrew` branch below) instead of leaving it
  // stale.
  const previousWindowHeight = React.useRef(windowHeight);

  React.useEffect(() => {
    const visibilityChanged = wasVisible.current !== visible;
    wasVisible.current = visible;
    const windowHeightGrew = windowHeight > previousWindowHeight.current;
    const windowHeightGrowth = windowHeight - previousWindowHeight.current;
    previousWindowHeight.current = windowHeight;

    const spatialSpring = toRawSpring(theme.motion.spring.fast.spatial);
    const effectsSpring = toRawSpring(theme.motion.spring.fast.effects);

    if (visible) {
      if (!visibilityChanged) {
        return;
      }
      translateY.value = reduceMotion ? 0 : withSpring(0, spatialSpring);
      alpha.value = reduceMotion ? 1 : withSpring(1, effectsSpring);
      return;
    }

    alpha.value = reduceMotion ? 0 : withSpring(0, effectsSpring);
    scheduleOnUI(() => {
      // Only trust a fresh measurement while fully at rest and visible
      // (`translateY` still `0`) — mid-toggle, the node's on-screen
      // position is contaminated by whatever spring is still in flight
      // (e.g. a hide that got interrupted by a quick show, now hiding
      // again), which would corrupt the computed exit distance. Reuse the
      // last valid measurement instead; the resting position hasn't moved,
      // only visibility has.
      if (translateY.value === 0) {
        const measurement = measure(ref);
        if (measurement) {
          lastMeasuredDistance.value =
            windowHeight - measurement.pageY + EXIT_CLEARANCE;
        }
      } else if (windowHeightGrew) {
        // Already hidden (translated away) and the window grew, e.g. a
        // rotation — the node's current on-screen position can't be
        // trusted for a fresh measurement here (same reason as the comment
        // below), so widen the cached distance by the same growth instead.
        // That's always enough to still clear the new, taller window: for
        // anchoring where the resting position doesn't move with
        // `windowHeight` this matches the real distance exactly, and for
        // anchoring where it does, it only overshoots past the edge by a
        // harmless margin rather than risk landing short of it.
        lastMeasuredDistance.value += windowHeightGrowth;
      }
      translateY.value = reduceMotion
        ? lastMeasuredDistance.value
        : withSpring(lastMeasuredDistance.value, spatialSpring);
    });
  }, [
    visible,
    windowHeight,
    theme,
    reduceMotion,
    translateY,
    alpha,
    lastMeasuredDistance,
    ref,
  ]);

  const style = useAnimatedStyle(
    () => ({
      transform: [{ translateY: translateY.value }],
      opacity: alpha.value,
    }),
    [translateY, alpha]
  );

  return { ref, style };
}

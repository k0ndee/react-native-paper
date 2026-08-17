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

  React.useEffect(() => {
    const spatialSpring = toRawSpring(theme.motion.spring.fast.spatial);
    const effectsSpring = toRawSpring(theme.motion.spring.fast.effects);

    if (visible) {
      translateY.value = reduceMotion ? 0 : withSpring(0, spatialSpring);
      alpha.value = reduceMotion ? 1 : withSpring(1, effectsSpring);
      return;
    }

    alpha.value = reduceMotion ? 0 : withSpring(0, effectsSpring);
    scheduleOnUI(() => {
      const measurement = measure(ref);
      const target = measurement
        ? windowHeight - measurement.pageY + EXIT_CLEARANCE
        : UNMEASURED_FALLBACK_DISTANCE;
      translateY.value = reduceMotion
        ? target
        : withSpring(target, spatialSpring);
    });
  }, [visible, windowHeight, theme, reduceMotion, translateY, alpha, ref]);

  const style = useAnimatedStyle(
    () => ({
      transform: [{ translateY: translateY.value }],
      opacity: alpha.value,
    }),
    [translateY, alpha]
  );

  return { ref, style };
}

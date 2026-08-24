import * as React from 'react';

import {
  useAnimatedScrollHandler,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useReduceMotion } from '../theme/accessibility/ReduceMotionContext';
import { useInternalTheme } from '../theme/provider';
import { toRawSpring } from '../theme/tokens/sys/motion';

// A direction flip only commits once motion accumulated *since the last
// direction reversal* passes this distance — not a single event's delta.
// Guards against a single noisy frame (a touch-release micro-jitter, or a
// scroll view's own settle wobble) flipping visibility on its own: a lone
// reversed frame just starts a small accumulation that the very next
// (correctly-directed) frame resets away, whereas a genuine direction
// change keeps accumulating across frames until it crosses this distance.
const SCROLL_DISTANCE_THRESHOLD = 24;

// Once a direction flip commits, a flip back to the opposite direction is
// suppressed unless at least this much time has passed. A touch-release or
// a scroll view's own settle bounce can easily cover `SCROLL_DISTANCE_
// THRESHOLD` worth of pixels in the blink of an eye — distance alone can't
// tell that apart from a deliberate direction change, but a deliberate one
// keeps going well past this window, while a settle bounce doesn't.
const REVERSAL_COOLDOWN_MS = 300;

export type ScrollTargetResolution = {
  target: 0 | 1 | null;
  accumulated: number;
};

/**
 * Given the latest scroll offset, its delta since the last event, and the
 * distance accumulated in the current candidate direction since the last
 * reversal, decides which way `offset` should move — `0` (show), `1`
 * (hide), or `null` if nothing should change yet — along with the updated
 * accumulator to carry into the next call. Pulled out of the scroll handler
 * worklet as a plain function so it's unit-testable directly — Reanimated's
 * jest mock makes `useAnimatedScrollHandler` itself a no-op.
 */
export function resolveScrollTarget(
  y: number,
  delta: number,
  accumulated: number
): ScrollTargetResolution {
  'worklet';
  if (y <= 0) {
    return { target: 0, accumulated: 0 };
  }
  if (delta === 0) {
    return { target: null, accumulated };
  }

  const reversed =
    accumulated !== 0 && Math.sign(accumulated) !== Math.sign(delta);
  const nextAccumulated = reversed ? delta : accumulated + delta;

  if (Math.abs(nextAccumulated) < SCROLL_DISTANCE_THRESHOLD) {
    return { target: null, accumulated: nextAccumulated };
  }

  return { target: nextAccumulated > 0 ? 1 : 0, accumulated: 0 };
}

/**
 * Whether a just-resolved `target` should be suppressed because it reverses
 * the last committed direction too soon after that commit — see
 * `REVERSAL_COOLDOWN_MS`. Pulled out as its own worklet-callable function so
 * it's unit-testable independently of `resolveScrollTarget`'s own distance
 * hysteresis.
 */
export function shouldSuppressReversal(
  target: 0 | 1,
  lastCommittedTarget: 0 | 1,
  msSinceLastCommit: number
): boolean {
  'worklet';
  return (
    target !== lastCommittedTarget && msSinceLastCommit < REVERSAL_COOLDOWN_MS
  );
}

export type ScrollVisibility = {
  /**
   * `0` when fully shown, `1` when fully hidden. Spring-eased on the UI
   * thread (snapped instantly under reduce-motion). Consume this directly
   * for custom scroll-driven animation that isn't a simple show/hide.
   */
  offset: SharedValue<number>;
  /**
   * Derived boolean: `true` once scroll has crossed the hide threshold.
   */
  hidden: boolean;
};

type ScrollVisibilityContextValue = {
  offset: SharedValue<number>;
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
};

const ScrollVisibilityContext =
  React.createContext<ScrollVisibilityContextValue | null>(null);

export type ScrollVisibilityProviderProps = {
  children: React.ReactNode;
};

/**
 * Wrap a screen (or the scrollable area of one) in this to let nested
 * components react to scroll direction — e.g. driving a `Toolbar`'s
 * `visible` prop from this hook's `hidden`. Pass the handler from
 * `useScrollVisibilityHandler` to your `ScrollView`/`FlatList`'s `onScroll`.
 */
export function ScrollVisibilityProvider({
  children,
}: ScrollVisibilityProviderProps) {
  const offset = useSharedValue(0);
  const [hidden, setHidden] = React.useState(false);

  const value = React.useMemo(
    () => ({ offset, hidden, setHidden }),
    [offset, hidden]
  );

  return (
    <ScrollVisibilityContext.Provider value={value}>
      {children}
    </ScrollVisibilityContext.Provider>
  );
}

/**
 * Returns the current scroll visibility, or `null` outside a
 * `ScrollVisibilityProvider`. Opt-in — safe to call unconditionally from a
 * component that only sometimes needs it.
 */
export function useScrollVisibility(): ScrollVisibility | null {
  const context = React.useContext(ScrollVisibilityContext);
  if (!context) {
    return null;
  }
  return { offset: context.offset, hidden: context.hidden };
}

/**
 * Returns the animated scroll handler to pass to `onScroll`. Must be called
 * inside a `ScrollVisibilityProvider` — there's nothing to hook up
 * otherwise. The returned handler is a Reanimated worklet event handler, not
 * a plain function — pass it to `Animated.ScrollView`/`Animated.FlatList`
 * from `react-native-reanimated`, not React Native's own `ScrollView`/
 * `FlatList` (which will throw trying to call it directly).
 */
export function useScrollVisibilityHandler() {
  const context = React.useContext(ScrollVisibilityContext);
  if (!context) {
    throw new Error(
      'useScrollVisibilityHandler must be used within a ScrollVisibilityProvider'
    );
  }
  const { offset, setHidden } = context;

  const theme = useInternalTheme(undefined);
  const reduceMotion = useReduceMotion();
  const lastScrollY = useSharedValue(0);
  // Set on the first-ever scroll event instead of assuming the view mounts
  // at y=0 — a restored/mid-scroll position (tab re-entry, nav back) would
  // otherwise make that first event compute a spurious huge delta against a
  // false baseline of 0.
  const hasBaseline = useSharedValue(false);
  const accumulated = useSharedValue(0);
  const lastCommittedTarget = useSharedValue<0 | 1>(0);
  // `-Infinity` (via a very old timestamp) rather than `0`, so the very
  // first-ever commit is never mistaken for "too soon after" one that never
  // actually happened.
  const lastCommitTime = useSharedValue(-Infinity);
  // Memoized so its identity is stable across re-renders (e.g. the ones
  // `scheduleOnRN(setHidden, ...)` itself triggers on every hide/show) —
  // otherwise the scroll handler's dependency array changes every render,
  // needlessly rebinding the native scroll listener, including mid-gesture.
  const spring = React.useMemo(
    () => toRawSpring(theme.motion.spring.fast.spatial),
    [theme]
  );

  return useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        const y = event.contentOffset.y;
        if (!hasBaseline.value) {
          hasBaseline.value = true;
          lastScrollY.value = y;
          return;
        }
        const delta = y - lastScrollY.value;
        lastScrollY.value = y;

        const { target, accumulated: nextAccumulated } = resolveScrollTarget(
          y,
          delta,
          accumulated.value
        );
        accumulated.value = nextAccumulated;
        // Already committed to this exact direction — nothing changed, so
        // don't re-arm the spring or re-dispatch `setHidden` on every
        // further scroll event in the same direction (up to ~60/s).
        if (target === null || target === lastCommittedTarget.value) {
          return;
        }

        const now = Date.now();
        // The cooldown only guards against a settle-bounce being mistaken
        // for a deliberate reversal — it was never meant to keep the
        // toolbar hidden while sitting at the top. Without this, a quick
        // down-then-up-to-top fling could get its show suppressed for up
        // to `REVERSAL_COOLDOWN_MS`, contradicting `resolveScrollTarget`'s
        // own "always shows at or above the top" guarantee.
        if (
          y > 0 &&
          shouldSuppressReversal(
            target,
            lastCommittedTarget.value,
            now - lastCommitTime.value
          )
        ) {
          return;
        }
        lastCommittedTarget.value = target;
        lastCommitTime.value = now;

        offset.value = reduceMotion ? target : withSpring(target, spring);
        scheduleOnRN(setHidden, target === 1);
      },
    },
    [offset, reduceMotion, spring, setHidden]
  );
}

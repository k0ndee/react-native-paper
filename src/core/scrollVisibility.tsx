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

// Ignore scroll deltas smaller than this (bounce/jitter), so tiny movements
// don't flip the hidden state back and forth.
const SCROLL_DELTA_THRESHOLD = 4;

/**
 * Given the latest scroll offset and its delta since the last event, decides
 * which way `offset` should move: `0` (show), `1` (hide), or `null` if
 * nothing should change (delta too small to act on). Pulled out of the
 * scroll handler worklet as a plain function so it's unit-testable directly —
 * Reanimated's jest mock makes `useAnimatedScrollHandler` itself a no-op.
 */
export function resolveScrollTarget(y: number, delta: number): 0 | 1 | null {
  'worklet';
  if (y <= 0) {
    return 0;
  }
  if (Math.abs(delta) < SCROLL_DELTA_THRESHOLD) {
    return null;
  }
  return delta > 0 ? 1 : 0;
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
        const delta = y - lastScrollY.value;
        lastScrollY.value = y;

        const target = resolveScrollTarget(y, delta);
        if (target === null) {
          return;
        }

        offset.value = reduceMotion ? target : withSpring(target, spring);
        scheduleOnRN(setHidden, target === 1);
      },
    },
    [offset, reduceMotion, spring, setHidden]
  );
}

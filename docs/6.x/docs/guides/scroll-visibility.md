---
title: Scroll visibility
---

Some components — like `Toolbar` — support hiding themselves in response to scroll direction: scrolling down hides them, scrolling back up shows them again. `ScrollVisibilityProvider` is the shared primitive behind this: a small context that tracks scroll direction and exposes it to any component nested underneath, so each one can drive its own show/hide animation off the same signal.

## Wrapping your screen

Wrap the scrollable screen (or just the scrollable part of it) in `ScrollVisibilityProvider`:

```js
import * as React from 'react';
import { ScrollVisibilityProvider } from 'react-native-paper';

export default function MyScreen() {
  return (
    <ScrollVisibilityProvider>
      {/* screen content */}
    </ScrollVisibilityProvider>
  );
}
```

## Tracking scroll

Pass `useScrollVisibilityHandler()`'s return value to your scroll view's `onScroll`. Your scroll view must be Reanimated's own `ScrollView`/`FlatList` (from `react-native-reanimated`), not React Native's — the returned handler is a worklet-based event handler object, not a plain function, and React Native's own `ScrollView`/`FlatList` will throw trying to call it directly.

```js
import * as React from 'react';
import Animated from 'react-native-reanimated';
import { useScrollVisibilityHandler } from 'react-native-paper';

function ScrollingContent() {
  const onScroll = useScrollVisibilityHandler();

  return (
    <Animated.FlatList
      data={items}
      renderItem={renderItem}
      onScroll={onScroll}
      scrollEventThrottle={16}
    />
  );
}
```

## Reading scroll visibility

`useScrollVisibility()` returns `{ offset, hidden }`, or `null` outside a `ScrollVisibilityProvider` — it's safe to call unconditionally from a component that only sometimes needs it.

- `hidden`: a plain boolean, `true` once the user has scrolled past the show/hide threshold. Use this to drive a component's own `visible` prop.
- `offset`: the underlying Reanimated shared value (`0` shown, `1` hidden), spring-eased on the UI thread. Only use this directly if you need a custom, continuous scroll-driven animation instead of a simple show/hide.

```js
import * as React from 'react';
import { useScrollVisibility } from 'react-native-paper';

function MyComponent() {
  const scrollVisibility = useScrollVisibility();

  // scrollVisibility?.hidden
}
```

## Hiding a Toolbar on scroll

`Toolbar` takes a plain `visible` prop — it doesn't read scroll state itself, so you drive it yourself from `hidden`:

```js
import * as React from 'react';
import Animated from 'react-native-reanimated';
import {
  IconButton,
  ScrollVisibilityProvider,
  Toolbar,
  useScrollVisibility,
  useScrollVisibilityHandler,
} from 'react-native-paper';

function Screen() {
  const onScroll = useScrollVisibilityHandler();
  const { hidden } = useScrollVisibility() ?? {};

  return (
    <>
      <Animated.FlatList
        data={items}
        renderItem={renderItem}
        onScroll={onScroll}
        scrollEventThrottle={16}
      />
      <Toolbar visible={!hidden} style={styles.toolbar}>
        <IconButton icon="format-bold" aria-label="Bold" onPress={() => {}} />
      </Toolbar>
    </>
  );
}

export default function App() {
  return (
    <ScrollVisibilityProvider>
      <Screen />
    </ScrollVisibilityProvider>
  );
}
```

:::note
`useScrollVisibilityHandler` throws if called outside a `ScrollVisibilityProvider` — there's nothing to hook up to otherwise. `useScrollVisibility` is safe to call unconditionally; it just returns `null`.
:::

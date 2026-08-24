import * as React from 'react';

import { describe, expect, it, jest } from '@jest/globals';

import { render } from '../../test-utils';
import {
  resolveScrollTarget,
  ScrollVisibilityProvider,
  shouldSuppressReversal,
  useScrollVisibility,
  useScrollVisibilityHandler,
} from '../scrollVisibility';

class ErrorBoundary extends React.Component<
  { onError: (error: Error) => void; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

describe('resolveScrollTarget', () => {
  it('always shows at or above the top, regardless of delta', () => {
    expect(resolveScrollTarget(0, 100, 0)).toEqual({
      target: 0,
      accumulated: 0,
    });
    expect(resolveScrollTarget(-10, 100, 0)).toEqual({
      target: 0,
      accumulated: 0,
    });
  });

  it('hides once accumulated scroll-down distance passes the threshold', () => {
    expect(resolveScrollTarget(100, 30, 0)).toEqual({
      target: 1,
      accumulated: 0,
    });
  });

  it('shows once accumulated scroll-up distance passes the threshold', () => {
    expect(resolveScrollTarget(100, -30, 0)).toEqual({
      target: 0,
      accumulated: 0,
    });
  });

  it('accumulates deltas smaller than the threshold without acting yet', () => {
    expect(resolveScrollTarget(100, 10, 0)).toEqual({
      target: null,
      accumulated: 10,
    });
    expect(resolveScrollTarget(110, 10, 10)).toEqual({
      target: null,
      accumulated: 20,
    });
  });

  it('commits once accumulation across events crosses the threshold', () => {
    const first = resolveScrollTarget(100, 15, 0);
    expect(first).toEqual({ target: null, accumulated: 15 });

    const second = resolveScrollTarget(115, 15, first.accumulated);
    expect(second).toEqual({ target: 1, accumulated: 0 });
  });

  it('a single reversed frame resets the accumulator instead of flipping', () => {
    // Built up a 15px down run, then one small up-tick (jitter) — should
    // NOT show; it should just restart the accumulator in the up direction.
    expect(resolveScrollTarget(115, -5, 15)).toEqual({
      target: null,
      accumulated: -5,
    });
  });

  it('a sustained reversal still shows once it re-crosses the threshold', () => {
    let accumulated = 15;
    let result = resolveScrollTarget(110, -5, accumulated);
    accumulated = result.accumulated;
    expect(result.target).toBe(null);

    result = resolveScrollTarget(90, -20, accumulated);
    expect(result).toEqual({ target: 0, accumulated: 0 });
  });

  it('a zero delta is a no-op', () => {
    expect(resolveScrollTarget(100, 0, 12)).toEqual({
      target: null,
      accumulated: 12,
    });
  });
});

describe('shouldSuppressReversal', () => {
  it('never suppresses a commit in the same direction as the last one', () => {
    expect(shouldSuppressReversal(1, 1, 0)).toBe(false);
    expect(shouldSuppressReversal(0, 0, 0)).toBe(false);
  });

  it('suppresses a reversal that comes right after the last commit', () => {
    expect(shouldSuppressReversal(0, 1, 50)).toBe(true);
  });

  it('allows a reversal once enough time has passed since the last commit', () => {
    expect(shouldSuppressReversal(0, 1, 500)).toBe(false);
  });
});

it('returns null from useScrollVisibility outside a provider', async () => {
  let visibility: ReturnType<typeof useScrollVisibility> | undefined;
  const Capture = () => {
    visibility = useScrollVisibility();
    return null;
  };
  await render(<Capture />);
  expect(visibility).toBeNull();
});

it('throws from useScrollVisibilityHandler outside a provider', async () => {
  const consoleError = jest
    .spyOn(console, 'error')
    .mockImplementation(() => {});
  const onError = jest.fn();
  const Broken = () => {
    useScrollVisibilityHandler();
    return null;
  };

  await render(
    <ErrorBoundary onError={onError}>
      <Broken />
    </ErrorBoundary>
  );

  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({
      message: expect.stringContaining(
        'useScrollVisibilityHandler must be used within a ScrollVisibilityProvider'
      ),
    })
  );
  consoleError.mockRestore();
});

it('starts shown inside a ScrollVisibilityProvider', async () => {
  let visibility: ReturnType<typeof useScrollVisibility> | undefined;
  const Capture = () => {
    visibility = useScrollVisibility();
    return null;
  };
  await render(
    <ScrollVisibilityProvider>
      <Capture />
    </ScrollVisibilityProvider>
  );
  expect(visibility).toEqual({ offset: expect.anything(), hidden: false });
});

it('returns a callable handler from useScrollVisibilityHandler inside a provider', async () => {
  let onScroll: ReturnType<typeof useScrollVisibilityHandler> | undefined;
  const Harness = () => {
    onScroll = useScrollVisibilityHandler();
    return null;
  };
  await render(
    <ScrollVisibilityProvider>
      <Harness />
    </ScrollVisibilityProvider>
  );
  expect(typeof onScroll).toBe('function');
});

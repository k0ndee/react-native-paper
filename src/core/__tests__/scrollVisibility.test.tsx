import * as React from 'react';

import { describe, expect, it, jest } from '@jest/globals';

import { render } from '../../test-utils';
import {
  resolveScrollTarget,
  ScrollVisibilityProvider,
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
    expect(resolveScrollTarget(0, 100)).toBe(0);
    expect(resolveScrollTarget(-10, 100)).toBe(0);
  });

  it('hides on a scroll-down delta past the threshold', () => {
    expect(resolveScrollTarget(100, 50)).toBe(1);
  });

  it('shows on a scroll-up delta past the threshold', () => {
    expect(resolveScrollTarget(100, -50)).toBe(0);
  });

  it('ignores deltas smaller than the threshold', () => {
    expect(resolveScrollTarget(100, 2)).toBe(null);
    expect(resolveScrollTarget(100, -2)).toBe(null);
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

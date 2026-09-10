import { Text } from 'react-native';

import { describe, expect, it } from '@jest/globals';
import type { TestInstance } from 'test-renderer';

import { render, screen } from '../../test-utils';
import type TouchableRippleType from '../TouchableRipple/TouchableRipple';

// The web variant, required with its extension on purpose. A bare specifier
// resolves to `TouchableRipple.native.tsx` under the jest preset, so importing
// it the normal way silently tests the native file and none of this runs.
//
// The preset sets `Platform.OS` to 'ios' and there is no DOM, so this renders the
// web source on the native renderer. It pins props and element order, nothing
// more. Hit testing, stacking order, computed styles and clipping ancestors have
// to be checked in a browser. Pressing here would throw, `handlePressIn` reaches
// for `window`.
const TouchableRipple: typeof TouchableRippleType =
  require('../TouchableRipple/TouchableRipple.tsx').default;

const TOUCHABLE = 'touchable';

// `children` admits raw text nodes since a host element can render one, but
// the touchable's own children never do; this makes that assumption explicit
// to the type checker instead of leaving `children[0]` typed as `TestNode`.
const asElement = (node: TestInstance | string): TestInstance => {
  if (typeof node === 'string') {
    throw new Error('Expected an element, not a text node');
  }
  return node;
};

// The target has no testID of its own (it would be identical, and thus
// ambiguous, on every instance) and no role, so instead of querying for it
// directly, it's addressed by position: it is always the touchable's first
// host child when rendered, and is simply absent (not a hidden sibling)
// otherwise.
const getTarget = () => {
  const children = screen.getByTestId(TOUCHABLE).children;
  return children.length > 1 ? asElement(children[0]) : null;
};

// Throws instead of returning null, so tests that expect a target don't need
// a non-null assertion to use it.
const requireTarget = () => {
  const target = getTarget();
  if (target === null) {
    throw new Error('Expected a touch target to be rendered');
  }
  return target;
};

const styleOf = (node: TestInstance) => {
  // eslint-disable-next-line no-restricted-syntax
  const { style } = node.props;
  return Array.isArray(style) ? Object.assign({}, ...style.flat()) : style;
};

describe('TouchableRipple (web)', () => {
  it('does not render a touch target when there is no hitSlop', async () => {
    // No minimum is enforced here: the primitive does not measure, so with no
    // caller-supplied `hitSlop` there is nothing to expand into and no target
    // to render.
    await render(
      <TouchableRipple onPress={() => {}} testID={TOUCHABLE}>
        <Text>Button</Text>
      </TouchableRipple>
    );

    expect(getTarget()).toBeNull();
  });

  it('renders the touch target before the children so it cannot cover them', async () => {
    // It hit-tests, so as the last sibling it covers anything interactive inside
    // the touchable, e.g. a pressable List.Item with a control in `right`.
    await render(
      <TouchableRipple hitSlop={4} onPress={() => {}} testID={TOUCHABLE}>
        <Text>child-marker</Text>
      </TouchableRipple>
    );

    const [first, second] = screen
      .getByTestId(TOUCHABLE)
      .children.map(asElement);

    // eslint-disable-next-line no-restricted-syntax
    expect(first.props['aria-hidden']).toBe(true);
    // eslint-disable-next-line no-restricted-syntax
    expect(second.props.children).toBe('child-marker');
  });

  it('does not render a touch target when there are no touch handlers', async () => {
    await render(
      <TouchableRipple hitSlop={4} testID={TOUCHABLE}>
        <Text>Not a control</Text>
      </TouchableRipple>
    );

    expect(getTarget()).toBeNull();
  });

  it('does not render a touch target when disabled', async () => {
    await render(
      <TouchableRipple
        disabled
        hitSlop={4}
        onPress={() => {}}
        testID={TOUCHABLE}
      >
        <Text>Button</Text>
      </TouchableRipple>
    );

    expect(getTarget()).toBeNull();
  });

  it('lets a caller-supplied hitSlop size the target', async () => {
    await render(
      <TouchableRipple hitSlop={6} onPress={() => {}} testID={TOUCHABLE}>
        <Text>Button</Text>
      </TouchableRipple>
    );

    expect(styleOf(requireTarget())).toEqual({
      position: 'absolute',
      top: -6,
      bottom: -6,
      left: -6,
      right: -6,
    });
  });

  it('accepts a per-edge hitSlop', async () => {
    await render(
      <TouchableRipple
        hitSlop={{ top: 4, left: 8 }}
        onPress={() => {}}
        testID={TOUCHABLE}
      >
        <Text>Button</Text>
      </TouchableRipple>
    );

    expect(styleOf(requireTarget())).toEqual({
      position: 'absolute',
      top: -4,
      bottom: -0,
      left: -8,
      right: -0,
    });
  });

  it('extends the target past a border, since absolute offsets start inside it', async () => {
    // Offsets on a position: absolute child are relative to the parent's
    // padding edge, inside its border, not its visible outer edge. Without
    // adding the border back in, the target would fall short of `hitSlop`
    // past what's actually visible.
    await render(
      <TouchableRipple
        hitSlop={2}
        style={{ borderWidth: 4 }}
        borderWidth={4}
        onPress={() => {}}
        testID={TOUCHABLE}
      >
        <Text>Button</Text>
      </TouchableRipple>
    );

    expect(styleOf(requireTarget())).toEqual({
      position: 'absolute',
      top: -6,
      bottom: -6,
      left: -6,
      right: -6,
    });
  });

  it('no longer clips the touchable itself, which would clip the target', async () => {
    await render(
      <TouchableRipple borderless onPress={() => {}} testID={TOUCHABLE}>
        <Text>Button</Text>
      </TouchableRipple>
    );

    // eslint-disable-next-line no-restricted-syntax
    const { style: rawStyle } = screen.getByTestId(TOUCHABLE).props;
    const style = Array.isArray(rawStyle)
      ? Object.assign({}, ...rawStyle.flat())
      : rawStyle;

    // check we have the touchable's own style first, or the absence below passes
    // against any empty object
    expect(style).toMatchObject({ position: 'relative' });
    expect(style.overflow).toBeUndefined();
  });
});

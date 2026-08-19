import { View } from 'react-native';

import { describe, expect, it } from '@jest/globals';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { getTheme } from '../../core/theming';
import { render, screen, within } from '../../test-utils';
import Button from '../Button/Button';
import FAB from '../FAB/FAB';
import IconButton from '../IconButton/IconButton';
import type { ColorScheme } from '../Toolbar/tokens';
import Toolbar from '../Toolbar/Toolbar';
import {
  resolveIconColors,
  resolveLabelColor,
} from '../Toolbar/ToolbarColorContext';
import { resolveContainerColor } from '../Toolbar/utils';

type Field =
  | 'container'
  | 'label'
  | 'icon'
  | 'selectedIcon'
  | 'selectedContainer';

const ToolbarChildren = () => (
  <>
    <IconButton icon="format-bold" onPress={() => {}} />
    <IconButton icon="format-italic" onPress={() => {}} />
  </>
);

it('renders Toolbar with default props', async () => {
  const tree = (
    await render(
      <Toolbar>
        <ToolbarChildren />
      </Toolbar>
    )
  ).toJSON();
  expect(tree).toMatchSnapshot();
});

it('renders Toolbar with docked variant', async () => {
  const tree = (
    await render(
      <Toolbar variant="docked">
        <ToolbarChildren />
      </Toolbar>
    )
  ).toJSON();
  expect(tree).toMatchSnapshot();
});

it('extends the docked container into the bottom safe-area inset', async () => {
  const tree = (
    await render(
      <SafeAreaInsetsContext.Provider
        value={{ top: 0, left: 0, right: 0, bottom: 34 }}
      >
        <Toolbar variant="docked">
          <ToolbarChildren />
        </Toolbar>
      </SafeAreaInsetsContext.Provider>
    )
  ).toJSON();
  expect(tree).toMatchSnapshot();
});

it('renders Toolbar with vertical orientation', async () => {
  const tree = (
    await render(
      <Toolbar orientation="vertical">
        <ToolbarChildren />
      </Toolbar>
    )
  ).toJSON();
  expect(tree).toMatchSnapshot();
});

it("applies `style` to the floating pill's outer positioning wrapper", async () => {
  await render(
    <Toolbar testID="floating" style={{ position: 'absolute', top: 5 }}>
      <ToolbarChildren />
    </Toolbar>
  );

  expect(screen.getByTestId('floating-container')).toHaveStyle({
    position: 'absolute',
    top: 5,
  });
});

it("lets `style` override the floating wrapper's default sizing", async () => {
  await render(
    <Toolbar testID="floating" style={{ height: 200 }}>
      <ToolbarChildren />
    </Toolbar>
  );

  expect(screen.getByTestId('floating-container')).toHaveStyle({
    height: 200,
  });
});

it("lets `contentContainerStyle` override the pill's fixed cross-axis thickness for full control", async () => {
  await render(
    <Toolbar testID="floating" contentContainerStyle={{ height: 10 }}>
      <ToolbarChildren />
    </Toolbar>
  );

  expect(screen.getByTestId('floating-content')).toHaveStyle({ height: 10 });
});

it("applies `style` to the docked variant's self-anchoring container", async () => {
  await render(
    <Toolbar testID="docked" variant="docked" style={{ bottom: 10 }}>
      <ToolbarChildren />
    </Toolbar>
  );

  expect(screen.getByTestId('docked-container')).toHaveStyle({ bottom: 10 });
});

it('renders visible by default', async () => {
  await render(
    <Toolbar testID="toolbar">
      <ToolbarChildren />
    </Toolbar>
  );

  expect(screen.getByTestId('toolbar')).toHaveProp('pointerEvents', 'auto');
  expect(screen.getByTestId('toolbar')).toHaveProp('aria-hidden', false);
});

it('marks itself hidden from touches and screen readers when visible={false}', async () => {
  await render(
    <Toolbar testID="toolbar" visible={false}>
      <ToolbarChildren />
    </Toolbar>
  );

  // `aria-hidden` makes RNTL's queries skip it by default — it's exactly
  // what's under test here, so opt back in explicitly.
  const toolbar = screen.getByTestId('toolbar', {
    includeHiddenElements: true,
  });
  expect(toolbar).toHaveProp('pointerEvents', 'none');
  expect(toolbar).toHaveProp('aria-hidden', true);
});

// Unlike `FAB`'s scale+alpha (resolved synchronously by the reanimated
// mock), the hide distance here depends on measuring the toolbar's real
// on-screen position, which happens on the UI thread on a later frame — so
// this snapshot only captures the pre-measurement frame, same as it would
// immediately after a real toggle.
it('renders Toolbar transitioning to not visible', async () => {
  const { rerender, toJSON } = await render(
    <Toolbar>
      <ToolbarChildren />
    </Toolbar>
  );
  await rerender(
    <Toolbar visible={false}>
      <ToolbarChildren />
    </Toolbar>
  );
  expect(toJSON()).toMatchSnapshot();
});

it('renders Toolbar transitioning to visible', async () => {
  const { rerender, toJSON } = await render(
    <Toolbar visible={false}>
      <ToolbarChildren />
    </Toolbar>
  );
  await rerender(
    <Toolbar visible>
      <ToolbarChildren />
    </Toolbar>
  );
  expect(toJSON()).toMatchSnapshot();
});

describe('leading/trailing/fab collapse (floating only)', () => {
  // `useCollapse` only starts constraining a segment's width once a real
  // `onLayout` has measured it — jest's test renderer never fires one, so
  // these snapshots render with no `width` override at all (natural sizing,
  // same as if unwrapped) and the "transitioning to not visible" snapshot
  // below can't actually show a collapse: the animate branch itself is
  // gated on that same first measurement having happened. Same environment
  // gap as the whole-bar hide's own "transitioning" tests above
  // (`measure()`/`scheduleOnUI` don't run meaningfully under the
  // Reanimated jest mock either) — not a component bug, just untestable
  // here; verify the actual animation in a real app. This applies equally
  // to the `fab` and no-`fab` (`leading`/`trailing`-only) cases — both are
  // measurement-driven via `useShrinkSegment`.
  it('renders Toolbar paired with a fab', async () => {
    const tree = (
      await render(
        <Toolbar
          leading={<IconButton icon="format-italic" onPress={() => {}} />}
          trailing={<IconButton icon="format-underline" onPress={() => {}} />}
          fab={<FAB icon="plus" onPress={() => {}} />}
        >
          <IconButton icon="format-bold" onPress={() => {}} />
        </Toolbar>
      )
    ).toJSON();
    expect(tree).toMatchSnapshot();
  });

  it('renders Toolbar with leading/trailing and no fab', async () => {
    const tree = (
      await render(
        <Toolbar
          leading={<IconButton icon="format-italic" onPress={() => {}} />}
          trailing={<IconButton icon="format-underline" onPress={() => {}} />}
        >
          <IconButton icon="format-bold" onPress={() => {}} />
        </Toolbar>
      )
    ).toJSON();
    expect(tree).toMatchSnapshot();
  });

  it('lays out multiple leading/trailing children in a row, not a column', async () => {
    // Both the live wrapper and its offscreen measurement duplicate need
    // `flexDirection: 'row'` explicitly (`styles.row`, alongside
    // `styles.naturalFlow`/`styles.offscreenMeasure` in `Toolbar.tsx`) —
    // without it, RN's default column direction stacks multiple children
    // vertically instead of laying out/measuring them side by side.
    const tree = (
      await render(
        <Toolbar
          leading={
            <>
              <IconButton icon="format-italic" onPress={() => {}} />
              <IconButton icon="format-underline" onPress={() => {}} />
            </>
          }
        >
          <IconButton icon="format-bold" onPress={() => {}} />
        </Toolbar>
      )
    ).toJSON();
    expect(tree).toMatchSnapshot();
  });

  it('hides leading/trailing from queries/touches (but not children) when visible is false, no fab', async () => {
    // `leading`/`trailing` stay mounted the whole time (their width springs
    // to `0` via `useShrinkSegment`, not a conditional unmount) — verified
    // here as `queryByTestId` returning null purely because `aria-hidden`
    // makes RNTL's default queries skip it, not because the node is gone;
    // `includeHiddenElements` confirms it's still there underneath.
    const { rerender } = await render(
      <Toolbar
        visible
        leading={
          <IconButton
            testID="leading"
            icon="format-italic"
            onPress={() => {}}
          />
        }
        trailing={
          <IconButton
            testID="trailing"
            icon="format-underline"
            onPress={() => {}}
          />
        }
      >
        <IconButton testID="key-action" icon="format-bold" onPress={() => {}} />
      </Toolbar>
    );
    expect(screen.getByTestId('leading')).toBeTruthy();
    expect(screen.getByTestId('trailing')).toBeTruthy();
    expect(screen.getByTestId('key-action')).toBeTruthy();

    await rerender(
      <Toolbar
        visible={false}
        leading={
          <IconButton
            testID="leading"
            icon="format-italic"
            onPress={() => {}}
          />
        }
        trailing={
          <IconButton
            testID="trailing"
            icon="format-underline"
            onPress={() => {}}
          />
        }
      >
        <IconButton testID="key-action" icon="format-bold" onPress={() => {}} />
      </Toolbar>
    );
    expect(screen.queryByTestId('leading')).toBeNull();
    expect(screen.queryByTestId('trailing')).toBeNull();
    // Rendered twice (the live wrapper plus its offscreen measurement
    // duplicate — see `Toolbar.tsx`'s own doc on that), hence `getAllBy`.
    expect(
      screen.getAllByTestId('leading', { includeHiddenElements: true }).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByTestId('trailing', { includeHiddenElements: true }).length
    ).toBeGreaterThan(0);
    expect(screen.getByTestId('key-action')).toBeTruthy();
  });

  // Same caveat as the whole-bar hide's own "transitioning to not visible"
  // test above: the collapse target depends on a natural-width measurement
  // that arrives via a later `onLayout`, so this snapshot only captures the
  // pre-measurement frame.
  it('renders a fab-paired Toolbar transitioning to not visible', async () => {
    const { rerender, toJSON } = await render(
      <Toolbar fab={<FAB icon="plus" onPress={() => {}} />}>
        <IconButton icon="format-bold" onPress={() => {}} />
      </Toolbar>
    );
    await rerender(
      <Toolbar visible={false} fab={<FAB icon="plus" onPress={() => {}} />}>
        <IconButton icon="format-bold" onPress={() => {}} />
      </Toolbar>
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('silently ignores leading/trailing/fab on docked', async () => {
    const plain = (
      await render(
        <Toolbar variant="docked" testID="docked">
          <ToolbarChildren />
        </Toolbar>
      )
    ).toJSON();

    const withCollapseProps = (
      await render(
        <Toolbar
          variant="docked"
          testID="docked"
          leading={<IconButton icon="format-underline" onPress={() => {}} />}
          trailing={<IconButton icon="format-underline" onPress={() => {}} />}
          fab={<FAB icon="plus" onPress={() => {}} />}
        >
          <ToolbarChildren />
        </Toolbar>
      )
    ).toJSON();

    // Compared as serialized strings, not `toEqual`: each render's
    // `onPress={() => {}}` closures are distinct function references, which
    // would otherwise fail a deep-equality check despite an identical tree.
    expect(JSON.stringify(withCollapseProps)).toBe(JSON.stringify(plain));
  });

  it("renders a paired fab as a sibling of the toolbar's own pill, not nested inside it", async () => {
    await render(
      <Toolbar
        testID="toolbar"
        fab={<FAB testID="fab" icon="plus" onPress={() => {}} />}
      >
        <IconButton icon="format-bold" onPress={() => {}} />
      </Toolbar>
    );

    const pill = screen.getByTestId('toolbar');
    expect(within(pill).queryByTestId('fab-container')).toBeNull();
    expect(screen.getByTestId('fab-container')).toBeTruthy();
  });
});

it('renders floating Toolbar with vibrant colorScheme', async () => {
  const tree = (
    await render(
      <Toolbar colorScheme="vibrant">
        <ToolbarChildren />
      </Toolbar>
    )
  ).toJSON();
  expect(tree).toMatchSnapshot();
});

it('renders docked Toolbar with vibrant colorScheme', async () => {
  await render(
    <>
      <Toolbar testID="toolbar-vibrant" variant="docked" colorScheme="vibrant">
        <ToolbarChildren />
      </Toolbar>
      <Toolbar testID="toolbar-standard" variant="docked">
        <ToolbarChildren />
      </Toolbar>
    </>
  );

  const theme = getTheme();
  expect(screen.getByTestId('toolbar-vibrant')).toHaveStyle({
    backgroundColor: theme.colors.primaryContainer,
  });
  expect(screen.getByTestId('toolbar-standard')).toHaveStyle({
    backgroundColor: theme.colors.surfaceContainer,
  });
});

it('keeps an explicit iconColor instead of the vibrant default', async () => {
  const tree = (
    await render(
      <Toolbar colorScheme="vibrant">
        <IconButton icon="format-bold" iconColor="red" onPress={() => {}} />
        <IconButton icon="format-italic" onPress={() => {}} />
      </Toolbar>
    )
  ).toJSON();
  expect(tree).toMatchSnapshot();
});

it("defaults a mode-less IconButton child's iconColor to the toolbar's content color", async () => {
  const tree = (
    await render(
      <Toolbar>
        <IconButton icon="format-bold" onPress={() => {}} />
      </Toolbar>
    )
  ).toJSON();
  expect(tree).toMatchSnapshot();
});

it('leaves an IconButton child with an explicit mode uncolored', async () => {
  const tree = (
    await render(
      <Toolbar colorScheme="vibrant">
        <IconButton icon="format-bold" mode="outlined" onPress={() => {}} />
      </Toolbar>
    )
  ).toJSON();
  expect(tree).toMatchSnapshot();
});

it('recolors IconButtons through a Fragment held in a variable, not just direct children', async () => {
  const fragmentChildren = (
    <>
      <IconButton icon="format-bold" onPress={() => {}} />
      <IconButton icon="format-italic" onPress={() => {}} />
    </>
  );
  const tree = (
    await render(<Toolbar colorScheme="vibrant">{fragmentChildren}</Toolbar>)
  ).toJSON();
  expect(tree).toMatchSnapshot();
});

it('recolors an IconButton nested inside a View, not just direct children', async () => {
  await render(
    <Toolbar colorScheme="vibrant">
      <View>
        <IconButton icon="magnify" testID="wrapped" />
      </View>
    </Toolbar>
  );

  const theme = getTheme();
  expect(
    screen.getByText('magnify', { includeHiddenElements: true })
  ).toHaveStyle({
    color: theme.colors.onPrimaryContainer,
  });
});

it('recolors a Button nested inside a View, not just direct children', async () => {
  await render(
    <Toolbar colorScheme="vibrant">
      <View>
        <Button testID="wrapped" onPress={() => {}}>
          Done
        </Button>
      </View>
    </Toolbar>
  );

  const theme = getTheme();
  expect(screen.getByTestId('wrapped-text')).toHaveStyle({
    color: theme.colors.onPrimaryContainer,
  });
});

it('gives a selected IconButton child the selected container color', async () => {
  await render(
    <>
      <Toolbar>
        <IconButton
          testID="standard-selected"
          selected
          icon="format-bold"
          onPress={() => {}}
        />
      </Toolbar>
      <Toolbar colorScheme="vibrant">
        <IconButton
          testID="vibrant-selected"
          selected
          icon="format-bold"
          onPress={() => {}}
        />
      </Toolbar>
    </>
  );

  const theme = getTheme();
  expect(screen.getByTestId('standard-selected-container')).toHaveStyle({
    backgroundColor: theme.colors.secondaryContainer,
  });
  expect(screen.getByTestId('vibrant-selected-container')).toHaveStyle({
    backgroundColor: theme.colors.surfaceContainer,
  });
});

it('gives a disabled, selected IconButton child the disabled treatment instead of its selected color', async () => {
  await render(
    <Toolbar>
      <IconButton
        testID="disabled-selected"
        selected
        disabled
        icon="format-bold"
        onPress={() => {}}
      />
    </Toolbar>
  );

  const theme = getTheme();
  expect(screen.getByTestId('disabled-selected-container')).not.toHaveStyle({
    backgroundColor: theme.colors.secondaryContainer,
  });
});

it("leaves a selected IconButton child's explicit containerColor untouched", async () => {
  await render(
    <Toolbar colorScheme="vibrant">
      <IconButton
        testID="explicit"
        selected
        icon="format-bold"
        containerColor="red"
        onPress={() => {}}
      />
    </Toolbar>
  );

  expect(screen.getByTestId('explicit-container')).toHaveStyle({
    backgroundColor: 'red',
  });
});

it("defaults a mode-less Button child's textColor to the toolbar's content color", async () => {
  await render(
    <>
      <Toolbar>
        <Button testID="standard" onPress={() => {}}>
          Done
        </Button>
      </Toolbar>
      <Toolbar colorScheme="vibrant">
        <Button testID="vibrant" onPress={() => {}}>
          Done
        </Button>
      </Toolbar>
    </>
  );

  const theme = getTheme();
  expect(screen.getByTestId('standard-text')).toHaveStyle({
    color: theme.colors.onSurfaceVariant,
  });
  expect(screen.getByTestId('vibrant-text')).toHaveStyle({
    color: theme.colors.onPrimaryContainer,
  });
});

it('recolors a Button child with an explicit mode="text", same as no mode', async () => {
  await render(
    <Toolbar colorScheme="vibrant">
      <Button testID="text-mode" mode="text" onPress={() => {}}>
        Done
      </Button>
    </Toolbar>
  );

  const theme = getTheme();
  expect(screen.getByTestId('text-mode-text')).toHaveStyle({
    color: theme.colors.onPrimaryContainer,
  });
});

it('leaves a Button child with a more opinionated mode uncolored', async () => {
  const tree = (
    await render(
      <Toolbar colorScheme="vibrant">
        <Button mode="outlined" onPress={() => {}}>
          Done
        </Button>
      </Toolbar>
    )
  ).toJSON();
  expect(tree).toMatchSnapshot();
});

it("leaves a Button child's explicit textColor/buttonColor untouched", async () => {
  await render(
    <Toolbar colorScheme="vibrant">
      <Button testID="explicit-text" textColor="red" onPress={() => {}}>
        Done
      </Button>
      <Button
        testID="explicit-button-color"
        buttonColor="blue"
        onPress={() => {}}
      >
        Done
      </Button>
    </Toolbar>
  );

  expect(screen.getByTestId('explicit-text-text')).toHaveStyle({
    color: 'red',
  });
  expect(screen.getByTestId('explicit-button-color-container')).toHaveStyle({
    backgroundColor: 'blue',
  });
});

// `theme.colors` values are `rgba(r, g, b, 1)` strings convert to hex to
// compare against the design spec's hex values directly.
const toHex = (rgba: unknown) => {
  const [r, g, b] = String(rgba).match(/\d+/g)!.map(Number);
  return (
    '#' +
    [r, g, b]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
};

describe('color resolution across light/dark themes', () => {
  const light = getTheme(false);
  const dark = getTheme(true);

  it.each([
    ['standard', 'light', 'container', '#F3EDF7'],
    ['standard', 'dark', 'container', '#211F26'],
    ['standard', 'light', 'icon', '#49454F'],
    ['standard', 'dark', 'icon', '#CAC4D0'],
    ['standard', 'light', 'label', '#49454F'],
    ['standard', 'dark', 'label', '#CAC4D0'],
    ['standard', 'light', 'selectedContainer', '#E8DEF8'],
    ['standard', 'dark', 'selectedContainer', '#4A4458'],
    ['standard', 'light', 'selectedIcon', '#1D192B'],
    ['standard', 'dark', 'selectedIcon', '#E8DEF8'],
    ['vibrant', 'light', 'container', '#EADDFF'],
    ['vibrant', 'dark', 'container', '#4F378B'],
    ['vibrant', 'light', 'icon', '#21005D'],
    ['vibrant', 'dark', 'icon', '#EADDFF'],
    ['vibrant', 'light', 'label', '#21005D'],
    ['vibrant', 'dark', 'label', '#EADDFF'],
    ['vibrant', 'light', 'selectedContainer', '#F3EDF7'],
    ['vibrant', 'dark', 'selectedContainer', '#211F26'],
    ['vibrant', 'light', 'selectedIcon', '#1D1B20'],
    ['vibrant', 'dark', 'selectedIcon', '#E6E0E9'],
  ] as Array<[ColorScheme, 'light' | 'dark', Field, string]>)(
    'resolves %s %s %s to %s',
    (colorScheme, mode, field, expectedHex) => {
      const theme = mode === 'dark' ? dark : light;
      const resolved =
        field === 'container'
          ? resolveContainerColor({ theme, colorScheme })
          : field === 'label'
            ? resolveLabelColor({ theme, colorScheme })
            : field === 'selectedContainer'
              ? resolveIconColors({ theme, colorScheme, selected: true })
                  .containerColor
              : field === 'selectedIcon'
                ? resolveIconColors({ theme, colorScheme, selected: true })
                    .iconColor
                : resolveIconColors({ theme, colorScheme, selected: false })
                    .iconColor;

      expect(toHex(resolved)).toBe(expectedHex);
    }
  );
});

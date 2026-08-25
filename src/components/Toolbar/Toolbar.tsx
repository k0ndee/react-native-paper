import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

import Reanimated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ToolbarTokens } from './tokens';
import type { ColorScheme, Orientation, Variant } from './tokens';
import { ToolbarColorContext } from './ToolbarColorContext';
import { useVisibility } from './useVisibility';
import { getSpacing, resolveContainerColor, resolveElevation } from './utils';
import { useInternalTheme } from '../../core/theming';
import { resolveCornerRadius } from '../../theme/utils/shape';
import type { ThemeProp } from '../../types';
import Surface from '../Surface';

// `docked`'s background bleeds this far past the true bottom edge (compensated
// so the content itself doesn't shift — see `dockedInsetMargin` below).
// Invisible at rest, since it's below the visible viewport; it only matters
// when the show/hide spring slightly overshoots past its resting position,
// where it reads as more background sliding in rather than a gap opening up
// onto whatever's behind the toolbar.
const DOCKED_BLEED = 24;

export type Props = {
  /**
   * Content of the toolbar, typically a row of `IconButton`s.
   */
  children: React.ReactNode;
  /**
   * `floating` is a self-positioned pill (like a `FAB`); `docked` is a
   * full-width bar anchored to the bottom edge, extending into safe-area
   * insets automatically. Defaults to `floating`.
   */
  variant?: Variant;
  /**
   * Layout axis for `floating` (`docked` is always horizontal, per spec).
   * Defaults to `horizontal`.
   */
  orientation?: Orientation;
  /**
   * Role-color preset. Sets default colors on descendant, mode-less
   * `IconButton`/`Button`s, unless they already set their own. Defaults to
   * `standard`.
   */
  colorScheme?: ColorScheme;
  /**
   * Override the container (background) color.
   */
  containerColor?: ColorValue;
  /**
   * Whether the toolbar is currently visible. Drive this yourself from whatever decides
   * visibility — e.g. `useScrollVisibility()`'s `hidden` (see `ScrollVisibilityProvider`)
   * for a scroll-driven toolbar. Defaults to `true`.
   */
  visible?: boolean;
  /**
   * Style for positioning `floating`'s pill, or overriding `docked`'s
   * default anchoring.
   */
  style?: StyleProp<ViewStyle>;
  /**
   * Style for the row/column wrapping `children`. Overrides the default
   * padding/gap, and, for consumers who need full control, the fixed
   * cross-axis thickness (64dp per spec) as well.
   */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /**
   * TestID used for testing purposes.
   */
  testID?: string;
  /**
   * Accessibility label for the toolbar group. `children` still need
   * their own `aria-label`s.
   */
  'aria-label'?: string;
  /**
   * @optional
   */
  theme?: ThemeProp;
  /**
   * The ref lands on the outer positioning wrapper `View`, not the pill
   * (`Surface`) inside it.
   */
  ref?: React.Ref<View>;
};

/**
 * A toolbar groups icon actions behind a shared surface.
 *
 * It comes in two `variant`s: `floating`, a self-positioned pill anchored wherever you place it
 * (similar to a `FAB`), and `docked`, a full-width bar pinned to the bottom edge that extends
 * into the safe-area insets automatically. A floating toolbar can also be laid out vertically
 * via `orientation`.
 *
 * The `colorScheme` prop controls how contained `IconButton`/`Button` children are colored. By
 * default: `standard` keeps them neutral against a surface-colored container, while `vibrant`
 * gives the toolbar itself a bold, primary-tinted container and switches selected/unselected
 * children to matching vibrant colors, making the toolbar stand out as a focal point on the
 * screen.
 *
 * ## Usage
 * ```js
 * import * as React from 'react';
 * import { StyleSheet, View } from 'react-native';
 * import { Toolbar, IconButton } from 'react-native-paper';
 *
 * const MyComponent = () => (
 *   <View style={styles.anchor} pointerEvents="box-none">
 *     <Toolbar>
 *       <IconButton icon="format-bold" aria-label="Bold" onPress={() => {}} />
 *       <IconButton icon="format-italic" aria-label="Italic" onPress={() => {}} />
 *       <IconButton icon="format-underline" aria-label="Underline" onPress={() => {}} />
 *     </Toolbar>
 *   </View>
 * );
 *
 * const styles = StyleSheet.create({
 *   anchor: {
 *     position: 'absolute',
 *     left: 0,
 *     right: 0,
 *     bottom: 24,
 *     alignItems: 'center',
 *   },
 * });
 *
 * export default MyComponent;
 * ```
 */
const Toolbar = ({
  children,
  variant = 'floating',
  orientation = 'horizontal',
  colorScheme = 'standard',
  containerColor,
  visible = true,
  style,
  contentContainerStyle,
  testID,
  'aria-label': ariaLabel,
  theme: themeOverrides,
  ref,
}: Props) => {
  const theme = useInternalTheme(themeOverrides);
  const insets = useSafeAreaInsets();

  const isDocked = variant === 'docked';
  const isVertical = !isDocked && orientation === 'vertical';

  const backgroundColor = resolveContainerColor({
    theme,
    colorScheme,
    containerColor,
  });
  const borderRadius = resolveCornerRadius(
    theme,
    isDocked
      ? ToolbarTokens.docked.containerShape
      : ToolbarTokens.floating.containerShape
  );
  const elevation = resolveElevation({ isDocked });

  // Cross-axis thickness is always the spec value (64dp); insets are
  // never mixed in, so the icon band never grows/shrinks with the safe
  // area (`docked` extends into insets separately, see
  // `dockedInsetMargin` below).
  const thickness = isDocked
    ? ToolbarTokens.docked.containerHeight
    : ToolbarTokens.floating.containerHeight;
  const { paddingLeading, paddingTrailing, gap } = getSpacing({ variant });

  // `docked`'s content row is a fixed 64dp band (see `thickness` above),
  // so top/bottom padding would clip taller children (e.g. a `Button`
  // label). `floating` has no fixed-height row, so it pads every side.
  const contentPadding = isDocked
    ? { paddingLeft: paddingLeading, paddingRight: paddingTrailing }
    : {
        paddingTop: paddingLeading,
        paddingBottom: paddingLeading,
        paddingLeft: paddingLeading,
        paddingRight: paddingTrailing,
      };
  // `docked`'s background extends into the bottom/left/right insets while
  // its content stays clear of them, via margin outside `Surface`'s own
  // fixed-size box (so `Surface` grows to wrap it, keeping the icon row's
  // 64dp band untouched). `floating` doesn't self-anchor, so it has no
  // insets to account for. `DOCKED_BLEED` is added on top of the real inset
  // so `Surface`'s box (and thus its background) extends exactly as far
  // past the true edge as `dockedContainer`'s own negative `bottom` pushes
  // the whole wrapper — the two cancel out, so the content itself doesn't
  // shift (see `DOCKED_BLEED`'s own doc comment above).
  const dockedInsetMargin = isDocked
    ? {
        marginBottom: insets.bottom + DOCKED_BLEED,
        marginLeft: insets.left,
        marginRight: insets.right,
      }
    : null;

  const { ref: visibilityRef, style: hideStyle } = useVisibility({
    visible,
    theme,
  });

  const content = (
    <View
      role="toolbar"
      aria-label={ariaLabel}
      testID={testID ? `${testID}-content` : undefined}
      style={[
        styles.content,
        isVertical ? styles.column : styles.row,
        { ...contentPadding, gap },
        dockedInsetMargin,
        // Cross-axis thickness is the spec default (see `thickness`
        // above). Deliberately set here rather than on `Surface` (which
        // wraps this `View` with no size of its own, so it just hugs
        // it) — giving `Surface` an explicit width/height that flips
        // between renders is what previously left a stale shadow
        // "ghost" on iOS when `floating`'s `orientation` changed axis;
        // that no longer happens with the fixed dimension living here
        // instead.
        isDocked && { height: thickness },
        !isDocked &&
          (isVertical ? { width: thickness } : { height: thickness }),
        contentContainerStyle,
      ]}
    >
      <ToolbarColorContext.Provider value={{ theme, colorScheme }}>
        {children}
      </ToolbarColorContext.Provider>
    </View>
  );

  const surfaceStyle = [
    {
      backgroundColor,
      borderRadius,
    },
    isDocked && styles.dockedFill,
    styles.content,
  ];

  // Both variants anchor via an outer `Reanimated.View` that carries the
  // consumer's `style` (positioning) and `hideStyle` (the show/hide
  // transform), wrapping a plain `Surface` that only ever holds
  // appearance/content styling — never positioning. That split is what lets
  // the public `ref` (this wrapper) and `visibilityRef` (the inner
  // `Surface`, for `useVisibility`'s `measure()`) each land on their own
  // node instead of needing to share one. `docked` additionally anchors via
  // `styles.dockedContainer`; `floating` has no anchor of its own, relying
  // entirely on the consumer's `style`.
  return (
    <Reanimated.View
      ref={ref}
      // `box-none` so `docked`'s anchoring box (spanning the full width of
      // its ancestor) doesn't intercept touches outside the bar itself.
      // `floating`'s wrapper hugs the pill exactly, so it has no such dead
      // space to worry about.
      pointerEvents={isDocked ? 'box-none' : undefined}
      style={[isDocked && styles.dockedContainer, style, hideStyle]}
      testID={testID ? `${testID}-container` : undefined}
    >
      <Surface
        // The public `ref` lives on the wrapper above instead, freeing this
        // one up for `useVisibility` to measure the toolbar's resting
        // on-screen position (needed to compute how far offscreen is).
        ref={visibilityRef}
        elevation={elevation}
        pointerEvents={visible ? 'auto' : 'none'}
        aria-hidden={!visible}
        style={surfaceStyle}
        testID={testID}
      >
        {content}
      </Surface>
    </Reanimated.View>
  );
};

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  column: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dockedFill: {
    width: '100%',
  },
  // `docked` anchors absolutely rather than reserving layout space, so
  // consumers pad their own content to avoid it, same as `floating`. `bottom`
  // is pushed past the true edge by `DOCKED_BLEED`, compensated by the same
  // amount added to `dockedInsetMargin`'s `marginBottom` — see its doc
  // comment for why.
  dockedContainer: {
    position: 'absolute',
    bottom: -DOCKED_BLEED,
    left: 0,
    right: 0,
  },
});

export default Toolbar;

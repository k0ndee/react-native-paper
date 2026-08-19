import * as React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

import Reanimated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PillSurface from './PillSurface';
import { ToolbarTokens } from './tokens';
import type { ColorScheme, Orientation, Variant } from './tokens';
import { ToolbarColorContext } from './ToolbarColorContext';
import { useCollapse } from './useCollapse';
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
   * Content rendered before `children` in the row. `floating` only —
   * ignored on `docked`. When set (along with `trailing`/`fab`), toggling
   * `visible` off collapses this away instead of sliding the whole toolbar
   * offscreen — see `visible`.
   */
  leading?: React.ReactNode;
  /**
   * Content rendered after `children` (before `fab`, if present) in the
   * row. `floating` only — ignored on `docked`. Same collapse behavior as
   * `leading`.
   */
  trailing?: React.ReactNode;
  /**
   * A `FAB`/`FAB.Extended` element to pair with the toolbar, rendered at
   * the row's trailing end. `floating` only — ignored on `docked` (per M3,
   * `docked` embeds a primary action directly rather than pairing with a
   * separate FAB). When set, toggling `visible` off shrinks
   * `leading`/`children`/`trailing` away from their *leading* edge,
   * revealing the FAB — the FAB is a sibling of the toolbar's own pill,
   * never inside it, so the collapse itself never resizes or recolors it.
   *
   * The space reserved for the pill next to `fab` always stays at the
   * pill's natural (expanded) width, even while collapsed — only the
   * visible content within that space animates. So `fab` never has to
   * move as the pill collapses/expands, and if you center the whole row on
   * screen (as the `visible`/`useScrollVisibility` usage example does),
   * the toolbar sits centered exactly as it would without `fab`, with
   * `fab` fixed just beside it throughout.
   */
  fab?: React.ReactElement;
  /**
   * Whether the toolbar is currently visible. With no `leading`/`trailing`/
   * `fab`, toggling animates an offscreen slide + fade, paired
   * spatial/effects springs like `FAB`'s own `visible` prop (see
   * `useVisibility`). With any of those set, toggling instead squeezes
   * `leading`/`trailing` (and, with `fab`, `children` too) away, per M3's
   * toolbar/FAB-pairing collapse (see `useCollapse`). Drive this yourself
   * from whatever decides visibility — e.g. `useScrollVisibility()`'s
   * `hidden` (see `ScrollVisibilityProvider`) for a scroll-driven toolbar.
   * Defaults to `true`.
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
  leading,
  trailing,
  fab,
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
  const hasFab = !isDocked && !!fab;
  const hasCollapseTarget = !isDocked && (hasFab || !!leading || !!trailing);

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
  // its content stays clear of them, via margin outside the pill's own
  // fixed-size box (so the pill grows to wrap it, keeping the icon row's
  // 64dp band untouched). `floating` doesn't self-anchor, so it has no
  // insets to account for. `DOCKED_BLEED` is added on top of the real inset
  // so the pill's box (and thus its background) extends exactly as far
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

  // Whole-bar offscreen slide and leading/trailing/fab squeeze are mutually
  // exclusive per `hasCollapseTarget`; whichever hook isn't driving this
  // render's transition is kept inert (always `visible`/no-op target) so
  // both can be called unconditionally, per the rules of hooks.
  const { ref: visibilityRef, style: hideStyle } = useVisibility({
    visible: hasCollapseTarget || visible,
    theme,
  });
  const {
    group: groupSegment,
    leading: leadingSegment,
    trailing: trailingSegment,
    fadeStyle,
    pillWidthStyle,
    groupCollapsed,
  } = useCollapse(
    hasCollapseTarget ? visible : true,
    theme,
    leading != null,
    trailing != null
  );

  // Cross-axis thickness is the spec default (see `thickness` above).
  // Deliberately set here rather than on the pill itself (which wraps this
  // `View` with no size of its own, so it just hugs it) — giving the pill
  // an explicit width/height that flips between renders previously left a
  // stale shadow "ghost" on iOS when `floating`'s `orientation` changed
  // axis; that no longer happens with the fixed dimension living here
  // instead.
  const contentRowStyle = [
    styles.content,
    isVertical ? styles.column : styles.row,
    { ...contentPadding, gap },
    dockedInsetMargin,
    isDocked && { height: thickness },
    !isDocked && (isVertical ? { width: thickness } : { height: thickness }),
    contentContainerStyle,
  ];

  const surfaceStyle = [
    {
      backgroundColor,
      borderRadius,
    },
    isDocked && styles.dockedFill,
    styles.content,
  ];

  let pill: React.ReactNode;

  if (hasFab) {
    // Everything but `fab` shrinks away, revealing it in place. `fab` is a
    // row sibling, never nested inside the shrinking pill, so the
    // collapse can't resize/reposition it directly — but a plain flex
    // sibling would still visually drift as its neighbor's width changes,
    // so the space reserved for the pill is kept at a constant width (its
    // natural, expanded size, via `reserveStyle`) at all times; only an
    // inner element, pinned to that reservation's trailing edge, actually
    // animates between that width and `0`. `fab`'s position is therefore
    // never a function of the pill's *current* width, only of its
    // constant, already-known natural width — nothing for it to drift
    // with. `PillSurface` (a Reanimated-native drop-in for `Surface` — see
    // its own doc for why) just fills the animated width wrapper.
    pill = (
      <View ref={ref} style={[styles.fabRow, { gap }, style]}>
        <Reanimated.View style={groupSegment.reserveStyle}>
          <Reanimated.View
            style={[styles.stickToTrailingEdge, groupSegment.style, fadeStyle]}
          >
            <PillSurface
              // Android only, gated on `groupCollapsed` (the pill's
              // *actual* current width, from `useCollapse`) rather than
              // the raw `visible` prop: this pill is the only one that
              // shrinks all the way to `0` width, and its shadow visibly
              // popped/flickered on the very last frame of that collapse
              // — but two earlier attempts each traded one problem for
              // another, confirmed live both times. Animating `elevation`
              // continuously made it worse: Android's native elevation
              // shadow isn't cheap to animate frame by frame like
              // opacity/transform are, so forcing it to recompute every
              // frame introduced jank across the whole collapse instead
              // of just the final frame. Snapping it discretely off the
              // instant `visible` turned false was *also* wrong: `visible`
              // flips at the very start of a collapse, before the width
              // spring has shrunk at all, so the shadow vanished while the
              // pill was still full-size — reading as an abrupt disappear
              // instead of mirroring the (already-correct-looking) expand
              // direction. `groupCollapsed` fixes both: elevation stays on
              // throughout the shrink (matching expand) and only snaps off
              // once the pill has actually reached ~`0` width, at which
              // point it's already visually gone. Not extended to iOS/web:
              // their shadow isn't known to have the original flicker
              // (GPU-composited `CALayer` properties, not Android's
              // `elevation`), so there's no reason to risk a new pop there
              // by also gating it discretely instead of letting it fade
              // with the pill's own opacity as before.
              elevation={
                Platform.OS === 'android' && groupCollapsed ? 0 : elevation
              }
              backgroundColor={backgroundColor}
              shadowColor={theme.colors.shadow}
              pointerEvents={visible ? 'auto' : 'none'}
              aria-hidden={!visible}
              style={[{ borderRadius }, styles.fillWidth]}
              testID={testID}
            >
              <View style={styles.clip}>
                <View
                  role="toolbar"
                  aria-label={ariaLabel}
                  testID={testID ? `${testID}-content` : undefined}
                  style={[...contentRowStyle, styles.naturalFlow]}
                >
                  {leading}
                  {children}
                  {trailing}
                </View>
              </View>
            </PillSurface>
          </Reanimated.View>
        </Reanimated.View>
        {fab}

        {/* Offscreen, unconstrained duplicate purely to measure natural
            width via `onLayout` — the live row above sits inside a chain
            of animated/percentage-width ancestors, which can't be trusted
            to always report its true intrinsic size once squeezed small;
            see `onLayout`'s own doc in `useCollapse.ts`. Same technique
            `FAB.Extended` uses for its own label measurement. */}
        <View
          style={styles.offscreenMeasure}
          onLayout={groupSegment.onLayout}
          pointerEvents="none"
          aria-hidden
          importantForAccessibility="no-hide-descendants"
        >
          <View style={contentRowStyle}>
            {leading}
            {children}
            {trailing}
          </View>
        </View>
      </View>
    );
  } else if (hasCollapseTarget) {
    // No `fab`: `leading`/`trailing` collapse away, leaving `children`
    // (the "key action") untouched, always visible and interactive —
    // unlike the `fab` branch above, `visible` here only ever
    // disables/hides `leading`/`trailing`, never the whole pill. They
    // don't each spring independently, though — see `useSharedShrink`'s
    // own doc in `useCollapse.ts` for why they share a single spring.
    //
    // The pill is given an *explicit*, Reanimated-driven width here
    // (`pillWidthStyle`, on a wrapping `Reanimated.View`, with `PillSurface`
    // itself just filling it via `fillWidth`) rather than letting it hug
    // its row's content via plain Yoga flex sizing — see `pillWidthStyle`'s
    // own doc in `useCollapse.ts` for why (a `layout={LinearTransition}`
    // rewrite was tried and ruled out: it desynced the pill's outer shell
    // from its own content, confirmed live).
    //
    // The offscreen "group" duplicate below (used to measure the row's
    // natural total width, feeding `pillWidthStyle`) is a *sibling* of the
    // `pillWidthStyle`-driven wrapper, not nested inside it — nesting it
    // inside would make the wrapper's own width depend on a measurement
    // taken from inside itself. Mirrors the `fab` branch's own offscreen
    // duplicate placement for the same reason.
    //
    // That sibling placement alone wasn't enough, though — confirmed live:
    // this outermost `Reanimated.View` still *hugs* the shrinking
    // `pillWidthStyle` wrapper (its only in-flow child), so its own
    // resolved size shrinks right along with the collapse — and on this
    // Android/Reanimated combination, an absolutely-positioned child's
    // `onLayout` measurement gets pulled along with a shrinking ancestor
    // instead of staying independent, so `group`'s own "natural" width
    // measurement drifted downward mid-collapse, eventually going negative
    // (clamped to a visually collapsed `0`) — the entire pill vanishing,
    // not just `leading`/`trailing`. `groupSegment.reserveStyle` (a direct,
    // never-springing mirror of `naturalWidth`, already used by the `fab`
    // branch to keep `fabRow` similarly pinned) fixes this by keeping
    // *this* outer view's own width permanently fixed at the row's natural
    // size too, once measured — regardless of `leading`/`trailing`'s
    // current collapse state — so the offscreen duplicate's ancestor
    // chain never shrinks in the first place.
    //
    // `alignItems: 'center'` on this same outer view keeps the shrinking
    // pill horizontally centered *within* that now-fixed reservation
    // (Yoga's default would otherwise left-align it, since an explicitly-
    // sized child doesn't stretch to fill a `stretch`-default cross axis)
    // — combined with the row's own `justifyContent: 'center'`, `children`
    // (the key action) stays exactly where it started on screen as
    // `leading`/`trailing` recede symmetrically, rather than drifting.
    pill = (
      <Reanimated.View
        ref={ref}
        style={[style, groupSegment.reserveStyle, styles.centerContent]}
      >
        <Reanimated.View style={pillWidthStyle}>
          <PillSurface
            elevation={elevation}
            backgroundColor={backgroundColor}
            shadowColor={theme.colors.shadow}
            style={[{ borderRadius }, styles.fillWidth]}
            testID={testID}
          >
            <View style={styles.clip}>
              <View
                role="toolbar"
                aria-label={ariaLabel}
                testID={testID ? `${testID}-content` : undefined}
                style={contentRowStyle}
              >
                {leading != null && (
                  <Reanimated.View
                    pointerEvents={visible ? 'auto' : 'none'}
                    aria-hidden={!visible}
                    style={[
                      styles.shrinkOuter,
                      leadingSegment.style,
                      fadeStyle,
                    ]}
                  >
                    <View style={[styles.row, { gap }, styles.naturalFlow]}>
                      {leading}
                    </View>
                  </Reanimated.View>
                )}
                {children}
                {trailing != null && (
                  <Reanimated.View
                    pointerEvents={visible ? 'auto' : 'none'}
                    aria-hidden={!visible}
                    style={[
                      styles.shrinkOuter,
                      trailingSegment.style,
                      fadeStyle,
                    ]}
                  >
                    <View style={[styles.row, { gap }, styles.naturalFlow]}>
                      {trailing}
                    </View>
                  </Reanimated.View>
                )}
                {/* Offscreen, unconstrained duplicates purely to measure
                    natural width — see the `fab` branch's own copy of this
                    comment for why the live wrappers above can't be
                    measured directly. `styles.row` matters here too, not
                    just visually: measuring more than one child (e.g. two
                    `IconButton`s) without it would stack them in RN's
                    default column direction, measuring a too-narrow width.
                    The same `gap` as the live wrapper above matters too —
                    the offscreen "group" duplicate below measures
                    `leading`'s children as flat siblings of `children`/
                    `trailing` within one `gap`-ped row (Fragment doesn't
                    create a grouping boundary for Yoga's `gap`), so without
                    matching it here, this measurement (and thus
                    `pillWidthStyle`) would count gaps the live layout
                    doesn't actually have, oversizing the pill relative to
                    its real content. */}
                {leading != null && (
                  <View
                    style={[styles.row, { gap }, styles.offscreenMeasure]}
                    onLayout={leadingSegment.onLayout}
                    pointerEvents="none"
                    aria-hidden
                    importantForAccessibility="no-hide-descendants"
                  >
                    {leading}
                  </View>
                )}
                {trailing != null && (
                  <View
                    style={[styles.row, { gap }, styles.offscreenMeasure]}
                    onLayout={trailingSegment.onLayout}
                    pointerEvents="none"
                    aria-hidden
                    importantForAccessibility="no-hide-descendants"
                  >
                    {trailing}
                  </View>
                )}
              </View>
            </View>
          </PillSurface>
        </Reanimated.View>

        {/* Offscreen duplicate of the *whole* row, purely to measure its
            natural (fully expanded) total width — see this branch's own
            top comment for why this must stay a sibling of the
            `pillWidthStyle` wrapper above, not nested inside it. */}
        <View
          style={styles.offscreenMeasure}
          onLayout={groupSegment.onLayout}
          pointerEvents="none"
          aria-hidden
          importantForAccessibility="no-hide-descendants"
        >
          <View style={contentRowStyle}>
            {leading}
            {children}
            {trailing}
          </View>
        </View>
      </Reanimated.View>
    );
  } else {
    // No `leading`/`trailing`/`fab`: a plain `Surface` (not `PillSurface` —
    // nothing here needs Reanimated's `layout`/animated background support,
    // only `PillSurface`'s collapsing siblings above do) holding only
    // appearance/content styling, never positioning — see the wrapper
    // below for why that split matters.
    pill = (
      <Surface
        ref={visibilityRef}
        elevation={elevation}
        pointerEvents={visible ? 'auto' : 'none'}
        aria-hidden={!visible}
        style={surfaceStyle}
        testID={testID}
      >
        <View
          role="toolbar"
          aria-label={ariaLabel}
          testID={testID ? `${testID}-content` : undefined}
          style={contentRowStyle}
        >
          {children}
        </View>
      </Surface>
    );
  }

  pill = (
    <ToolbarColorContext.Provider value={{ theme, colorScheme }}>
      {pill}
    </ToolbarColorContext.Provider>
  );

  // `hasFab`/`hasCollapseTarget` are `floating`-only and drive their own
  // transition via `useCollapse` instead of `useVisibility` (kept
  // permanently "shown" for them, see the hook call above) — each already
  // carries its own `ref`+`style` on its own outer node above, so there's
  // nothing left to wrap here.
  if (hasFab || hasCollapseTarget) {
    return pill;
  }

  // Both `docked` and a plain (no `leading`/`trailing`/`fab`) `floating`
  // anchor via an outer `Reanimated.View` that carries the consumer's
  // `style` (positioning) and `hideStyle` (the show/hide transform),
  // wrapping the plain `Surface` above, which only ever holds
  // appearance/content styling — never positioning. That split is what lets
  // the public `ref` (this wrapper) and `visibilityRef` (the `Surface`
  // above, for `useVisibility`'s `measure()`) each land on their own node
  // instead of needing to share one. `docked` additionally anchors via
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
      {pill}
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
  // `fab`-paired layout: the squeezing pill and the (untouched) `fab`
  // sit side by side as plain flex siblings.
  fabRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Pins the squeezing pill to the trailing edge of its fixed-width
  // reservation box, so it recedes from its *leading* edge as it
  // collapses — staying flush with `fab`, right up until nothing's left.
  stickToTrailingEdge: {
    alignSelf: 'flex-end',
  },
  fillWidth: {
    width: '100%',
  },
  // Keeps a shrinking, explicitly-sized child horizontally centered within
  // a fixed-width reservation, rather than left-aligning (Yoga's default
  // cross-axis behavior for a child that doesn't stretch to fill).
  centerContent: {
    alignItems: 'center',
  },
  // Plain (non-animated) clip boundary, kept off `PillSurface` itself so
  // its shadow doesn't get cut along with the content (`PillSurface` warns
  // about this if `overflow: hidden` is set directly on it).
  clip: {
    width: '100%',
    overflow: 'hidden',
  },
  // Never let the actual (live, visible) content resize to fit its
  // animated, narrower ancestor — keeping it at natural size is what makes
  // the ancestor's `overflow: hidden` actually clip it (rather than
  // reflowing/squishing it) during a collapse. Both matter: `flexShrink: 0`
  // stops the *main*-axis (only relevant for the `fab` case's row) from
  // shrinking to fit; `alignSelf: 'flex-end'` stops the default cross-axis
  // `stretch` from resizing this to its (column) ancestor's width, and
  // pins it to the *trailing* edge — so as the ancestor narrows, content
  // recedes from its *leading* edge first, staying flush at the trailing
  // edge (where `fab`, if any, sits) until nothing's left.
  naturalFlow: {
    flexShrink: 0,
    alignSelf: 'flex-end',
  },
  // Individual `leading`/`trailing` collapse wrapper (no `fab`); its own
  // explicit animated width is the box size directly, no `PillSurface`
  // indirection needed since it has no background/shadow of its own.
  shrinkOuter: {
    overflow: 'hidden',
  },
  // Offscreen, unconstrained duplicate of a segment's content, purely to
  // measure its true natural width via `onLayout` — see the render sites
  // using this for why the live, animated-ancestor-nested copy can't be
  // trusted to report it reliably once squeezed small. Mirrors `FAB.
  // Extended`'s own `offscreenLabelRef` measurement pattern.
  offscreenMeasure: {
    position: 'absolute',
    alignSelf: 'flex-start',
    opacity: 0,
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

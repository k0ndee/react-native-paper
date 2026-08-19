import * as React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { ColorValue, StyleProp, ViewProps, ViewStyle } from 'react-native';

import Reanimated from 'react-native-reanimated';

import {
  androidElevationLevels,
  shadow,
  shadowLayers,
} from '../../theme/tokens/sys/elevation';
import type { Elevation } from '../../theme/types';
import { splitStyles } from '../../utils/splitStyles';

// Mirrors `Surface.tsx`'s own `outerLayerStyleProperties` — style
// properties that must live on the shadow-casting outer layer on iOS
// rather than the inner content layer (see the iOS branch below for why).
const outerLayerStyleProperties: (keyof ViewStyle)[] = [
  'position',
  'alignSelf',
  'top',
  'right',
  'bottom',
  'left',
  'start',
  'end',
  'flex',
  'flexShrink',
  'flexGrow',
  'width',
  'height',
  'transform',
  'opacity',
];

// Mirrors `Surface.tsx`'s own (unexported) `getStyleForShadowLayer`,
// simplified to only the plain-number-elevation case — `Toolbar` never
// passes an `Animated.Value` elevation, unlike `Surface`'s general API.
function shadowLayerStyle(
  elevation: Elevation,
  layer: 0 | 1,
  shadowColor: ColorValue
): ViewStyle {
  return {
    shadowColor,
    shadowOpacity: elevation ? shadowLayers[layer].shadowOpacity : 0,
    shadowOffset: { width: 0, height: shadowLayers[layer].height[elevation] },
    shadowRadius: shadowLayers[layer].shadowRadius[elevation],
  };
}

export type PillSurfaceProps = Omit<ViewProps, 'style'> & {
  children: React.ReactNode;
  elevation: Elevation;
  backgroundColor?: ColorValue;
  shadowColor: ColorValue;
  style?: StyleProp<ViewStyle>;
  /**
   * Reanimated's layout-transition prop, forwarded to whichever layer
   * actually needs to visually track a size change — the outer,
   * shadow-casting layer on iOS (an inner-only `layout` would leave the
   * outer layer hugging it un-animated, snapping instead of tracking —
   * the exact class of bug this component exists to avoid), or the single
   * layer on Android/web.
   */
  layout?: React.ComponentProps<typeof Reanimated.View>['layout'];
  testID?: string;
  ref?: React.Ref<View>;
};

/**
 * A Reanimated-native drop-in for `Surface`, used only by `Toolbar`'s
 * collapsing branches. `Surface` is built on React Native's own `Animated`,
 * not Reanimated, so it can't accept Reanimated's `layout`/`entering`/
 * `exiting` props — this replicates its background/elevation/shadow
 * rendering directly on `Reanimated.View` instead, so a collapsing pill can
 * actually participate in a Reanimated layout transition.
 *
 * Only handles the plain-number-`elevation` case (`Surface`'s own
 * `Animated.Value` support isn't needed here — `Toolbar` never animates
 * elevation itself).
 */
const PillSurface = ({
  elevation,
  backgroundColor,
  shadowColor,
  style,
  layout,
  testID = 'pill-surface',
  children,
  ref,
  ...props
}: PillSurfaceProps) => {
  if (Platform.OS === 'android') {
    return (
      <Reanimated.View
        {...props}
        ref={ref}
        layout={layout}
        testID={testID}
        style={[
          { backgroundColor, elevation: androidElevationLevels[elevation] },
          style,
        ]}
      >
        {children}
      </Reanimated.View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <Reanimated.View
        {...props}
        ref={ref}
        layout={layout}
        testID={testID}
        style={[{ backgroundColor }, shadow(elevation, shadowColor), style]}
      >
        {children}
      </Reanimated.View>
    );
  }

  // iOS: two shadow layers split across an outer/inner view pair, mirroring
  // `Surface`'s own `SurfaceIOS` exactly — "outer layer" style properties
  // (position/size/transform/opacity/margin) go on the shadow-casting outer
  // view; everything else (background, padding, etc.) goes on the inner
  // content view, which is also where a consumer's own clipping
  // (`overflow: hidden`) should live, same as `Surface` — putting it on the
  // outer view here would clip the shadow itself.
  const flattenedStyle = (StyleSheet.flatten(style) || {}) as ViewStyle;
  const [innerStyle, outerLayerStyle, borderRadiusStyle] = splitStyles(
    flattenedStyle,
    (key) =>
      outerLayerStyleProperties.includes(key) || key.startsWith('margin'),
    (key) => key.startsWith('border') && key.endsWith('Radius')
  );

  if (
    process.env.NODE_ENV !== 'production' &&
    innerStyle.overflow === 'hidden' &&
    elevation !== 0
  ) {
    console.warn(
      'When setting overflow to hidden on PillSurface the shadow will not be displayed correctly. Wrap the content of your component in a separate View with the overflow style.'
    );
  }

  return (
    <Reanimated.View
      ref={ref}
      layout={layout}
      testID={`${testID}-outer-layer`}
      style={[
        shadowLayerStyle(elevation, 0, shadowColor),
        outerLayerStyle,
        borderRadiusStyle,
        { backgroundColor },
      ]}
    >
      <Reanimated.View
        {...props}
        testID={testID}
        style={[
          shadowLayerStyle(elevation, 1, shadowColor),
          innerStyle,
          borderRadiusStyle,
          { backgroundColor },
        ]}
      >
        {children}
      </Reanimated.View>
    </Reanimated.View>
  );
};

export default PillSurface;

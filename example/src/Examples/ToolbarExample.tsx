import * as React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  Button,
  Chip,
  Divider,
  FAB,
  IconButton,
  List,
  ScrollVisibilityProvider,
  Switch,
  Text,
  Toolbar,
  useScrollVisibility,
  useScrollVisibilityHandler,
  useTheme,
} from 'react-native-paper';
import type {
  ToolbarColorScheme,
  ToolbarOrientation,
  ToolbarVariant,
} from 'react-native-paper';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const variants: ToolbarVariant[] = ['floating', 'docked'];
const orientations: ToolbarOrientation[] = ['horizontal', 'vertical'];
const colorSchemes: ToolbarColorScheme[] = ['standard', 'vibrant'];

// Demonstrates the two collapse-on-scroll shapes `floating` supports beyond
// the plain whole-bar hide: squeezing away `leading`/`trailing` to leave the
// key action, or pairing a `fab` and squeezing everything else away to
// reveal it. `docked` ignores `leading`/`trailing`/`fab` entirely, per spec.
type CollapseDemo = 'None' | 'Leading/trailing' | 'Paired FAB';
const collapseDemos: CollapseDemo[] = [
  'None',
  'Leading/trailing',
  'Paired FAB',
];

const toolbarItems = [
  { icon: 'format-bold', label: 'Bold' },
  { icon: 'format-italic', label: 'Italic' },
  { icon: 'format-underline', label: 'Underline' },
] as const;

// Dummy list content, purely to give the screen something to scroll behind
// the toolbar.
const rows = Array.from({ length: 40 }, (_, i) => ({
  id: String(i + 1),
  text: `Item ${i + 1}`,
}));

type ChipRowProps<T extends string> = {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  // Controls that don't apply to the current variant stay visible but
  // greyed out and non-interactive, per MD3's disabled-state guidance—
  // hiding them outright would shift the layout and lose the user's place.
  disabled?: boolean;
};

const ChipRow = <T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: ChipRowProps<T>) => (
  <View style={[styles.chipRow, disabled && styles.disabled]}>
    <Text variant="labelLarge" style={styles.chipRowLabel}>
      {label}
    </Text>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRowContent}
    >
      {options.map((option) => (
        <Chip
          key={option}
          selected={option === value}
          showSelectedOverlay
          disabled={disabled}
          onPress={() => onChange(option)}
        >
          {option}
        </Chip>
      ))}
    </ScrollView>
  </View>
);

const ToolbarExampleContent = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const onScroll = useScrollVisibilityHandler();
  const scrollVisibility = useScrollVisibility();

  const [variant, setVariant] = React.useState<ToolbarVariant>('floating');
  const [orientation, setOrientation] =
    React.useState<ToolbarOrientation>('horizontal');
  const [colorScheme, setColorScheme] =
    React.useState<ToolbarColorScheme>('standard');
  const [hideOnScroll, setHideOnScroll] = React.useState(false);
  const [collapseDemo, setCollapseDemo] = React.useState<CollapseDemo>('None');

  // The toggle only opts the toolbar into reacting to scroll — `Toolbar`
  // itself just takes a plain `visible` prop, same as `FAB`.
  const toolbarVisible = !hideOnScroll || !scrollVisibility?.hidden;
  const isFloating = variant === 'floating';
  const isVertical = isFloating && orientation === 'vertical';
  const isLeadingTrailingDemo = collapseDemo === 'Leading/trailing';
  const isFabDemo = collapseDemo === 'Paired FAB';

  // The width-squeeze collapse only targets a horizontal axis (see
  // `Toolbar`'s own `fab`/`leading`/`trailing` docs) — force `orientation`
  // back to `horizontal` whenever a collapse demo is selected.
  const handleCollapseDemoChange = (value: CollapseDemo) => {
    setCollapseDemo(value);
    if (value !== 'None') {
      setOrientation('horizontal');
    }
  };

  const renderItem = React.useCallback(
    ({ item }: { item: (typeof rows)[number] }) => (
      <View style={styles.listItem}>
        <Text variant="bodyLarge">{item.text}</Text>
      </View>
    ),
    []
  );

  const toolbarChildren = (
    <>
      {toolbarItems.map(({ icon, label }) => (
        <IconButton
          key={label}
          icon={icon}
          aria-label={label}
          onPress={() => {}}
        />
      ))}
    </>
  );

  // `Leading/trailing`: `children` is always just the key action (bold) —
  // `leading`/`trailing` (deliberately different sizes: two icons vs one,
  // to exercise the key-action-drift fix) are what actually fade/squeeze
  // away on collapse, leaving only the key action visible.
  // `Paired FAB`: the whole `toolbarChildren` row squeezes away, revealing
  // the paired FAB in place. `None`: today's plain row, unchanged.
  const toolbarKeyAction = (
    <Button
      aria-label="Bold"
      mode="contained"
      onPress={() => {}}
      labelStyle={styles.keyActionLabel}
    >
      +
    </Button>
  );
  const toolbarLeading = isLeadingTrailingDemo ? (
    <>
      <IconButton icon="arrow-left" aria-label="left" onPress={() => {}} />
      <IconButton icon="arrow-right" aria-label="right" onPress={() => {}} />
    </>
  ) : undefined;
  const toolbarTrailing = isLeadingTrailingDemo ? (
    <IconButton
      icon="picture-in-picture-top-right"
      aria-label="pip"
      onPress={() => {}}
    />
  ) : undefined;
  const toolbarFab = isFabDemo ? (
    <FAB icon="plus" aria-label="Add" onPress={() => {}} />
  ) : undefined;

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.controls}>
        <ChipRow
          label="Variant"
          options={variants}
          value={variant}
          onChange={setVariant}
        />
        <ChipRow
          label="Orientation"
          options={orientations}
          value={orientation}
          onChange={setOrientation}
          disabled={!isFloating || collapseDemo !== 'None'}
        />
        <ChipRow
          label="Color scheme"
          options={colorSchemes}
          value={colorScheme}
          onChange={setColorScheme}
        />
        <ChipRow
          label="Collapse on scroll"
          options={collapseDemos}
          value={collapseDemo}
          onChange={handleCollapseDemoChange}
          disabled={!isFloating}
        />
        <List.Item
          title="Hide on scroll"
          right={() => (
            <View pointerEvents="none">
              <Switch value={hideOnScroll} />
            </View>
          )}
          onPress={() => setHideOnScroll((value) => !value)}
        />
        <Divider
          bold
          style={[styles.divider, { backgroundColor: theme.colors.outline }]}
        />
      </View>
      <Animated.FlatList
        style={styles.list}
        data={rows}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          !isFloating
            ? { paddingBottom: insets.bottom + 64 }
            : isVertical
              ? { paddingBottom: insets.bottom + 24 }
              : { paddingBottom: insets.bottom + 96 },
        ]}
        onScroll={onScroll}
        scrollEventThrottle={16}
      />
      {isFloating ? (
        // `floating` doesn't anchor itself (same as `FAB`)—position it with
        // a wrapping `View`, same as the component's own doc example. Kept
        // centered regardless of `collapseDemo`, `fab` included — the FAB
        // just sits to the side of the (still-centered) toolbar, same
        // overall placement as every other demo.
        <View
          pointerEvents="box-none"
          style={
            isVertical
              ? [styles.verticalAnchor, { right: insets.right + 16 }]
              : [styles.horizontalAnchor, { bottom: insets.bottom + 24 }]
          }
        >
          <Toolbar
            variant={variant}
            colorScheme={colorScheme}
            orientation={orientation}
            visible={toolbarVisible}
            leading={toolbarLeading}
            trailing={toolbarTrailing}
            fab={toolbarFab}
          >
            {isLeadingTrailingDemo ? toolbarKeyAction : toolbarChildren}
          </Toolbar>
        </View>
      ) : (
        // `docked` anchors itself, flush to the bottom edge, on its own.
        // `leading`/`trailing`/`fab` are passed through here too, purely to
        // demonstrate that `docked` silently ignores them (per M3, `docked`
        // embeds its primary action directly rather than pairing a FAB).
        <Toolbar
          variant={variant}
          colorScheme={colorScheme}
          orientation={orientation}
          visible={toolbarVisible}
          leading={toolbarLeading}
          trailing={toolbarTrailing}
          fab={toolbarFab}
        >
          {isLeadingTrailingDemo ? toolbarKeyAction : toolbarChildren}
        </Toolbar>
      )}
    </View>
  );
};

const ToolbarExample = () => (
  <ScrollVisibilityProvider>
    <ToolbarExampleContent />
  </ScrollVisibilityProvider>
);

ToolbarExample.title = 'Toolbar';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  horizontalAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  verticalAnchor: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  controls: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  divider: {
    marginTop: 8,
  },
  chipRow: {
    paddingVertical: 4,
  },
  chipRowLabel: {
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  chipRowContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  disabled: {
    opacity: 0.38,
  },
  keyActionLabel: {
    fontSize: 20,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  listItem: {
    paddingVertical: 12,
  },
});

export default ToolbarExample;

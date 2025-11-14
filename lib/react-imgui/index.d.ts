import type { ReactElement, ReactNode } from 'react';

export type ImColor =
  | string
  | {
      r: number;
      g: number;
      b: number;
      a?: number;
    };

export interface ImguiStyle {
  color?: ImColor;
  backgroundColor?: ImColor;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  padding?: number | { x?: number; y?: number } | [number, number];
  paddingHorizontal?: number;
  paddingVertical?: number;
  borderRadius?: number;
  font?: string | number;
  fontScale?: number;
}

export type StyleProp<T> = T | T[] | null | undefined;

export type PlatformOS =
  | 'ios'
  | 'android'
  | 'macos'
  | 'windows'
  | 'linux'
  | 'web'
  | 'unknown';

export interface PlatformConstants {
  os: PlatformOS;
  isTesting?: boolean;
  [key: string]: unknown;
}

export type PlatformSelectSpec<T> = {
  ios?: T;
  android?: T;
  macos?: T;
  windows?: T;
  linux?: T;
  web?: T;
  default?: T;
  [key: string]: T | undefined;
};

export interface PlatformModule {
  readonly OS: PlatformOS;
  readonly Version: number | string | undefined;
  readonly isTV: boolean;
  readonly isTesting: boolean;
  readonly constants: PlatformConstants;
  readonly isNative: boolean;
  readonly isWeb: boolean;
  readonly isDesktop: boolean;
  readonly isMobile: boolean;
  readonly ios: boolean;
  readonly android: boolean;
  readonly macos: boolean;
  readonly windows: boolean;
  readonly linux: boolean;
  select<T>(spec: PlatformSelectSpec<T>): T | undefined;
}

export interface DimensionMetrics {
  width: number;
  height: number;
  scale: number;
  fontScale: number;
}

export interface DimensionsChangeEvent {
  window: DimensionMetrics;
  screen: DimensionMetrics;
}

export type DimensionsListener = (event: DimensionsChangeEvent) => void;

export interface DimensionsModule {
  get(dim: 'window' | 'screen'): DimensionMetrics;
  addEventListener(type: 'change', handler: DimensionsListener): { remove(): void };
  removeEventListener(type: 'change', handler: DimensionsListener): void;
}

export type ColorScheme = 'light' | 'dark' | 'unknown';

export interface AppearanceChangeEvent {
  colorScheme: ColorScheme;
}

export type AppearanceListener = (event: AppearanceChangeEvent) => void;

export interface AppearanceModule {
  getColorScheme(): ColorScheme;
  addChangeListener(listener: AppearanceListener): { remove(): void };
  removeChangeListener(listener: AppearanceListener): void;
}

export interface FontGlyphOffset {
  x?: number;
  y?: number;
}

export interface FontOversample {
  x?: number;
  y?: number;
}

export type FontRangeDescriptor =
  | number
  | [number, number]
  | { start: number; end: number };

export type FontSource = 'default' | 'imgui-default' | 'memory' | 'file' | 'system-emoji' | string;

export interface FontDescriptor {
  name: string;
  size?: number;
  merge?: boolean;
  pixelSnap?: boolean;
  rasterizerMultiply?: number;
  glyphOffset?: FontGlyphOffset;
  oversample?: FontOversample;
  glyphPresets?: string[];
  glyphRanges?: FontRangeDescriptor[] | FontRangeDescriptor;
  source?: FontSource;
  path?: string;
  data?: ArrayBuffer | ArrayBufferView | string;
}

export interface ConfigureFontsOptions {
  defaultFont?: string;
  globalScale?: number;
}

export interface FontConfigurationSummary {
  fonts: Record<string, number | string>;
  defaultFont?: number | string;
  atlasWidth?: number;
  atlasHeight?: number;
  globalScale?: number;
}

export interface RootProps {
  children?: ReactNode;
}

export interface WindowProps {
  title?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  defaultX?: number;
  defaultY?: number;
  defaultWidth?: number;
  defaultHeight?: number;
  flags?: number;
  menuBar?: boolean;
  noTitleBar?: boolean;
  noResize?: boolean;
  noMove?: boolean;
  noScrollbar?: boolean;
  noScrollWithMouse?: boolean;
  noCollapse?: boolean;
  alwaysAutoResize?: boolean;
  noBackground?: boolean;
  noSavedSettings?: boolean;
  noMouseInputs?: boolean;
  horizontalScrollbar?: boolean;
  noFocusOnAppearing?: boolean;
  noBringToFrontOnFocus?: boolean;
  alwaysVerticalScrollbar?: boolean;
  alwaysHorizontalScrollbar?: boolean;
  alwaysUseWindowPadding?: boolean;
  noNavInputs?: boolean;
  noNavFocus?: boolean;
  unsavedDocument?: boolean;
  dockId?: number;
  dockCond?: number;
  backgroundAlpha?: number;
  rounding?: number;
  taskbarVisible?: boolean;
  closeButton?: boolean;
  fontScale?: number;
  onWindowState?: (x: number, y: number, width: number, height: number) => void;
  onClose?: () => void;
  children?: ReactNode;
}

export interface DemoWindowProps {
  open?: boolean;
  defaultOpen?: boolean;
  onChange?: (open: boolean) => void;
  onClose?: () => void;
  children?: ReactNode;
}

export interface MainMenuBarProps {
  children?: ReactNode;
}

export interface MenuBarProps {
  children?: ReactNode;
}

export interface MenuProps {
  label?: string;
  enabled?: boolean;
  children?: ReactNode;
}

export interface MenuItemProps {
  label?: string;
  shortcut?: string;
  enabled?: boolean;
  selected?: boolean;
  defaultSelected?: boolean;
  toggle?: boolean;
  onSelect?: (selected?: boolean) => void;
  onChange?: (selected: boolean) => void;
  children?: ReactNode;
}

export interface TreeProps {
  label?: string;
  id?: string;
  open?: boolean;
  defaultOpen?: boolean;
  flags?: number;
  onToggle?: (open: boolean) => void;
  children?: ReactNode;
}

export interface TreeNodeProps extends TreeProps {}

export interface TabBarProps {
  id?: string;
  flags?: number;
  children?: ReactNode;
}

export interface TabItemProps {
  label?: string;
  id?: string;
  selected?: boolean;
  defaultSelected?: boolean;
  flags?: number;
  onSelect?: () => void;
  onClose?: () => void;
  children?: ReactNode;
}

export interface ChildWindowProps {
  width?: number;
  height?: number;
  noPadding?: boolean;
  noScrollbar?: boolean;
  children?: ReactNode;
}

export interface ButtonProps {
  style?: StyleProp<ImguiStyle>;
  onClick?: () => void;
  children?: ReactNode;
}

export interface TextProps {
  style?: StyleProp<ImguiStyle>;
  color?: ImColor;
  disabled?: boolean;
  wrapped?: boolean;
  children?: ReactNode;
}

export interface GroupProps {
  children?: ReactNode;
}

export interface SeparatorProps {
  children?: ReactNode;
}

export interface SameLineProps {
  children?: ReactNode;
}

export interface IndentProps {
  children?: ReactNode;
}

export interface CollapsingHeaderProps {
  title?: string;
  children?: ReactNode;
}

export interface TableProps {
  id?: string;
  columns: number;
  flags?: number;
  children?: ReactNode;
}

export interface TableHeaderProps {
  children?: ReactNode;
}

export interface TableRowProps {
  flags?: number;
  minHeight?: number;
  children?: ReactNode;
}

export interface TableCellProps {
  index: number;
  children?: ReactNode;
}

export interface TableColumnProps {
  label?: string;
  flags?: number;
  width?: number;
  children?: ReactNode;
}

export interface RectProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: ImColor;
  filled?: boolean;
  children?: ReactNode;
}

export interface CircleProps {
  x?: number;
  y?: number;
  radius?: number;
  color?: ImColor;
  filled?: boolean;
  segments?: number;
  children?: ReactNode;
}

export interface CheckboxProps {
  style?: StyleProp<ImguiStyle>;
  label?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  children?: ReactNode;
}

export interface SliderFloatProps {
  label?: string;
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  format?: string;
  flags?: number;
  onChange?: (value: number) => void;
}

export interface SliderIntProps {
  label?: string;
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  format?: string;
  flags?: number;
  onChange?: (value: number) => void;
}

export interface ProgressBarProps {
  value?: number;
  min?: number;
  max?: number;
  overlay?: string;
  width?: number;
  height?: number;
}

export interface SpacingProps {
  count?: number;
  children?: ReactNode;
}

export interface InputTextProps {
  label?: string;
  value?: string;
  defaultValue?: string;
  maxLength?: number;
  placeholder?: string;
  flags?: number;
  onChange?: (value: string) => void;
  children?: ReactNode;
}

export interface InputTextMultilineProps {
  label?: string;
  value?: string;
  defaultValue?: string;
  maxLength?: number;
  width?: number;
  height?: number;
  flags?: number;
  onChange?: (value: string) => void;
  children?: ReactNode;
}

export interface InputFloatProps {
  label?: string;
  value?: number;
  defaultValue?: number;
  step?: number;
  stepFast?: number;
  format?: string;
  flags?: number;
  onChange?: (value: number) => void;
}

export interface InputIntProps {
  label?: string;
  value?: number;
  defaultValue?: number;
  step?: number;
  stepFast?: number;
  flags?: number;
  onChange?: (value: number) => void;
}

export interface InputDoubleProps {
  label?: string;
  value?: number;
  defaultValue?: number;
  step?: number;
  stepFast?: number;
  format?: string;
  flags?: number;
  onChange?: (value: number) => void;
}

export interface InputScalarProps {
  label?: string;
  dataType: number;
  value?: bigint | number;
  defaultValue?: bigint | number;
  step?: bigint | number;
  fastStep?: bigint | number;
  format?: string;
  flags?: number;
  onChange?: (value: bigint | number) => void;
}

export interface DragFloatProps {
  label?: string;
  value?: number;
  defaultValue?: number;
  speed?: number;
  min?: number;
  max?: number;
  format?: string;
  flags?: number;
  onChange?: (value: number) => void;
}

export interface DragIntProps {
  label?: string;
  value?: number;
  defaultValue?: number;
  speed?: number;
  min?: number;
  max?: number;
  format?: string;
  flags?: number;
  onChange?: (value: number) => void;
}

export interface ComboProps {
  label?: string;
  items: string[];
  selectedIndex?: number;
  defaultIndex?: number;
  maxHeightItems?: number;
  onChange?: (index: number, item: string) => void;
}

export interface ListBoxProps {
  label?: string;
  items: string[];
  selectedIndex?: number;
  defaultIndex?: number;
  heightInItems?: number;
  width?: number;
  height?: number;
  onChange?: (index: number, item: string) => void;
}

export interface SelectableProps {
  style?: StyleProp<ImguiStyle>;
  label?: string;
  selected?: boolean;
  defaultSelected?: boolean;
  flags?: number;
  width?: number;
  height?: number;
  onChange?: (selected: boolean) => void;
  children?: ReactNode;
}

export interface RadioButtonProps {
  style?: StyleProp<ImguiStyle>;
  label?: string;
  value?: string | number;
  selectedValue?: string | number;
  selected?: boolean;
  defaultSelected?: boolean;
  onChange?: (value: string | number | boolean) => void;
  children?: ReactNode;
}

export interface ColorEdit3Props {
  label?: string;
  value?: ImColor;
  defaultValue?: ImColor;
  flags?: number;
  onChange?: (color: { r: number; g: number; b: number }) => void;
}

export interface ColorEdit4Props {
  label?: string;
  value?: ImColor;
  defaultValue?: ImColor;
  flags?: number;
  onChange?: (color: { r: number; g: number; b: number; a: number }) => void;
}

export interface ColorButtonProps {
  label?: string;
  color?: ImColor;
  flags?: number;
  width?: number;
  height?: number;
  onClick?: () => void;
}

export interface ImageProps {
  textureId: number;
  width: number;
  height: number;
  uv0?: { x: number; y: number };
  uv1?: { x: number; y: number };
  tintColor?: ImColor;
  borderColor?: ImColor;
  children?: ReactNode;
}

export interface ImageButtonProps extends ImageProps {
  id: string;
  backgroundColor?: ImColor;
  onClick?: () => void;
}

export interface PlotLinesProps {
  label?: string;
  values: number[];
  scaleMin?: number;
  scaleMax?: number;
  stride?: number;
  overlay?: string;
  width?: number;
  height?: number;
}

export interface PlotHistogramProps extends PlotLinesProps {}

export interface TooltipProps {
  open?: boolean;
  followItem?: boolean;
  children?: ReactNode;
}

export interface PopupProps {
  id: string;
  open?: boolean;
  defaultOpen?: boolean;
  flags?: number;
  onClose?: () => void;
  children?: ReactNode;
}

export interface PopupModalProps extends PopupProps {}

export interface DockSpaceProps {
  id?: number;
  size?: { x: number; y: number };
  flags?: number;
  passthroughCentralNode?: boolean;
  useViewport?: boolean;
  children?: ReactNode;
}

export interface NavigationState {
  keyboard: boolean;
  gamepad: boolean;
}

export interface NavigationModule {
  configure(options: Partial<NavigationState>): NavigationState;
  getState(): NavigationState;
}

export interface StyleSheetStatic {
  create<T extends { [key: string]: ImguiStyle }>(styles: T): { [K in keyof T]: ImguiStyle };
  compose<T>(style1?: StyleProp<T>, style2?: StyleProp<T>): StyleProp<T>;
  flatten<T>(style?: StyleProp<T>): T | undefined;
  hairlineWidth: number;
  registerFont(name: string, nativeHandle?: number | string): void;
  configureFonts(fonts: FontDescriptor[], options?: ConfigureFontsOptions): FontConfigurationSummary;
  getCurrentFontConfiguration(): FontConfigurationSummary | null;
  getFontHandle(name: string): number | string | undefined;
  createTheme(theme: unknown): unknown;
  applyTheme(theme: unknown): unknown;
  clearTheme(): void;
  getTheme(): unknown;
}

export interface ReactImguiRoot {
  container: {
    rootChildren: unknown[];
  };
  fiberRoot: unknown;
}

export declare const Root: (props: RootProps) => JSX.Element;
export declare const Window: (props: WindowProps) => JSX.Element;
export declare const DemoWindow: (props: DemoWindowProps) => JSX.Element;
export declare const ChildWindow: (props: ChildWindowProps) => JSX.Element;
export declare const MainMenuBar: (props: MainMenuBarProps) => JSX.Element;
export declare const MenuBar: (props: MenuBarProps) => JSX.Element;
export declare const Menu: (props: MenuProps) => JSX.Element;
export declare const MenuItem: (props: MenuItemProps) => JSX.Element;
export declare const Tree: (props: TreeProps) => JSX.Element;
export declare const TreeNode: (props: TreeNodeProps) => JSX.Element;
export declare const TabBar: (props: TabBarProps) => JSX.Element;
export declare const TabItem: (props: TabItemProps) => JSX.Element;
export declare const Button: (props: ButtonProps) => JSX.Element;
export declare const Text: (props: TextProps) => JSX.Element;
export declare const Group: (props: GroupProps) => JSX.Element;
export declare const Separator: (props: SeparatorProps) => JSX.Element;
export declare const SameLine: (props: SameLineProps) => JSX.Element;
export declare const Indent: (props: IndentProps) => JSX.Element;
export declare const CollapsingHeader: (props: CollapsingHeaderProps) => JSX.Element;
export declare const Table: (props: TableProps) => JSX.Element;
export declare const TableHeader: (props: TableHeaderProps) => JSX.Element;
export declare const TableRow: (props: TableRowProps) => JSX.Element;
export declare const TableCell: (props: TableCellProps) => JSX.Element;
export declare const TableColumn: (props: TableColumnProps) => JSX.Element;
export declare const Rect: (props: RectProps) => JSX.Element;
export declare const Circle: (props: CircleProps) => JSX.Element;
export declare const Checkbox: (props: CheckboxProps) => JSX.Element;
export declare const SliderFloat: (props: SliderFloatProps) => JSX.Element;
export declare const SliderInt: (props: SliderIntProps) => JSX.Element;
export declare const ProgressBar: (props: ProgressBarProps) => JSX.Element;
export declare const Spacing: (props: SpacingProps) => JSX.Element;
export declare const InputText: (props: InputTextProps) => JSX.Element;
export declare const InputTextMultiline: (props: InputTextMultilineProps) => JSX.Element;
export declare const InputFloat: (props: InputFloatProps) => JSX.Element;
export declare const InputInt: (props: InputIntProps) => JSX.Element;
export declare const InputDouble: (props: InputDoubleProps) => JSX.Element;
export declare const InputScalar: (props: InputScalarProps) => JSX.Element;
export declare const DragFloat: (props: DragFloatProps) => JSX.Element;
export declare const DragInt: (props: DragIntProps) => JSX.Element;
export declare const Combo: (props: ComboProps) => JSX.Element;
export declare const ListBox: (props: ListBoxProps) => JSX.Element;
export declare const Selectable: (props: SelectableProps) => JSX.Element;
export declare const RadioButton: (props: RadioButtonProps) => JSX.Element;
export declare const ColorEdit3: (props: ColorEdit3Props) => JSX.Element;
export declare const ColorEdit4: (props: ColorEdit4Props) => JSX.Element;
export declare const ColorButton: (props: ColorButtonProps) => JSX.Element;
export declare const Image: (props: ImageProps) => JSX.Element;
export declare const ImageButton: (props: ImageButtonProps) => JSX.Element;
export declare const PlotLines: (props: PlotLinesProps) => JSX.Element;
export declare const PlotHistogram: (props: PlotHistogramProps) => JSX.Element;
export declare const Tooltip: (props: TooltipProps) => JSX.Element;
export declare const Popup: (props: PopupProps) => JSX.Element;
export declare const PopupModal: (props: PopupModalProps) => JSX.Element;
export declare const DockSpace: (props: DockSpaceProps) => JSX.Element;
export declare const Platform: PlatformModule;
export declare const Dimensions: DimensionsModule;
export declare const Navigation: NavigationModule;
export declare const StyleSheet: StyleSheetStatic;
export declare const Appearance: AppearanceModule;

export declare function createRoot(): ReactImguiRoot;
export declare function render(element: ReactElement, root: ReactImguiRoot): Promise<ReactImguiRoot['container']>;
export declare function useWindowDimensions(): DimensionMetrics;
export declare function useColorScheme(): ColorScheme;
export declare function batchedUpdates<A extends any[], R>(fn: (...args: A) => R, ...args: A): R;
export declare function discreteUpdates<A extends any[], R>(fn: (...args: A) => R, ...args: A): R;
export declare function flushSync<R>(fn: () => R): R;

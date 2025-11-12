import type { ReactElement, ReactNode } from 'react';

export type ImColor =
  | string
  | {
      r: number;
      g: number;
      b: number;
      a?: number;
    };

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
  onWindowState?: (x: number, y: number, width: number, height: number) => void;
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

export interface ChildWindowProps {
  width?: number;
  height?: number;
  noPadding?: boolean;
  noScrollbar?: boolean;
  children?: ReactNode;
}

export interface ButtonProps {
  onClick?: () => void;
  children?: ReactNode;
}

export interface TextProps {
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

export interface SelectableProps {
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

export interface NavigationState {
  keyboard: boolean;
  gamepad: boolean;
}

export interface NavigationModule {
  configure(options: Partial<NavigationState>): NavigationState;
  getState(): NavigationState;
}

export interface ReactImguiRoot {
  container: {
    rootChildren: unknown[];
  };
  fiberRoot: unknown;
}

export declare const Root: (props: RootProps) => JSX.Element;
export declare const Window: (props: WindowProps) => JSX.Element;
export declare const ChildWindow: (props: ChildWindowProps) => JSX.Element;
export declare const MainMenuBar: (props: MainMenuBarProps) => JSX.Element;
export declare const MenuBar: (props: MenuBarProps) => JSX.Element;
export declare const Menu: (props: MenuProps) => JSX.Element;
export declare const MenuItem: (props: MenuItemProps) => JSX.Element;
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
export declare const InputFloat: (props: InputFloatProps) => JSX.Element;
export declare const InputInt: (props: InputIntProps) => JSX.Element;
export declare const DragFloat: (props: DragFloatProps) => JSX.Element;
export declare const DragInt: (props: DragIntProps) => JSX.Element;
export declare const Combo: (props: ComboProps) => JSX.Element;
export declare const Selectable: (props: SelectableProps) => JSX.Element;
export declare const RadioButton: (props: RadioButtonProps) => JSX.Element;
export declare const ColorEdit3: (props: ColorEdit3Props) => JSX.Element;
export declare const ColorEdit4: (props: ColorEdit4Props) => JSX.Element;
export declare const ColorButton: (props: ColorButtonProps) => JSX.Element;
export declare const Platform: PlatformModule;
export declare const Dimensions: DimensionsModule;
export declare const Navigation: NavigationModule;

export declare function createRoot(): ReactImguiRoot;
export declare function render(element: ReactElement, root: ReactImguiRoot): Promise<ReactImguiRoot['container']>;
export declare function useWindowDimensions(): DimensionMetrics;

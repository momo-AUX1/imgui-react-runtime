import type { ReactNode, ComponentType } from 'react';
import type {
  GroupProps,
  WindowProps,
  TextProps as ImguiTextProps,
  ButtonProps as ImguiButtonProps,
  ChildWindowProps,
  InputTextProps,
  InputTextMultilineProps,
  CheckboxProps,
  SliderFloatProps,
  PopupModalProps,
  StyleSheetStatic,
  PlatformModule,
  DimensionsModule,
  AppearanceModule,
  NavigationModule,
  ReactImguiRoot
} from '../';

export interface ViewProps extends GroupProps {
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
}

export interface ScrollViewProps extends ChildWindowProps {
  contentContainerStyle?: ViewProps['style'];
  scrollEnabled?: boolean;
  horizontal?: boolean;
}

export interface TextProps extends ImguiTextProps {
  numberOfLines?: number;
}

export interface ButtonProps extends ImguiButtonProps {
  title?: string;
  onPress?: () => void;
}

export interface PressableProps extends ImguiButtonProps {
  onPress?: () => void;
  children?: ReactNode | ((state: { pressed: boolean }) => ReactNode);
}

export interface SwitchProps extends CheckboxProps {
  value?: boolean;
  defaultValue?: boolean;
  onValueChange?: (value: boolean) => void;
}

export interface SliderProps extends SliderFloatProps {
  minimumValue?: number;
  maximumValue?: number;
  onValueChange?: (value: number) => void;
}

export interface TextInputProps extends InputTextProps, InputTextMultilineProps {
  multiline?: boolean;
  numberOfLines?: number;
  onChangeText?: (text: string) => void;
}

export interface ModalProps extends PopupModalProps {
  visible?: boolean;
  onRequestClose?: () => void;
}

export interface AlertButton {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface AlertPayload {
  title?: string;
  message?: string;
  buttons: AlertButton[];
  options?: Record<string, unknown>;
}

export interface AlertModule {
  alert(
    title?: string,
    message?: string,
    buttons?: AlertButton[],
    options?: Record<string, unknown>
  ): unknown;
  setHandler(handler: ((payload: AlertPayload) => unknown) | null | undefined): void;
  getHandler(): (payload: AlertPayload) => unknown;
}

export interface AppRunParameters {
  initialProps?: Record<string, unknown>;
  root?: ReactImguiRoot;
  reactImguiRoot?: ReactImguiRoot;
  autoInstallGlobal?: boolean;
}

export interface AppRegistryRuntime {
  appKey: string;
  root: ReactImguiRoot;
  reactApp?: unknown;
  updateProps(nextProps?: Record<string, unknown>): Promise<unknown>;
  render(): Promise<unknown>;
}

export interface AppRegistryModule {
  registerComponent(appKey: string, componentProvider: () => ComponentType<any>): string;
  registerRunnable(appKey: string, runnable: (params?: AppRunParameters) => AppRegistryRuntime | void): string;
  getRunnable(appKey: string): ((params?: AppRunParameters) => AppRegistryRuntime | void) | undefined;
  runApplication(appKey: string, params?: AppRunParameters): AppRegistryRuntime | void;
  unmountApplicationComponentAtRootTag(rootTag: string | ReactImguiRoot): void;
}

export declare const View: (props: ViewProps) => JSX.Element;
export declare const SafeAreaView: (props: ViewProps) => JSX.Element;
export declare const WindowView: (props: WindowProps) => JSX.Element;
export declare const Text: (props: TextProps) => JSX.Element;
export declare const Button: (props: ButtonProps) => JSX.Element;
export declare const Pressable: (props: PressableProps) => JSX.Element;
export declare const TouchableOpacity: (props: PressableProps) => JSX.Element;
export declare const TouchableHighlight: (props: PressableProps) => JSX.Element;
export declare const TouchableWithoutFeedback: (props: PressableProps) => JSX.Element;
export declare const ScrollView: (props: ScrollViewProps) => JSX.Element;
export declare const TextInput: (props: TextInputProps) => JSX.Element;
export declare const Switch: (props: SwitchProps) => JSX.Element;
export declare const Slider: (props: SliderProps) => JSX.Element;
export declare const Modal: (props: ModalProps) => JSX.Element | null;
export declare const Alert: AlertModule;
export declare const AppRegistry: AppRegistryModule;

export {
  StyleSheet,
  Platform,
  Dimensions,
  Appearance,
  useWindowDimensions,
  useColorScheme,
  getColorScheme,
  Navigation,
  createRoot,
  render,
  batchedUpdates,
  discreteUpdates,
  flushSync
} from '../react-imgui';

export interface ReactImguiNativeModule {
  View: typeof View;
  SafeAreaView: typeof SafeAreaView;
  WindowView: typeof WindowView;
  Text: typeof Text;
  Button: typeof Button;
  Pressable: typeof Pressable;
  TouchableOpacity: typeof TouchableOpacity;
  TouchableHighlight: typeof TouchableHighlight;
  TouchableWithoutFeedback: typeof TouchableWithoutFeedback;
  ScrollView: typeof ScrollView;
  TextInput: typeof TextInput;
  Switch: typeof Switch;
  Slider: typeof Slider;
  Modal: typeof Modal;
  Alert: typeof Alert;
  AppRegistry: typeof AppRegistry;
  StyleSheet: StyleSheetStatic;
  Platform: PlatformModule;
  Dimensions: DimensionsModule;
  Appearance: AppearanceModule;
  useWindowDimensions: typeof import('../react-imgui').useWindowDimensions;
  useColorScheme: typeof import('../react-imgui').useColorScheme;
  getColorScheme: typeof import('../react-imgui').getColorScheme;
  Navigation: NavigationModule;
  createRoot: typeof import('../react-imgui').createRoot;
  render: typeof import('../react-imgui').render;
  batchedUpdates: typeof import('../react-imgui').batchedUpdates;
  discreteUpdates: typeof import('../react-imgui').discreteUpdates;
  flushSync: typeof import('../react-imgui').flushSync;
}

export declare const RNCompat: {
  install(target?: Record<string, unknown>): Record<string, unknown>;
  exports: ReactImguiNativeModule;
};

export default RNCompat;

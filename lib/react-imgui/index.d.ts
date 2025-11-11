import type { ReactElement, ReactNode } from 'react';

export type ImColor =
  | string
  | {
      r: number;
      g: number;
      b: number;
      a?: number;
    };

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
  onWindowState?: (x: number, y: number, width: number, height: number) => void;
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

export interface ReactImguiRoot {
  container: {
    rootChildren: unknown[];
  };
  fiberRoot: unknown;
}

export declare const Root: (props: RootProps) => JSX.Element;
export declare const Window: (props: WindowProps) => JSX.Element;
export declare const ChildWindow: (props: ChildWindowProps) => JSX.Element;
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

export declare function createRoot(): ReactImguiRoot;
export declare function render(element: ReactElement, root: ReactImguiRoot): Promise<ReactImguiRoot['container']>;

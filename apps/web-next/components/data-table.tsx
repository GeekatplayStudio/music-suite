import { ReactNode, useMemo } from "react";

import { cn } from "@/lib/utils";

export interface CellContext<TData, TValue = unknown> {
  row: { original: TData; index: number };
  getValue: () => TValue;
}

// The only column features this table renders: a header, and either an
// accessor key or a cell renderer.
export interface ColumnDef<TData, TValue = unknown> {
  id?: string;
  header?: ReactNode | (() => ReactNode);
  accessorKey?: string;
  cell?: ReactNode | ((ctx: CellContext<TData, TValue>) => ReactNode);
}

interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  onRowClick?: (row: TData) => void;
  rowClassName?: (row: TData) => string;
}

export function DataTable<TData>({ data, columns, onRowClick, rowClassName }: DataTableProps<TData>) {
  const colCount = useMemo(() => columns.length, [columns.length]);
  const headers = useMemo(
    () =>
      columns.map((column, colIndex) => {
        return {
          id: column.id ?? column.accessorKey ?? `col_${colIndex}`,
          content: renderHeader(column.header, column.accessorKey)
        };
      }),
    [columns]
  );

  return (
    <div className="rounded-2xl border border-border/80 bg-card/70">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="bg-secondary/70 text-left">
            <tr>
              {headers.map((header) => (
                <th key={header.id} className="px-3 py-2 font-semibold">
                  {header.content}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={cn(
                  "border-t border-border/60 transition-colors",
                  onRowClick ? "cursor-pointer hover:bg-secondary/55" : "",
                  rowClassName?.(row)
                )}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((column, colIndex) => (
                  <td key={`${rowIndex}_${colIndex}`} className="px-3 py-2 align-top">
                    {renderCell(column, row, rowIndex)}
                  </td>
                ))}
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-muted-foreground" colSpan={colCount}>
                  No rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderHeader(header: ColumnDef<unknown>["header"], accessorKey?: string): ReactNode {
  if (typeof header === "function") {
    return header();
  }
  if (header !== undefined && header !== null) {
    return header;
  }
  return accessorKey ?? "";
}

function renderCell<TData>(column: ColumnDef<TData, unknown>, row: TData, rowIndex: number): ReactNode {
  const accessorKey = column.accessorKey;
  const value =
    typeof accessorKey === "string"
      ? (row as Record<string, unknown>)[accessorKey]
      : undefined;
  if (typeof column.cell === "function") {
    return column.cell({
      row: { original: row, index: rowIndex },
      getValue: () => value
    });
  }
  if (column.cell !== undefined && column.cell !== null) {
    return column.cell;
  }
  if (value === undefined || value === null) {
    return "";
  }
  return typeof value === "string" || typeof value === "number" ? value : String(value);
}

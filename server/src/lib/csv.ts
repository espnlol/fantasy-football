import { parse } from 'csv-parse/sync';

export type CsvRow = Record<string, string>;

export function parseCsv(text: string): CsvRow[] {
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as CsvRow[];
}

/** Parses a numeric field, treating '', 'NA', and 'NaN' as missing. */
export function num(row: CsvRow, field: string): number | null {
  const raw = row[field];
  if (raw === undefined || raw === null || raw === '' || raw === 'NA' || raw === 'NaN') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function numOr0(row: CsvRow, field: string): number {
  return num(row, field) ?? 0;
}

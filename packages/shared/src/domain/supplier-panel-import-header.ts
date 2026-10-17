import { validationError } from "../runtime/errors.ts";
import {
  canonicalColumnName,
  IMPORT_COLUMNS,
  IMPORT_ERROR_COLUMN,
  spreadsheetColumnLetter,
} from "./supplier-panel-import-columns.ts";

/**
 * product-csv answers any header problem with "Cabeçalho inválido". Here each problem is named
 * with the column letter, so the supplier knows what to rename, add or remove.
 */

export interface CheckedHeader {
  /** Template names, without the "erro" column of an exported failed-rows file. */
  readonly header: readonly string[];
  readonly letters: readonly string[];
  /** Index of the "erro" column in the file, or -1. */
  readonly skippedIndex: number;
}

interface HeaderCell {
  readonly name: string;
  readonly letter: string;
  readonly original: string;
}

const KNOWN_COLUMNS = new Set(IMPORT_COLUMNS.map((entry) => entry.column));
const REQUIRED_COLUMNS = IMPORT_COLUMNS.filter((entry) => entry.required).map(
  (entry) => entry.column,
);

function headerCells(fields: readonly string[]): HeaderCell[] {
  const cells = fields.map((original, index) => ({
    name: canonicalColumnName(original),
    letter: spreadsheetColumnLetter(index),
    original: original.trim(),
  }));
  const lastNamed = cells.findLastIndex((cell) => cell.name.length > 0);
  return cells.slice(0, lastNamed + 1);
}

function assertNamed(cells: readonly HeaderCell[]): void {
  const unnamed = cells.filter((cell) => cell.name.length === 0).map((cell) => cell.letter);
  if (unnamed.length > 0) {
    throw validationError(
      `A primeira linha precisa ter o nome de cada coluna. Sem nome: coluna ${unnamed.join(", ")}`,
    );
  }
}

function assertUnique(cells: readonly HeaderCell[]): void {
  const repeated = cells.find((cell, index) =>
    cells.some((other, otherIndex) => otherIndex < index && other.name === cell.name),
  );
  if (repeated === undefined) {
    return;
  }
  const letters = cells.filter((cell) => cell.name === repeated.name).map((cell) => cell.letter);
  throw validationError(
    `A coluna "${repeated.name}" aparece mais de uma vez (colunas ${letters.join(" e ")}). Deixe só uma`,
  );
}

function assertKnown(cells: readonly HeaderCell[]): void {
  const unknown = cells.filter((cell) => !KNOWN_COLUMNS.has(cell.name));
  if (unknown.length === 0) {
    return;
  }
  const listed = unknown.map((cell) => `"${cell.original}" (coluna ${cell.letter})`).join(", ");
  throw validationError(
    `Colunas não reconhecidas: ${listed}. Use os nomes do modelo: ${[...KNOWN_COLUMNS].join(", ")}`,
  );
}

function assertRequired(cells: readonly HeaderCell[]): void {
  const missing = REQUIRED_COLUMNS.filter((column) => !cells.some((cell) => cell.name === column));
  if (missing.length === 0) {
    return;
  }
  throw validationError(
    `Faltam colunas obrigatórias: ${missing.join(", ")}. A primeira linha da planilha deve ser o cabeçalho do modelo`,
  );
}

export function checkImportHeader(fields: readonly string[]): CheckedHeader {
  const all = headerCells(fields);
  const skippedIndex = all.findIndex((cell) => cell.name === IMPORT_ERROR_COLUMN);
  const cells = all.filter((_cell, index) => index !== skippedIndex);
  assertNamed(cells);
  assertRequired(cells);
  assertUnique(cells);
  assertKnown(cells);
  return {
    header: cells.map((cell) => cell.name),
    letters: cells.map((cell) => cell.letter),
    skippedIndex,
  };
}

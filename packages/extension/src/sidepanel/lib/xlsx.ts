export type SpreadsheetCell = string | number | boolean | null | undefined;

export type SpreadsheetColumn = {
  key: string;
  header?: string;
};

export type SpreadsheetRow = SpreadsheetCell[] | Record<string, SpreadsheetCell>;

export type SpreadsheetSheet = {
  name?: string;
  columns?: SpreadsheetColumn[];
  rows: SpreadsheetRow[];
};

export type SpreadsheetInput = {
  sheets: SpreadsheetSheet[];
};

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type ZipEntry = {
  name: string;
  data: Uint8Array;
};

const encoder = new TextEncoder();
let crcTable: Uint32Array | null = null;

/**
 * Raw .xlsx bytes. The background service worker has no
 * `URL.createObjectURL`, so it needs the bytes to build a `data:` URL rather
 * than a Blob URL.
 */
export function buildXlsxBytes(input: SpreadsheetInput): Uint8Array {
  const sheets = normalizeWorkbook(input);
  const entries: ZipEntry[] = [
    xmlEntry("[Content_Types].xml", buildContentTypesXml(sheets.length)),
    xmlEntry("_rels/.rels", buildRootRelsXml()),
    xmlEntry("xl/workbook.xml", buildWorkbookXml(sheets.map((sheet) => sheet.name))),
    xmlEntry("xl/_rels/workbook.xml.rels", buildWorkbookRelsXml(sheets.length)),
    ...sheets.map((sheet, index) =>
      xmlEntry(`xl/worksheets/sheet${index + 1}.xml`, buildSheetXml(sheet.rows))
    ),
  ];
  return buildZip(entries);
}

export function buildXlsxFile(input: SpreadsheetInput): Blob {
  const sheets = normalizeWorkbook(input);
  const entries: ZipEntry[] = [
    xmlEntry("[Content_Types].xml", buildContentTypesXml(sheets.length)),
    xmlEntry("_rels/.rels", buildRootRelsXml()),
    xmlEntry("xl/workbook.xml", buildWorkbookXml(sheets.map((sheet) => sheet.name))),
    xmlEntry("xl/_rels/workbook.xml.rels", buildWorkbookRelsXml(sheets.length)),
    ...sheets.map((sheet, index) => xmlEntry(`xl/worksheets/sheet${index + 1}.xml`, buildSheetXml(sheet.rows))),
  ];
  const zip = buildZip(entries);
  return new Blob([zip.buffer as ArrayBuffer], { type: XLSX_MIME });
}

function normalizeWorkbook(input: SpreadsheetInput): Array<{ name: string; rows: SpreadsheetCell[][] }> {
  if (!input || !Array.isArray(input.sheets) || input.sheets.length === 0) {
    throw new Error("downloadSpreadsheet: sheets required");
  }
  const usedNames = new Set<string>();
  return input.sheets.map((sheet, index) => {
    if (!Array.isArray(sheet.rows)) throw new Error(`downloadSpreadsheet: sheets[${index}].rows required`);
    const name = uniqueSheetName(sheet.name || `Sheet ${index + 1}`, usedNames);
    return { name, rows: normalizeRows(sheet) };
  });
}

function normalizeRows(sheet: SpreadsheetSheet): SpreadsheetCell[][] {
  const objectMode = !!sheet.columns?.length || sheet.rows.some((row) => !Array.isArray(row));
  if (!objectMode) return sheet.rows.map((row) => (row as SpreadsheetCell[]).map(normalizeCell));

  const columns = sheet.columns?.length ? sheet.columns : deriveColumns(sheet.rows);
  const header = columns.map((column) => column.header ?? column.key);
  const rows = sheet.rows.map((row) => {
    if (Array.isArray(row)) return columns.map((_, index) => normalizeCell(row[index]));
    return columns.map((column) => normalizeCell(row[column.key]));
  });
  return [header, ...rows];
}

function deriveColumns(rows: SpreadsheetRow[]): SpreadsheetColumn[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (Array.isArray(row)) {
      for (let index = 0; index < row.length; index++) {
        const key = `column${index + 1}`;
        if (!seen.has(key)) {
          seen.add(key);
          keys.push(key);
        }
      }
      continue;
    }
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  return keys.map((key) => ({ key }));
}

function normalizeCell(value: unknown): SpreadsheetCell {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value as SpreadsheetCell;
  }
  return JSON.stringify(value);
}

function uniqueSheetName(raw: string, used: Set<string>): string {
  const base = (raw || "Sheet").replace(/[\[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet";
  let name = base;
  let suffix = 2;
  while (used.has(name)) {
    const marker = ` ${suffix++}`;
    name = `${base.slice(0, Math.max(1, 31 - marker.length))}${marker}`;
  }
  used.add(name);
  return name;
}

function buildContentTypesXml(sheetCount: number): string {
  const sheets = Array.from(
    { length: sheetCount },
    (_, index) =>
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join("");
  return xmlDecl(
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      sheets +
      `</Types>`
  );
}

function buildRootRelsXml(): string {
  return xmlDecl(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`
  );
}

function buildWorkbookXml(sheetNames: string[]): string {
  const sheets = sheetNames
    .map((name, index) => `<sheet name="${xmlAttr(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("");
  return xmlDecl(
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets>${sheets}</sheets>` +
      `</workbook>`
  );
}

function buildWorkbookRelsXml(sheetCount: number): string {
  const rels = Array.from(
    { length: sheetCount },
    (_, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
  ).join("");
  return xmlDecl(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`);
}

function buildSheetXml(rows: SpreadsheetCell[][]): string {
  const rowXml = rows
    .map((row, rowIndex) => {
      const rowNo = rowIndex + 1;
      const cells = row
        .map((cell, colIndex) => buildCellXml(cell, `${columnName(colIndex + 1)}${rowNo}`))
        .filter(Boolean)
        .join("");
      return `<row r="${rowNo}">${cells}</row>`;
    })
    .join("");
  return xmlDecl(
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<sheetData>${rowXml}</sheetData>` +
      `</worksheet>`
  );
}

function buildCellXml(cell: SpreadsheetCell, ref: string): string {
  if (cell == null || cell === "") return "";
  if (typeof cell === "number" && Number.isFinite(cell)) return `<c r="${ref}"><v>${cell}</v></c>`;
  if (typeof cell === "boolean") return `<c r="${ref}" t="b"><v>${cell ? 1 : 0}</v></c>`;
  const value = String(cell);
  const preserve = /^\s|\s$/.test(value) ? ' xml:space="preserve"' : "";
  return `<c r="${ref}" t="inlineStr"><is><t${preserve}>${xmlText(value)}</t></is></c>`;
}

function columnName(index: number): string {
  let n = index;
  let out = "";
  while (n > 0) {
    n--;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

function xmlDecl(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body}`;
}

function xmlEntry(name: string, xml: string): ZipEntry {
  return { name, data: encoder.encode(xml) };
}

function xmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r/g, "&#13;");
}

function xmlAttr(value: string): string {
  return xmlText(value).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function buildZip(entries: ZipEntry[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const filename = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(entry.data.length),
      u32(entry.data.length),
      u16(filename.length),
      u16(0),
      filename,
      entry.data,
    ]);
    localParts.push(local);

    centralParts.push(
      concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(entry.data.length),
        u32(entry.data.length),
        u16(filename.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        filename,
      ])
    );
    offset += local.length;
  }

  const central = concat(centralParts);
  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
  return concat([...localParts, central, eocd]);
}

function crc32(data: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of data) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  crcTable = table;
  return table;
}

function u16(value: number): Uint8Array {
  const out = new Uint8Array(2);
  const view = new DataView(out.buffer);
  view.setUint16(0, value, true);
  return out;
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  const view = new DataView(out.buffer);
  view.setUint32(0, value >>> 0, true);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

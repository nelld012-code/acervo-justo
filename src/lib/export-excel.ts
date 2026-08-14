type ExcelValue = string | number | boolean | null | undefined;

type ZipFile = {
  name: string;
  data: Uint8Array;
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function toUtf8(value: string) {
  return new TextEncoder().encode(value);
}

function writeU16(value: number) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function writeU32(value: number) {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function concatBytes(...parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(files: ZipFile[]) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = toUtf8(file.name);
    const data = file.data;
    const crc = crc32(data);

    const localHeader = concatBytes(
      writeU32(0x04034b50),
      writeU16(20),
      writeU16(0),
      writeU16(0),
      writeU16(0),
      writeU16(0),
      writeU32(crc),
      writeU32(data.length),
      writeU32(data.length),
      writeU16(name.length),
      writeU16(0),
      name,
    );
    localParts.push(localHeader, data);

    const centralHeader = concatBytes(
      writeU32(0x02014b50),
      writeU16(20),
      writeU16(20),
      writeU16(0),
      writeU16(0),
      writeU16(0),
      writeU16(0),
      writeU32(crc),
      writeU32(data.length),
      writeU32(data.length),
      writeU16(name.length),
      writeU16(0),
      writeU16(0),
      writeU16(0),
      writeU16(0),
      writeU32(0),
      writeU32(offset),
      name,
    );
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralDirectory = concatBytes(...centralParts);
  const localDirectory = concatBytes(...localParts);
  const endOfCentralDirectory = concatBytes(
    writeU32(0x06054b50),
    writeU16(0),
    writeU16(0),
    writeU16(files.length),
    writeU16(files.length),
    writeU32(centralDirectory.length),
    writeU32(localDirectory.length),
    writeU16(0),
  );

  return concatBytes(localDirectory, centralDirectory, endOfCentralDirectory);
}

function cellXml(value: ExcelValue) {
  if (value === null || value === undefined || value === "") return "<c/>";
  if (typeof value === "number" && Number.isFinite(value)) return `<c><v>${value}</v></c>`;
  if (typeof value === "boolean") return `<c t="b"><v>${value ? 1 : 0}</v></c>`;
  return `<c t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}

function columnName(index: number) {
  let n = index + 1;
  let result = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function worksheetXml(headers: string[], rows: ExcelValue[][]) {
  const allRows = [headers, ...rows];
  const lastColumn = columnName(Math.max(headers.length - 1, 0));
  const lastRow = allRows.length;
  const xmlRows = allRows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
      const cell = cellXml(value);
      if (cell === "<c/>") return `<c r="${ref}"/>`;
      return cell.replace(/^<c(?=[ >])/, `<c r="${ref}"`);
    });
    return `<row r="${rowIndex + 1}">${cells.join("")}</row>`;
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastColumn}${lastRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${xmlRows.join("")}</sheetData></worksheet>`;
}

function workbookXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Prazos" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
}

function rootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function workbookRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
}

export function exportToExcel(filename: string, headers: string[], rows: ExcelValue[][]) {
  const files: ZipFile[] = [
    { name: "[Content_Types].xml", data: toUtf8(contentTypesXml()) },
    { name: "_rels/.rels", data: toUtf8(rootRelsXml()) },
    { name: "xl/workbook.xml", data: toUtf8(workbookXml()) },
    { name: "xl/_rels/workbook.xml.rels", data: toUtf8(workbookRelsXml()) },
    { name: "xl/worksheets/sheet1.xml", data: toUtf8(worksheetXml(headers, rows)) },
  ];

  const bytes = zipStore(files);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

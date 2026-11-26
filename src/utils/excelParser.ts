import * as XLSX from 'xlsx';
import type { ClaimMode, ParsedExcelMemo } from '../types.ts';
import { normalizeKode6 } from './claimMath.ts';

const SUPPORTED_EXTENSIONS = ['.xlsx', '.xls', '.xlsm'];
const EXCLUDED_NAME_PARTS = ['tidy_sellout', 'tidy_sellout_rafraksi', 'so_', 'soraf_'];

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    if (!cleaned) return fallback;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function getFileStem(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot > 0 ? filename.slice(0, lastDot) : filename;
}

export function checkExcludedFilename(filename: string): string | null {
  const lower = filename.toLowerCase();
  if (!SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return 'Ekstensi file tidak didukung (harus .xlsx, .xls, atau .xlsm)';
  }
  if (filename.startsWith('~$')) {
    return 'File kunci sementara Excel (~$)';
  }
  const matchedPart = EXCLUDED_NAME_PARTS.find((part) => lower.includes(part));
  if (matchedPart) {
    return `Mengandung pola file hasil ekspor ("${matchedPart}")`;
  }
  return null;
}

export async function parseExcelFile(
  file: File,
  mode: ClaimMode
): Promise<ParsedExcelMemo> {
  const excludedReason = checkExcludedFilename(file.name);
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return {
      filename: file.name,
      memo_number: getFileStem(file.name).slice(0, 6) || 'MEMO',
      mode,
      excludedReason,
      include: excludedReason === null,
      items: [],
    };
  }

  const sheet = workbook.Sheets[firstSheetName];
  const inputColumns = mode === 'potongan' ? 7 : 9;

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  const items: ParsedExcelMemo['items'] = [];
  let seenHeader = false;
  for (let r = 0; r < rawRows.length; r++) {
    const row = rawRows[r];
    let hasCell = false;
    for (let c = 0; c < inputColumns; c++) {
      const cell = row[c];
      if (cell !== '' && cell !== null && cell !== undefined && String(cell).trim() !== '') {
        hasCell = true;
        break;
      }
    }
    if (!hasCell) continue;
    if (!seenHeader) {
      seenHeader = true;
      continue;
    }

    const kode = normalizeKode6(String(row[0] ?? ''));
    const nama = String(row[2] ?? '').trim();
    const qty = toNumber(row[4], 0);
    const harga_satuan = toNumber(row[5], 0);

    if (!kode && !nama && qty === 0) continue;

    if (mode === 'potongan') {
      const diskon_satuan = toNumber(row[6], 0);
      items.push({
        kode,
        nama,
        qty,
        discount_type: 'potongan',
        diskon_satuan,
        harga_satuan,
        rafraksi_pct: 0,
      });
    } else if (mode === 'rafraksi') {
      const totalDiskonIdr = toNumber(row[8], 0);
      const jumlah = qty * harga_satuan;
      const rafraksi_pct =
        jumlah > 0 ? Number(((totalDiskonIdr / jumlah) * 100).toFixed(4)) : 0;

      items.push({
        kode,
        nama,
        qty,
        discount_type: 'rafraksi',
        diskon_satuan: 0,
        harga_satuan,
        rafraksi_pct,
      });
    } else {
      // Mixed mode: Excel source only has IDR values; % is calculated from col I (Total Diskon IDR)
      // when col G (Diskon Satuan) is empty/0, or col G is used as Diskon Satuan when provided.
      const diskon_satuan = toNumber(row[6], 0);
      const totalDiskonIdr = toNumber(row[8], 0);

      if (totalDiskonIdr > 0 && diskon_satuan === 0) {
        const jumlah = qty * harga_satuan;
        const rafraksi_pct =
          jumlah > 0 ? Number(((totalDiskonIdr / jumlah) * 100).toFixed(4)) : 0;
        items.push({
          kode,
          nama,
          qty,
          discount_type: 'rafraksi',
          diskon_satuan: 0,
          harga_satuan,
          rafraksi_pct,
        });
      } else {
        items.push({
          kode,
          nama,
          qty,
          discount_type: 'potongan',
          diskon_satuan,
          harga_satuan,
          rafraksi_pct: 0,
        });
      }
    }
  }

  return {
    filename: file.name,
    memo_number: getFileStem(file.name).slice(0, 6) || 'MEMO',
    mode,
    excludedReason,
    include: excludedReason === null && items.length > 0,
    items,
  };
}

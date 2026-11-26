import React, { useState } from 'react';
import { Upload, X, FileSpreadsheet, AlertCircle } from 'lucide-react';
import type { ClaimMode, ParsedExcelMemo } from '../types.ts';
import { parseExcelFile } from '../utils/excelParser.ts';
import { formatPeriodeShorthand } from '../utils/claimMath.ts';
import { SupplierAutocompleteInput } from './SupplierAutocompleteInput.tsx';

interface ImportExcelModalProps {
  open: boolean;
  supplierOptions: string[];
  onClose: () => void;
  onImport: (payload: {
    memos: Array<{
      memo_number: string;
      mode: ClaimMode;
      supplier: string;
      periode_start: string;
      periode_end: string;
      no_kontrak: string;
      source_filename: string;
      items: ParsedExcelMemo['items'];
    }>;
    note: string;
  }) => Promise<void>;
}

export function ImportExcelModal({
  open,
  supplierOptions,
  onClose,
  onImport,
}: ImportExcelModalProps) {
  const [mode, setMode] = useState<ClaimMode>('potongan');
  const [files, setFiles] = useState<File[]>([]);
  const [parsed, setParsed] = useState<ParsedExcelMemo[]>([]);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [defaultSupplier, setDefaultSupplier] = useState('');
  const [defaultPeriodeStart, setDefaultPeriodeStart] = useState('');
  const [defaultPeriodeEnd, setDefaultPeriodeEnd] = useState('');
  const [defaultNoKontrak, setDefaultNoKontrak] = useState('');
  const [note, setNote] = useState('');

  if (!open) return null;

  async function processFiles(selected: File[], targetMode: ClaimMode) {
    setParsing(true);
    setError('');
    try {
      const results = await Promise.all(
        selected.map((file) => parseExcelFile(file, targetMode))
      );
      setParsed(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membaca file Excel');
    } finally {
      setParsing(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;
    setFiles(selected);
    await processFiles(selected, mode);
  }

  async function handleModeSwitch(nextMode: ClaimMode) {
    setMode(nextMode);
    if (files.length > 0) {
      await processFiles(files, nextMode);
    }
  }

  function toggleInclude(index: number) {
    setParsed((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, include: !item.include } : item))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const toImport = parsed.filter((p) => p.include && p.items.length > 0);
    if (toImport.length === 0) {
      setError('Pilih minimal satu file Excel yang valid dan memiliki baris data.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await onImport({
        memos: toImport.map((m) => ({
          memo_number: m.memo_number,
          mode: m.mode,
          supplier: defaultSupplier.trim(),
          periode_start: formatPeriodeShorthand(defaultPeriodeStart),
          periode_end: formatPeriodeShorthand(defaultPeriodeEnd),
          no_kontrak: defaultNoKontrak.trim(),
          source_filename: m.filename,
          items: m.items,
        })),
        note: note.trim(),
      });
      setFiles([]);
      setParsed([]);
      setDefaultSupplier('');
      setDefaultPeriodeStart('');
      setDefaultPeriodeEnd('');
      setDefaultNoKontrak('');
      setNote('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impor gagal');
    } finally {
      setSubmitting(false);
    }
  }

  const activeCount = parsed.filter((p) => p.include && p.items.length > 0).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-plum-900/25 backdrop-blur-[1px] p-4">
      <div className="w-full max-w-2xl bg-white border border-plum-200 rounded-xl shadow-xl shadow-plum-900/10 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-plum-100 bg-plum-50/50">
          <div>
            <h2 className="text-lg font-semibold text-plum-900">Impor File Excel Sellout</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Mendukung .xlsx, .xls, dan .xlsm (Kode 6 digit, Potongan Rp, Rafraksi %, atau Campuran)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-plum-400 hover:text-plum-700 hover:bg-plum-100/70 rounded-lg transition-colors"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Format Laporan
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center gap-1 p-1 bg-plum-50 border border-plum-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => handleModeSwitch('potongan')}
                  className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    mode === 'potongan'
                      ? 'bg-white text-plum-900 shadow-xs'
                      : 'text-plum-700/75 hover:text-plum-900'
                  }`}
                >
                  Potongan (7 kol)
                </button>
                <button
                  type="button"
                  onClick={() => handleModeSwitch('rafraksi')}
                  className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    mode === 'rafraksi'
                      ? 'bg-white text-plum-900 shadow-xs'
                      : 'text-plum-700/75 hover:text-plum-900'
                  }`}
                >
                  Rafraksi (9 kol)
                </button>
                <button
                  type="button"
                  onClick={() => handleModeSwitch('mixed')}
                  className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    mode === 'mixed'
                      ? 'bg-white text-plum-900 shadow-xs'
                      : 'text-plum-700/75 hover:text-plum-900'
                  }`}
                >
                  Campuran (Otomatis)
                </button>
              </div>

              <div className="text-xs text-slate-500 font-mono">
                {mode === 'potongan' && 'Kol A: Kode · C: Nama · E: QTY · G: Diskon'}
                {mode === 'rafraksi' && 'Kol A: Kode · C: Nama · E: QTY · F: Harga · I: Total Diskon'}
                {mode === 'mixed' && 'Kol F: Harga · G: Diskon Rp / I: Total Diskon (hitung %)'}
              </div>
            </div>
          </div>

          <label className="flex flex-col items-center justify-center gap-2 border border-dashed border-plum-300 rounded-xl p-6 bg-plum-50/40 hover:bg-plum-50/80 cursor-pointer transition-colors">
            <Upload className="w-6 h-6 text-plum-500" />
            <span className="text-base font-medium text-plum-900">
              {files.length > 0
                ? `${files.length} file dipilih — klik untuk ganti`
                : 'Pilih satu atau beberapa file Excel (.xlsx, .xls, .xlsm)'}
            </span>
            <span className="text-sm text-slate-500">
              6 karakter pertama nama file = No. Memo · Kode otomatis 6 digit
            </span>
            <input
              type="file"
              multiple
              accept=".xlsx,.xls,.xlsm"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Supplier (opsional, bisa diisi nanti)
              </label>
              <SupplierAutocompleteInput
                value={defaultSupplier}
                options={supplierOptions}
                placeholder="Ketik atau pilih supplier..."
                onChange={setDefaultSupplier}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                No. Kontrak (opsional)
              </label>
              <input
                type="text"
                value={defaultNoKontrak}
                onChange={(e) => setDefaultNoKontrak(e.target.value)}
                placeholder="cth. KTR/SUP/2026"
                className="w-full px-3.5 py-2 text-sm border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Periode Mulai (opsional)
              </label>
              <input
                type="text"
                value={defaultPeriodeStart}
                onChange={(e) => setDefaultPeriodeStart(e.target.value)}
                onBlur={(e) => setDefaultPeriodeStart(formatPeriodeShorthand(e.target.value))}
                placeholder="cth. 2611 → 26 Nov 2026"
                className="w-full px-3.5 py-2 text-sm border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Periode Selesai (opsional)
              </label>
              <input
                type="text"
                value={defaultPeriodeEnd}
                onChange={(e) => setDefaultPeriodeEnd(e.target.value)}
                onBlur={(e) => setDefaultPeriodeEnd(formatPeriodeShorthand(e.target.value))}
                placeholder="cth. 3011 → 30 Nov 2026"
                className="w-full px-3.5 py-2 text-sm border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
              />
            </div>
          </div>

          {parsing && (
            <div className="text-sm text-slate-500 py-2">Sedang membaca file Excel...</div>
          )}

          {parsed.length > 0 && (
            <div className="border border-plum-200 rounded-lg divide-y divide-plum-50">
              {parsed.map((entry, idx) => (
                <div
                  key={`${entry.filename}-${idx}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <label className="flex items-center gap-3 cursor-pointer min-w-0">
                    <input
                      type="checkbox"
                      checked={entry.include}
                      onChange={() => toggleInclude(idx)}
                      className="w-4 h-4 rounded border-plum-300 accent-plum-500"
                    />
                    <FileSpreadsheet className="w-4 h-4 text-plum-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800 truncate">{entry.filename}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Memo <span className="font-mono font-semibold">{entry.memo_number}</span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono tabular-nums">{entry.items.length}</span> baris
                        {entry.excludedReason && (
                          <span className="text-amber-700 ml-2">({entry.excludedReason})</span>
                        )}
                      </div>
                    </div>
                  </label>
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Keterangan Impor (opsional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="cth. Batch sellout Agustus dari accounting"
              className="w-full px-3.5 py-2 text-sm border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-plum-100">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-sm font-medium text-slate-700 bg-plum-50/70 hover:bg-plum-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting || activeCount === 0}
              className="h-9 px-4 text-sm font-medium text-white bg-plum-500 hover:bg-plum-600 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {submitting ? 'Mengimpor...' : `Impor ${activeCount} Memo`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

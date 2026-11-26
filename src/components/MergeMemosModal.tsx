import React, { useEffect, useMemo, useState } from 'react';
import { X, AlertCircle, Search } from 'lucide-react';
import type { Memo } from '../types.ts';
import {
  calcMemoGrandTotal,
  formatIDRInline,
  formatPeriodeShorthand,
} from '../utils/claimMath.ts';
import { SupplierAutocompleteInput } from './SupplierAutocompleteInput.tsx';

interface MergeMemosModalProps {
  open: boolean;
  memos: Memo[];
  supplierOptions: string[];
  initialSelectedIds: number[];
  onClose: () => void;
  onPreviewMerged: (config: {
    sourceMemos: Memo[];
    memoNumber: string;
    supplier: string;
    periodeStart: string;
    periodeEnd: string;
    noKontrak: string;
    combineSameKode: boolean;
  }) => void;
  onSaveMerged: (config: {
    sourceMemoIds: number[];
    memo_number: string;
    supplier: string;
    periode_start: string;
    periode_end: string;
    no_kontrak: string;
    combineSameKode: boolean;
    deleteSources: boolean;
    note: string;
  }) => Promise<void>;
}

export function MergeMemosModal({
  open,
  memos,
  supplierOptions,
  initialSelectedIds,
  onClose,
  onPreviewMerged,
  onSaveMerged,
}: MergeMemosModalProps) {
  const [selectedIds, setSelectedIds] = useState<number[]>(initialSelectedIds);
  const [memoNumber, setMemoNumber] = useState('');
  const [supplier, setSupplier] = useState('');
  const [periodeStart, setPeriodeStart] = useState('');
  const [periodeEnd, setPeriodeEnd] = useState('');
  const [noKontrak, setNoKontrak] = useState('');
  const [combineSameKode, setCombineSameKode] = useState(true);
  const [deleteSources, setDeleteSources] = useState(false);
  const [note, setNote] = useState('');
  const [memoSearch, setMemoSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelectedIds(initialSelectedIds);
    const initialMemos = memos.filter((m) => initialSelectedIds.includes(m.id));
    if (initialMemos.length > 0) {
      setMemoNumber(initialMemos.map((m) => m.memo_number).join('+'));
      setSupplier(initialMemos[0].supplier);
      setPeriodeStart(initialMemos[0].periode_start);
      setPeriodeEnd(initialMemos[initialMemos.length - 1].periode_end);
      setNoKontrak(initialMemos[0].no_kontrak);
    } else {
      setMemoNumber('');
      setSupplier('');
      setPeriodeStart('');
      setPeriodeEnd('');
      setNoKontrak('');
    }
    setMemoSearch('');
    setError('');
    setNote('');
  }, [open, initialSelectedIds, memos]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filteredList = useMemo(() => {
    const q = memoSearch.trim().toLowerCase();
    if (!q) return memos;
    return memos.filter(
      (m) =>
        selectedSet.has(m.id) ||
        m.memo_number.toLowerCase().includes(q) ||
        m.supplier.toLowerCase().includes(q)
    );
  }, [memos, memoSearch, selectedSet]);

  const selectedMemos = useMemo(
    () => memos.filter((m) => selectedSet.has(m.id)),
    [memos, selectedSet]
  );

  if (!open) return null;

  const canMerge = selectedMemos.length >= 2;

  function toggleMemo(id: number) {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      const nextMemos = memos.filter((m) => next.includes(m.id));
      if (nextMemos.length > 0) {
        setMemoNumber(nextMemos.map((m) => m.memo_number).join('+'));
        if (!supplier) setSupplier(nextMemos[0].supplier);
        if (!periodeStart) setPeriodeStart(nextMemos[0].periode_start);
        setPeriodeEnd(nextMemos[nextMemos.length - 1].periode_end);
        if (!noKontrak) setNoKontrak(nextMemos[0].no_kontrak);
      }
      return next;
    });
  }

  function handlePreview() {
    if (!canMerge) return;
    onPreviewMerged({
      sourceMemos: selectedMemos,
      memoNumber: memoNumber.trim() || selectedMemos.map((m) => m.memo_number).join('+'),
      supplier: supplier.trim(),
      periodeStart: formatPeriodeShorthand(periodeStart),
      periodeEnd: formatPeriodeShorthand(periodeEnd),
      noKontrak: noKontrak.trim(),
      combineSameKode,
    });
    onClose();
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canMerge) return;
    setSubmitting(true);
    setError('');
    try {
      await onSaveMerged({
        sourceMemoIds: selectedMemos.map((m) => m.id),
        memo_number: memoNumber.trim() || selectedMemos.map((m) => m.memo_number).join('+'),
        supplier: supplier.trim(),
        periode_start: formatPeriodeShorthand(periodeStart),
        periode_end: formatPeriodeShorthand(periodeEnd),
        no_kontrak: noKontrak.trim(),
        combineSameKode,
        deleteSources,
        note: note.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menggabungkan memo');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-plum-900/25 backdrop-blur-[1px] p-4">
      <div className="w-full max-w-2xl bg-white border border-plum-200 rounded-xl shadow-xl shadow-plum-900/10 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-plum-100 bg-plum-50/50">
          <div>
            <h2 className="text-lg font-semibold text-plum-900">
              Gabungkan Beberapa Memo ke Satu Tabel
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Pilih minimal 2 memo untuk digabung menjadi satu tabel klaim
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

        <form onSubmit={handleSave} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <label className="text-sm font-medium text-slate-700">
                Pilih Memo yang Akan Digabung ({selectedMemos.length} dipilih)
              </label>
            </div>

            <div className="relative mb-2">
              <Search className="w-4 h-4 text-plum-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={memoSearch}
                onChange={(e) => setMemoSearch(e.target.value)}
                placeholder="Cari no. memo atau supplier..."
                className="w-full h-9 pl-9 pr-3 text-sm border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
              />
            </div>

            <div className="border border-plum-200 rounded-lg divide-y divide-plum-50 max-h-48 overflow-y-auto">
              {filteredList.map((m) => {
                const checked = selectedSet.has(m.id);
                return (
                  <label
                    key={m.id}
                    className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors ${
                      checked ? 'bg-plum-50/55 hover:bg-plum-50/90' : 'hover:bg-plum-50/40'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMemo(m.id)}
                        className="w-4 h-4 rounded border-plum-300 accent-plum-500"
                      />
                      <span className="font-mono font-semibold text-plum-900">
                        {m.memo_number}
                      </span>
                      <span className="text-plum-300">·</span>
                      <span className="text-slate-600 truncate">
                        {m.supplier || 'Belum ada supplier'}
                      </span>
                    </div>
                    <span className="font-mono tabular-nums text-slate-700 shrink-0">
                      {formatIDRInline(calcMemoGrandTotal(m))}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                No. Memo Gabungan
              </label>
              <input
                type="text"
                value={memoNumber}
                onChange={(e) => setMemoNumber(e.target.value)}
                placeholder="cth. PM0801+PM0802"
                className="w-full px-3.5 py-2 text-sm font-mono border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Supplier</label>
              <SupplierAutocompleteInput
                value={supplier}
                options={supplierOptions}
                placeholder="Nama supplier"
                onChange={setSupplier}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Periode Mulai
              </label>
              <input
                type="text"
                value={periodeStart}
                onChange={(e) => setPeriodeStart(e.target.value)}
                onBlur={(e) => setPeriodeStart(formatPeriodeShorthand(e.target.value))}
                placeholder="cth. 2611 → 26 Nov 2026"
                className="w-full px-3.5 py-2 text-sm border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Periode Selesai
              </label>
              <input
                type="text"
                value={periodeEnd}
                onChange={(e) => setPeriodeEnd(e.target.value)}
                onBlur={(e) => setPeriodeEnd(formatPeriodeShorthand(e.target.value))}
                placeholder="cth. 3011 → 30 Nov 2026"
                className="w-full px-3.5 py-2 text-sm border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">No. Kontrak</label>
              <input
                type="text"
                value={noKontrak}
                onChange={(e) => setNoKontrak(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
              />
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            <label className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={combineSameKode}
                onChange={(e) => setCombineSameKode(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-plum-300 accent-plum-500"
              />
              <span>
                <strong className="font-medium text-slate-900">
                  Gabungkan SKU (Kode) yang sama
                </strong>
                <span className="block text-xs text-slate-500">
                  Jumlahkan QTY jika Kode 6 digit dan nilai diskon/rafraksi sama antar memo
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteSources}
                onChange={(e) => setDeleteSources(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-plum-300 accent-plum-500"
              />
              <span>
                <strong className="font-medium text-slate-900">
                  Hapus memo sumber setelah disimpan
                </strong>
                <span className="block text-xs text-slate-500">
                  Hanya berlaku jika disimpan permanen; riwayat perubahan tetap tersimpan
                </span>
              </span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Keterangan Penggabungan (opsional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="cth. Gabungan klaim Agustus sesuai permintaan supplier"
              className="w-full px-3.5 py-2 text-sm border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-plum-100">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-sm font-medium text-slate-700 bg-plum-50/70 hover:bg-plum-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={!canMerge}
              onClick={handlePreview}
              className="h-9 px-4 text-sm font-medium text-plum-900 bg-plum-100 hover:bg-plum-200/80 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Pratinjau &amp; Cetak
            </button>
            <button
              type="submit"
              disabled={!canMerge || submitting}
              className="h-9 px-4 text-sm font-medium text-white bg-plum-500 hover:bg-plum-600 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {submitting ? 'Menyimpan...' : 'Simpan Memo Gabungan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

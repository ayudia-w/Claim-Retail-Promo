import React, { useEffect, useMemo, useState } from 'react';
import { Printer, Search, X } from 'lucide-react';
import type { Memo } from '../types.ts';
import { calcMemoGrandTotal, formatIDRInline } from '../utils/claimMath.ts';

interface PrintMemosModalProps {
  open: boolean;
  filteredMemos: Memo[];
  allMemos: Memo[];
  initialSelectedIds: number[];
  onClose: () => void;
  onConfirmPrint: (selectedIds: number[]) => void;
}

export function PrintMemosModal({
  open,
  filteredMemos,
  allMemos,
  initialSelectedIds,
  onClose,
  onConfirmPrint,
}: PrintMemosModalProps) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [showAllMemos, setShowAllMemos] = useState(false);

  const hasExtraMemos = allMemos.length > filteredMemos.length;

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setShowAllMemos(filteredMemos.length === 0 && allMemos.length > 0);
    if (initialSelectedIds.length > 0) {
      setSelectedIds(initialSelectedIds);
    } else if (filteredMemos.length > 0) {
      setSelectedIds(filteredMemos.map((m) => m.id));
    } else {
      setSelectedIds([]);
    }
  }, [open, filteredMemos, allMemos, initialSelectedIds]);

  const baseList = showAllMemos ? allMemos : filteredMemos;

  const visibleList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return baseList;
    return baseList.filter(
      (m) =>
        m.memo_number.toLowerCase().includes(q) ||
        m.supplier.toLowerCase().includes(q) ||
        m.no_kontrak.toLowerCase().includes(q)
    );
  }, [baseList, search]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  if (!open) return null;

  const allVisibleChecked =
    visibleList.length > 0 && visibleList.every((m) => selectedSet.has(m.id));

  function toggleMemo(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleAllVisible() {
    if (allVisibleChecked) {
      const visibleSet = new Set(visibleList.map((m) => m.id));
      setSelectedIds((prev) => prev.filter((id) => !visibleSet.has(id)));
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const m of visibleList) next.add(m.id);
        return Array.from(next);
      });
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedIds.length === 0) return;
    onConfirmPrint(selectedIds);
  }

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-plum-900/25 backdrop-blur-[1px] p-4">
      <div className="w-full max-w-2xl bg-white border border-plum-200 rounded-xl shadow-xl shadow-plum-900/10 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-plum-100 bg-plum-50/50">
          <div>
            <h2 className="text-lg font-semibold text-plum-900">Pilih Memo untuk Dicetak</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Centang memo yang ingin disertakan dalam cetakan
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-plum-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari no. memo, supplier, atau kontrak..."
                className="w-full h-9 pl-9 pr-3 text-sm border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
              />
            </div>

            {visibleList.length > 0 && (
              <button
                type="button"
                onClick={toggleAllVisible}
                className="h-9 px-3.5 text-sm font-medium text-plum-800 bg-plum-50 hover:bg-plum-100 border border-plum-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {allVisibleChecked ? 'Hapus Semua' : `Pilih Semua (${visibleList.length})`}
              </button>
            )}
          </div>

          {hasExtraMemos && (
            <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showAllMemos}
                onChange={(e) => setShowAllMemos(e.target.checked)}
                className="w-4 h-4 rounded border-plum-300 accent-plum-500"
              />
              <span>Tampilkan semua memo di luar filter ({allMemos.length} memo)</span>
            </label>
          )}

          <div className="border border-plum-200 rounded-lg divide-y divide-plum-50 max-h-72 overflow-y-auto">
            {visibleList.length === 0 ? (
              <div className="px-4 py-8 text-sm text-slate-400 text-center">
                Tidak ada memo yang cocok.
              </div>
            ) : (
              visibleList.map((m) => {
                const checked = selectedSet.has(m.id);
                const isPrinted = Number(m.print_count ?? 0) > 0;
                const periodeText =
                  m.periode_start && m.periode_end
                    ? `${m.periode_start} - ${m.periode_end}`
                    : m.periode_start || m.periode_end;
                return (
                  <label
                    key={m.id}
                    className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors ${
                      checked ? 'bg-plum-50/55 hover:bg-plum-50/90' : 'hover:bg-plum-50/40'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMemo(m.id)}
                        className="w-4 h-4 rounded border-plum-300 accent-plum-500 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-semibold text-plum-900">
                            {m.memo_number}
                          </span>
                          <span className="text-plum-300">·</span>
                          <span className="text-slate-700 truncate">
                            {m.supplier || 'Belum ada supplier'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
                          {periodeText && <span>{periodeText}</span>}
                          {periodeText && <span aria-hidden="true">·</span>}
                          <span
                            className={
                              isPrinted ? 'text-plum-700 font-medium' : 'text-slate-400'
                            }
                          >
                            {isPrinted
                              ? `Sudah dicetak (${m.print_count}×)`
                              : 'Belum dicetak'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="font-mono tabular-nums text-slate-800 font-medium shrink-0">
                      {formatIDRInline(calcMemoGrandTotal(m))}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between gap-3 pt-3 border-t border-plum-100">
            <span className="text-sm text-slate-600">
              <strong className="font-mono tabular-nums text-plum-900">
                {selectedIds.length}
              </strong>{' '}
              memo siap dicetak
            </span>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 text-sm font-medium text-slate-700 bg-plum-50/70 hover:bg-plum-100 rounded-lg transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={selectedIds.length === 0}
                className="h-9 inline-flex items-center gap-2 px-4 text-sm font-medium text-white bg-plum-500 hover:bg-plum-600 disabled:opacity-45 rounded-lg transition-colors whitespace-nowrap"
              >
                <Printer className="w-4 h-4" />
                Cetak ({selectedIds.length})
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

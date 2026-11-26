import React, { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import type { MemoStatus, UserRole } from '../types.ts';
import { formatPeriodeShorthand } from '../utils/claimMath.ts';
import { SupplierAutocompleteInput } from './SupplierAutocompleteInput.tsx';

interface BulkAssignModalProps {
  open: boolean;
  userRole: UserRole;
  selectedCount: number;
  existingSuppliers: string[];
  onClose: () => void;
  onApply: (patch: {
    supplier?: string;
    periode_start?: string;
    periode_end?: string;
    no_kontrak?: string;
    status?: MemoStatus;
    note?: string;
  }) => Promise<void>;
}

export function BulkAssignModal({
  open,
  userRole,
  selectedCount,
  existingSuppliers,
  onClose,
  onApply,
}: BulkAssignModalProps) {
  const [supplier, setSupplier] = useState('');
  const [periodeStart, setPeriodeStart] = useState('');
  const [periodeEnd, setPeriodeEnd] = useState('');
  const [noKontrak, setNoKontrak] = useState('');
  const [status, setStatus] = useState<'' | MemoStatus>('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const patch: {
      supplier?: string;
      periode_start?: string;
      periode_end?: string;
      no_kontrak?: string;
      status?: MemoStatus;
      note?: string;
    } = {};

    if (supplier.trim()) patch.supplier = supplier.trim();
    if (periodeStart.trim()) patch.periode_start = formatPeriodeShorthand(periodeStart);
    if (periodeEnd.trim()) patch.periode_end = formatPeriodeShorthand(periodeEnd);
    if (noKontrak.trim()) patch.no_kontrak = noKontrak.trim();
    if (status) patch.status = status;
    if (note.trim()) patch.note = note.trim();

    if (Object.keys(patch).length === 0) {
      setError('Isi minimal satu kolom untuk diperbarui.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await onApply(patch);
      setSupplier('');
      setPeriodeStart('');
      setPeriodeEnd('');
      setNoKontrak('');
      setStatus('');
      setNote('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pembaruan massal gagal');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-plum-900/25 backdrop-blur-[1px] p-4">
      <div className="w-full max-w-lg bg-white border border-plum-200 rounded-xl shadow-xl shadow-plum-900/10 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-plum-100 bg-plum-50/50">
          <div>
            <h2 className="text-lg font-semibold text-plum-900">
              Ubah Massal {selectedCount} Memo
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Kosongkan kolom yang tidak ingin diubah
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
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Tetapkan Supplier
            </label>
            <SupplierAutocompleteInput
              value={supplier}
              options={existingSuppliers}
              placeholder="Ketik atau pilih supplier..."
              onChange={setSupplier}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
            <div className={userRole === 'admin' ? '' : 'sm:col-span-2'}>
              <label className="block text-sm font-medium text-slate-700 mb-1">No. Kontrak</label>
              <input
                type="text"
                value={noKontrak}
                onChange={(e) => setNoKontrak(e.target.value)}
                placeholder="Nomor kontrak"
                className="w-full px-3.5 py-2 text-sm border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
              />
            </div>
            {userRole === 'admin' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Verifikasi Audit
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as '' | MemoStatus)}
                  className="w-full px-3.5 py-2 text-sm border border-plum-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
                >
                  <option value="">Pertahankan</option>
                  <option value="verified">Terverifikasi (tampil ke Audit)</option>
                  <option value="draft">Belum Dicek (hanya Admin)</option>
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Keterangan Perubahan (opsional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="cth. Penetapan supplier batch Agustus"
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
              disabled={submitting}
              className="h-9 px-4 text-sm font-medium text-white bg-plum-500 hover:bg-plum-600 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {submitting ? 'Menyimpan...' : `Terapkan ke ${selectedCount} Memo`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

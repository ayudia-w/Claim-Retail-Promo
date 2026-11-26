import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Check,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { SupplierRecord } from '../types.ts';

interface SuppliersModalProps {
  open: boolean;
  suppliers: SupplierRecord[];
  authFetch: (input: string, init?: RequestInit) => Promise<Response>;
  onSuppliersChange: React.Dispatch<React.SetStateAction<SupplierRecord[]>>;
  onClose: () => void;
}

export function SuppliersModal({
  open,
  suppliers,
  authFetch,
  onSuppliersChange,
  onClose,
}: SuppliersModalProps) {
  const [newName, setNewName] = useState('');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState('');

  const filteredSuppliers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) => s.name.toLowerCase().includes(q));
  }, [suppliers, search]);

  if (!open) return null;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setError('');
    setAdding(true);
    try {
      const res = await authFetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = (await res.json()) as { supplier?: SupplierRecord; error?: string };
      if (!res.ok || !data.supplier) {
        throw new Error(data.error || 'Gagal menambah supplier');
      }
      onSuppliersChange((prev) =>
        [...prev, data.supplier!].sort((a, b) => a.name.localeCompare(b.name))
      );
      setNewName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menambah supplier');
    } finally {
      setAdding(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId === null) return;
    const trimmed = editName.trim();
    if (!trimmed) return;
    setError('');
    setSavingEdit(true);
    try {
      const res = await authFetch(`/api/suppliers/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = (await res.json()) as { supplier?: SupplierRecord; error?: string };
      if (!res.ok || !data.supplier) {
        throw new Error(data.error || 'Gagal mengubah supplier');
      }
      onSuppliersChange((prev) =>
        prev
          .map((s) => (s.id === editingId ? data.supplier! : s))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingId(null);
      setEditName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah supplier');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(id: number) {
    setError('');
    try {
      const res = await authFetch(`/api/suppliers/${id}`, {
        method: 'DELETE',
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menghapus supplier');
      }
      onSuppliersChange((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus supplier');
    }
  }

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-plum-900/25 backdrop-blur-[1px] p-4">
      <div className="w-full max-w-xl bg-white border border-plum-200 rounded-xl shadow-xl shadow-plum-900/10 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-plum-100 bg-plum-50/50">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-5 h-5 text-plum-500" />
            <div>
              <h2 className="text-lg font-semibold text-plum-900">Daftar Supplier</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Tampil sebagai pilihan dropdown saat impor Excel atau ubah supplier
              </p>
            </div>
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

        <div className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Tambah Supplier Baru */}
          <form onSubmit={handleAdd} className="flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Tambah nama supplier baru (cth. PT Indofood CBP)"
              className="flex-1 min-w-0 h-10 px-3.5 text-sm border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
            />
            <button
              type="submit"
              disabled={adding || !newName.trim()}
              className="h-10 inline-flex items-center gap-1.5 px-4 text-sm font-medium text-white bg-plum-500 hover:bg-plum-600 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              {adding ? 'Menambah...' : 'Tambah'}
            </button>
          </form>

          {/* Pencarian & Total */}
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-plum-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari di daftar supplier..."
                className="w-full h-9 pl-9 pr-3 text-sm border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
              />
            </div>
            <span className="text-xs font-medium text-plum-800 bg-plum-50 border border-plum-200/80 px-2.5 py-1.5 rounded-lg font-mono tabular-nums shrink-0">
              {suppliers.length} supplier
            </span>
          </div>

          {/* Daftar Supplier */}
          <div className="border border-plum-200 rounded-xl divide-y divide-plum-100 max-h-72 overflow-y-auto">
            {filteredSuppliers.length === 0 ? (
              <div className="px-4 py-8 text-sm text-slate-400 text-center">
                {suppliers.length === 0
                  ? 'Belum ada supplier tersimpan.'
                  : 'Tidak ada supplier yang cocok.'}
              </div>
            ) : (
              filteredSuppliers.map((sup) => (
                <div
                  key={sup.id}
                  className="px-4 py-2.5 bg-white hover:bg-plum-50/40 transition-colors"
                >
                  {editingId === sup.id ? (
                    <form onSubmit={handleSaveEdit} className="flex items-center gap-2">
                      <input
                        autoFocus
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setEditingId(null);
                            setEditName('');
                          }
                        }}
                        className="flex-1 min-w-0 h-8 px-2.5 text-sm border border-plum-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30"
                      />
                      <button
                        type="submit"
                        disabled={savingEdit || !editName.trim()}
                        className="h-8 inline-flex items-center gap-1 px-2.5 text-xs font-medium text-white bg-plum-500 hover:bg-plum-600 disabled:opacity-50 rounded-lg"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Simpan
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditName('');
                        }}
                        className="h-8 px-2.5 text-xs text-slate-600 hover:bg-plum-50 rounded-lg"
                      >
                        Batal
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-plum-900 truncate">
                        {sup.name}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(sup.id);
                            setEditName(sup.name);
                            setError('');
                          }}
                          className="p-1.5 text-plum-500 hover:text-plum-800 hover:bg-plum-100/70 rounded-lg transition-colors"
                          title="Ubah nama supplier"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(sup.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Hapus supplier"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

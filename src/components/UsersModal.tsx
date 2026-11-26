import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, Pencil, UserPlus, Users, X } from 'lucide-react';
import type { AuthUser, UserRole } from '../types.ts';

interface UsersModalProps {
  open: boolean;
  currentUser: AuthUser;
  authFetch: (input: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
}

export function UsersModal({ open, currentUser, authFetch, onClose }: UsersModalProps) {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form tambah pengguna
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('audit');
  const [newPassword, setNewPassword] = useState('');
  const [adding, setAdding] = useState(false);

  // State edit pengguna
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('audit');
  const [editActive, setEditActive] = useState(true);
  const [editPassword, setEditPassword] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await authFetch('/api/users');
      const data = (await res.json()) as { users?: AuthUser[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Gagal memuat user');
      setUsers(data.users ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat user');
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    if (open) {
      setEditingId(null);
      setError('');
      loadUsers();
    }
  }, [open, loadUsers]);

  if (!open) return null;

  function startEdit(user: AuthUser) {
    setEditingId(user.id);
    setEditDisplayName(user.display_name);
    setEditRole(user.role);
    setEditActive(user.is_active);
    setEditPassword('');
    setError('');
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setAdding(true);
    try {
      const res = await authFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername.trim(),
          display_name: newDisplayName.trim() || newUsername.trim(),
          role: newRole,
          password: newPassword,
        }),
      });
      const data = (await res.json()) as { user?: AuthUser; error?: string };
      if (!res.ok || !data.user) throw new Error(data.error || 'Gagal menambah user');
      setUsers((prev) => [...prev, data.user!]);
      setNewUsername('');
      setNewDisplayName('');
      setNewRole('audit');
      setNewPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menambah user');
    } finally {
      setAdding(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId === null) return;
    setError('');
    setSavingEdit(true);
    try {
      const res = await authFetch(`/api/users/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: editDisplayName.trim(),
          role: editRole,
          is_active: editActive,
          password: editPassword || undefined,
        }),
      });
      const data = (await res.json()) as { user?: AuthUser; error?: string };
      if (!res.ok || !data.user) throw new Error(data.error || 'Gagal memperbarui user');
      setUsers((prev) => prev.map((u) => (u.id === editingId ? data.user! : u)));
      setEditingId(null);
      setEditPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui user');
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-plum-900/25 backdrop-blur-[1px] p-4">
      <div className="w-full max-w-2xl bg-white border border-plum-200 rounded-xl shadow-xl shadow-plum-900/10 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-plum-100 bg-plum-50/50">
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-plum-500" />
            <div>
              <h2 className="text-lg font-semibold text-plum-900">Kelola User</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Admin memiliki akses penuh; Audit hanya melihat memo yang sudah diverifikasi
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

        <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Daftar User */}
          <div className="border border-plum-200 rounded-xl divide-y divide-plum-100 overflow-hidden">
            {loading ? (
              <div className="px-4 py-6 text-sm text-slate-500 text-center">
                Memuat daftar user...
              </div>
            ) : users.length === 0 ? (
              <div className="px-4 py-6 text-sm text-slate-400 text-center">
                Belum ada user.
              </div>
            ) : (
              users.map((u) => (
                <div key={u.id} className="px-4 py-3 bg-white">
                  {editingId === u.id ? (
                    <form onSubmit={handleSaveEdit} className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>
                          Ubah akun <strong className="font-mono text-plum-900">@{u.username}</strong>
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Nama Tampilan
                          </label>
                          <input
                            type="text"
                            required
                            value={editDisplayName}
                            onChange={(e) => setEditDisplayName(e.target.value)}
                            className="w-full h-9 px-3 text-sm border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Peran
                          </label>
                          <select
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value as UserRole)}
                            className="w-full h-9 px-3 text-sm border border-plum-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
                          >
                            <option value="admin">Admin</option>
                            <option value="audit">Audit</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Password Baru (opsional)
                          </label>
                          <input
                            type="password"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            placeholder="Kosongkan jika tetap"
                            className="w-full h-9 px-3 text-sm border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editActive}
                            disabled={u.id === currentUser.id}
                            onChange={(e) => setEditActive(e.target.checked)}
                            className="w-4 h-4 rounded border-plum-300 accent-plum-500"
                          />
                          <span>Akun Aktif</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="h-8 px-3 text-xs font-medium text-slate-700 bg-plum-50 hover:bg-plum-100 rounded-lg transition-colors"
                          >
                            Batal
                          </button>
                          <button
                            type="submit"
                            disabled={savingEdit}
                            className="h-8 inline-flex items-center gap-1 px-3 text-xs font-medium text-white bg-plum-500 hover:bg-plum-600 disabled:opacity-50 rounded-lg transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            {savingEdit ? 'Menyimpan...' : 'Simpan'}
                          </button>
                        </div>
                      </div>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-plum-900">
                            {u.display_name}
                          </span>
                          <span className="font-mono text-xs text-slate-500">@{u.username}</span>
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                              u.role === 'admin'
                                ? 'bg-plum-100 text-plum-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {u.role === 'admin' ? 'Admin' : 'Audit'}
                          </span>
                          {!u.is_active && (
                            <span className="text-xs text-rose-600 font-medium">Nonaktif</span>
                          )}
                          {u.id === currentUser.id && (
                            <span className="text-xs text-plum-600 font-medium">(Anda)</span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => startEdit(u)}
                        className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium text-plum-800 bg-plum-50 hover:bg-plum-100 border border-plum-200 rounded-lg transition-colors shrink-0"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Ubah
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Tambah User Baru */}
          <form
            onSubmit={handleAddUser}
            className="bg-plum-50/50 border border-plum-200/80 rounded-xl p-4 space-y-3"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-plum-900">
              <UserPlus className="w-4 h-4 text-plum-500" />
              <span>Tambah User Baru</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="cth. audit2"
                  className="w-full h-9 px-3 text-sm bg-white border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Nama Tampilan
                </label>
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="cth. Staf Audit"
                  className="w-full h-9 px-3 text-sm bg-white border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Peran</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full h-9 px-3 text-sm bg-white border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
                >
                  <option value="audit">Audit (lihat memo terverifikasi &amp; cetak)</option>
                  <option value="admin">Admin (akses penuh &amp; kelola user)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Password (min. 6 karakter)
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full h-9 px-3 text-sm bg-white border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={adding || !newUsername.trim() || newPassword.length < 6}
                className="h-9 inline-flex items-center gap-1.5 px-4 text-sm font-medium text-white bg-plum-500 hover:bg-plum-600 disabled:opacity-50 rounded-lg transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                {adding ? 'Menambahkan...' : 'Tambah User'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

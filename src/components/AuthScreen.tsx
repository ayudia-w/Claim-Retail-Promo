import React, { useState } from 'react';
import { AlertCircle, BadgePercent, Eye, EyeOff, Lock, UserPlus } from 'lucide-react';
import type { AuthUser } from '../types.ts';

interface AuthScreenProps {
  initialized: boolean;
  onAuthenticated: (token: string, user: AuthUser) => void;
}

export function AuthScreen({ initialized, onAuthenticated }: AuthScreenProps) {
  // Login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // First-run setup state
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminDisplayName, setAdminDisplayName] = useState('Admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [includeAudit, setIncludeAudit] = useState(true);
  const [auditUsername, setAuditUsername] = useState('audit');
  const [auditDisplayName, setAuditDisplayName] = useState('Audit');
  const [auditPassword, setAuditPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });
      const data = (await res.json()) as { token?: string; user?: AuthUser; error?: string };
      if (!res.ok || !data.token || !data.user) {
        throw new Error(data.error || 'Gagal log in');
      }
      onAuthenticated(data.token, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal log in');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBootstrapSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload: {
        admin: { username: string; display_name: string; password: string };
        audit?: { username: string; display_name: string; password: string };
      } = {
        admin: {
          username: adminUsername.trim(),
          display_name: adminDisplayName.trim() || adminUsername.trim(),
          password: adminPassword,
        },
      };

      if (includeAudit && (auditUsername.trim() || auditPassword)) {
        payload.audit = {
          username: auditUsername.trim(),
          display_name: auditDisplayName.trim() || auditUsername.trim(),
          password: auditPassword,
        };
      }

      const res = await fetch('/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { token?: string; user?: AuthUser; error?: string };
      if (!res.ok || !data.token || !data.user) {
        throw new Error(data.error || 'Gagal membuat akun awal');
      }
      onAuthenticated(data.token, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat akun awal');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf7fc] px-4 py-10">
      <div className="w-full max-w-md bg-white border border-plum-200 rounded-2xl shadow-lg shadow-plum-900/5 overflow-hidden">
        <div className="px-6 py-5 border-b border-plum-100 bg-plum-50/70 flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-plum-100 text-plum-600 flex items-center justify-center shrink-0">
            <BadgePercent className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-lg font-bold text-plum-900 font-display">Sell Out Promo</h1>
            <p className="text-sm text-slate-600">
              {initialized
                ? 'Private property of 361'
                : 'Pengaturan akun awal Admin & Audit'}
            </p>
          </div>
        </div>

        {initialized ? (
          <form onSubmit={handleLoginSubmit} className="p-6 space-y-4">
            <div>
              <label
                htmlFor="login-username"
                className="block text-sm font-medium text-plum-900 mb-1.5"
              >
                Username
              </label>
              <input
                id="login-username"
                type="text"
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan username"
                className="w-full h-10 px-3.5 text-sm border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-sm font-medium text-plum-900 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password"
                  className="w-full h-10 pl-3.5 pr-10 text-sm border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-plum-400 hover:text-plum-700 rounded"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-2.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !username.trim() || !password}
              className="w-full h-10 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-plum-500 hover:bg-plum-600 disabled:opacity-50 rounded-lg transition-colors"
            >
              <Lock className="w-4 h-4" />
              {submitting ? 'Memeriksa...' : 'Log In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleBootstrapSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
            <div className="space-y-3">
              <div className="text-sm font-semibold text-plum-900">
                1. Akun Admin (Akses Penuh &amp; Kelola User)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    placeholder="admin"
                    className="w-full h-9 px-3 text-sm border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Nama Tampilan
                  </label>
                  <input
                    type="text"
                    value={adminDisplayName}
                    onChange={(e) => setAdminDisplayName(e.target.value)}
                    placeholder="Admin"
                    className="w-full h-9 px-3 text-sm border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Password Admin (minimal 6 karakter)
                </label>
                <input
                  type="password"
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Buat password Admin"
                  className="w-full h-9 px-3 text-sm border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-plum-100 space-y-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-plum-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAudit}
                  onChange={(e) => setIncludeAudit(e.target.checked)}
                  className="w-4 h-4 rounded border-plum-300 accent-plum-500"
                />
                <span>2. Sekaligus Buat Akun Audit</span>
              </label>

              {includeAudit && (
                <div className="space-y-3 pl-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Username Audit
                      </label>
                      <input
                        type="text"
                        value={auditUsername}
                        onChange={(e) => setAuditUsername(e.target.value)}
                        placeholder="audit"
                        className="w-full h-9 px-3 text-sm border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Nama Tampilan
                      </label>
                      <input
                        type="text"
                        value={auditDisplayName}
                        onChange={(e) => setAuditDisplayName(e.target.value)}
                        placeholder="Audit"
                        className="w-full h-9 px-3 text-sm border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Password Audit (minimal 6 karakter)
                    </label>
                    <input
                      type="password"
                      value={auditPassword}
                      onChange={(e) => setAuditPassword(e.target.value)}
                      placeholder="Buat password Audit"
                      className="w-full h-9 px-3 text-sm border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
                    />
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-2.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !adminUsername.trim() || adminPassword.length < 6}
              className="w-full h-10 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-plum-500 hover:bg-plum-600 disabled:opacity-50 rounded-lg transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              {submitting ? 'Menyimpan...' : 'Simpan & Log In sebagai Admin'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

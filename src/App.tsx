import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgePercent,
  Building2,
  ChevronDown,
  FileSpreadsheet,
  GitMerge,
  LogOut,
  Printer,
  Users,
} from 'lucide-react';
import type {
  AuthUser,
  ClaimMode,
  Memo,
  MemoItem,
  MemoStatus,
  SupplierRecord,
} from './types.ts';
import { buildMergedPreviewMemo } from './utils/claimMath.ts';
import { ExcelSheetMemo } from './components/ExcelSheetMemo.tsx';
import { ImportExcelModal } from './components/ImportExcelModal.tsx';
import { MergeMemosModal } from './components/MergeMemosModal.tsx';
import { BulkAssignModal } from './components/BulkAssignModal.tsx';
import { PrintMemosModal } from './components/PrintMemosModal.tsx';
import { AuthScreen } from './components/AuthScreen.tsx';
import { UsersModal } from './components/UsersModal.tsx';
import { SuppliersModal } from './components/SuppliersModal.tsx';
import {
  SupplierCombobox,
  type SupplierOption,
} from './components/SupplierCombobox.tsx';

const UNASSIGNED_KEY = '__UNASSIGNED__';

const MONTH_OPTIONS = [
  { value: '1', label: 'Januari' },
  { value: '2', label: 'Februari' },
  { value: '3', label: 'Maret' },
  { value: '4', label: 'April' },
  { value: '5', label: 'Mei' },
  { value: '6', label: 'Juni' },
  { value: '7', label: 'Juli' },
  { value: '8', label: 'Agustus' },
  { value: '9', label: 'September' },
  { value: '10', label: 'Oktober' },
  { value: '11', label: 'November' },
  { value: '12', label: 'Desember' },
];

const MONTH_NAME_MAP: Record<string, number> = {
  jan: 1,
  januari: 1,
  january: 1,
  feb: 2,
  peb: 2,
  februari: 2,
  pebruari: 2,
  february: 2,
  mar: 3,
  maret: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  mei: 5,
  jun: 6,
  juni: 6,
  june: 6,
  jul: 7,
  juli: 7,
  july: 7,
  aug: 8,
  agu: 8,
  ags: 8,
  agustus: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  okt: 10,
  oktober: 10,
  october: 10,
  nov: 11,
  nop: 11,
  november: 11,
  nopember: 11,
  dec: 12,
  des: 12,
  desember: 12,
  december: 12,
};

function getSupplierKey(supplier: string): string {
  const trimmed = supplier.trim();
  return trimmed ? trimmed : UNASSIGNED_KEY;
}

function getSupplierLabel(key: string): string {
  return key === UNASSIGNED_KEY ? 'Belum Ada Supplier' : key;
}

function parseMonthYearFromText(raw: string): { month: number | null; year: number | null } {
  const text = raw.trim();
  if (!text) return { month: null, year: null };

  // Format nama bulan + tahun (contoh: "01 Aug 2026", "Agu 2026", "November 2026")
  const wordMatch = text.match(/([A-Za-z]+)\s+(\d{4})/);
  if (wordMatch) {
    const m = MONTH_NAME_MAP[wordMatch[1].toLowerCase()] ?? null;
    const y = Number(wordMatch[2]);
    if (m && Number.isFinite(y)) return { month: m, year: y };
  }

  // Format ISO YYYY-MM-DD
  const isoMatch = text.match(/(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    if (m >= 1 && m <= 12) return { month: m, year: y };
  }

  // Format DD/MM/YYYY atau DD-MM-YYYY
  const dmyMatch = text.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (dmyMatch) {
    const m = Number(dmyMatch[2]);
    let y = Number(dmyMatch[3]);
    if (y < 100) y += 2000;
    if (m >= 1 && m <= 12) return { month: m, year: y };
  }

  // Fallback tahun 4 digit saja
  const yearOnly = text.match(/\b(20\d{2}|19\d{2})\b/);
  return {
    month: null,
    year: yearOnly ? Number(yearOnly[1]) : null,
  };
}

function extractMemoMonthYear(memo: Memo): { month: number | null; year: number | null } {
  const start = parseMonthYearFromText(memo.periode_start);
  if (start.month || start.year) return start;
  return parseMonthYearFromText(memo.periode_end);
}

function getDefaultLastMonthPeriod(): { month: string; year: string } {
  const now = new Date();
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return {
    month: String(lastMonthDate.getMonth() + 1),
    year: String(lastMonthDate.getFullYear()),
  };
}

export default function App() {
  // Token sesi disimpan hanya di memori React (tidak di localStorage/sessionStorage)
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authInitialized, setAuthInitialized] = useState<boolean | null>(null);

  const [memos, setMemos] = useState<Memo[]>([]);
  const [masterSuppliers, setMasterSuppliers] = useState<SupplierRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filter utama: Supplier & Periode (default: Semua Supplier, bulan lalu)
  const [supplierFilter, setSupplierFilter] = useState<string>('ALL');
  const [monthFilter, setMonthFilter] = useState<string>(
    () => getDefaultLastMonthPeriod().month
  );
  const [yearFilter, setYearFilter] = useState<string>(
    () => getDefaultLastMonthPeriod().year
  );

  const [checkedMemoIds, setCheckedMemoIds] = useState<number[]>([]);
  const [visibleLimit, setVisibleLimit] = useState(20);

  const [importOpen, setImportOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const [printSelectedIds, setPrintSelectedIds] = useState<number[] | null>(null);

  const [mergedPreview, setMergedPreview] = useState<{
    memo: Memo;
    sourceMemoIds: number[];
    combineSameKode: boolean;
  } | null>(null);

  const checkAuthStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = (await res.json()) as { initialized?: boolean };
      setAuthInitialized(Boolean(data.initialized));
    } catch {
      setAuthInitialized(true);
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const authFetch = useCallback(
    async (input: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      const res = await fetch(input, { ...init, headers });
      if (res.status === 401) {
        setToken(null);
        setCurrentUser(null);
        setMemos([]);
      }
      return res;
    },
    [token]
  );

  const loadMemos = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setError('');
      const res = await authFetch('/api/memos');
      if (!res.ok) {
        if (res.status === 401) return;
        throw new Error('Gagal memuat data memo');
      }
      const data = (await res.json()) as { memos: Memo[] };
      setMemos(data.memos);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Tidak dapat terhubung ke database lokal'
      );
    } finally {
      setLoading(false);
    }
  }, [token, authFetch]);

  const loadSuppliers = useCallback(async () => {
    if (!token) return;
    try {
      const res = await authFetch('/api/suppliers');
      if (!res.ok) return;
      const data = (await res.json()) as { suppliers?: SupplierRecord[] };
      setMasterSuppliers(data.suppliers ?? []);
    } catch {
      // Abaikan error sementara saat memuat daftar supplier
    }
  }, [token, authFetch]);

  useEffect(() => {
    if (token) {
      loadMemos();
      loadSuppliers();
    }
  }, [token, loadMemos, loadSuppliers]);

  useEffect(() => {
    function handleAfterPrint() {
      setPrintSelectedIds(null);
    }
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  async function handleLogout() {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Abaikan error logout
    }
    setToken(null);
    setCurrentUser(null);
    setMemos([]);
    setMasterSuppliers([]);
    setCheckedMemoIds([]);
    setMergedPreview(null);
    setUsersOpen(false);
    setSuppliersOpen(false);
    checkAuthStatus();
  }

  // Daftar opsi Supplier untuk 100+ supplier
  const supplierOptions = useMemo<SupplierOption[]>(() => {
    const keys = new Set<string>();
    for (const m of memos) {
      keys.add(getSupplierKey(m.supplier));
    }
    return Array.from(keys)
      .map((key) => ({
        key,
        label: getSupplierLabel(key),
      }))
      .sort((a, b) => {
        if (a.key === UNASSIGNED_KEY) return -1;
        if (b.key === UNASSIGNED_KEY) return 1;
        return a.label.localeCompare(b.label);
      });
  }, [memos]);

  const existingSuppliers = useMemo(
    () =>
      supplierOptions
        .filter((o) => o.key !== UNASSIGNED_KEY)
        .map((o) => o.label),
    [supplierOptions]
  );

  // Gabungan daftar master supplier (Admin) + supplier yang sudah ada di memo
  const supplierSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const combined: string[] = [];
    for (const sup of masterSuppliers) {
      const trimmed = sup.name.trim();
      const key = trimmed.toLowerCase();
      if (trimmed && !seen.has(key)) {
        seen.add(key);
        combined.push(trimmed);
      }
    }
    for (const supName of existingSuppliers) {
      const trimmed = supName.trim();
      const key = trimmed.toLowerCase();
      if (trimmed && !seen.has(key)) {
        seen.add(key);
        combined.push(trimmed);
      }
    }
    return combined.sort((a, b) => a.localeCompare(b));
  }, [masterSuppliers, existingSuppliers]);

  // Daftar opsi Tahun (selalu menyertakan tahun saat ini & tahun bulan lalu)
  const availableYears = useMemo(() => {
    const years = new Set<number>([
      new Date().getFullYear(),
      Number(getDefaultLastMonthPeriod().year),
    ]);
    for (const m of memos) {
      const { year } = extractMemoMonthYear(m);
      if (year) years.add(year);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [memos]);

  // Memo yang cocok dengan filter Supplier, Bulan, & Tahun
  const filteredMemos = useMemo(() => {
    return memos.filter((m) => {
      if (supplierFilter !== 'ALL' && getSupplierKey(m.supplier) !== supplierFilter) {
        return false;
      }
      if (monthFilter !== 'ALL' || yearFilter !== 'ALL') {
        const { month, year } = extractMemoMonthYear(m);
        if (monthFilter !== 'ALL' && month !== Number(monthFilter)) {
          return false;
        }
        if (yearFilter !== 'ALL' && year !== Number(yearFilter)) {
          return false;
        }
      }
      return true;
    });
  }, [memos, supplierFilter, monthFilter, yearFilter]);

  const checkedSet = useMemo(() => new Set(checkedMemoIds), [checkedMemoIds]);

  const checkedInFiltered = useMemo(
    () => filteredMemos.filter((m) => checkedSet.has(m.id)),
    [filteredMemos, checkedSet]
  );

  const allFilteredChecked =
    filteredMemos.length > 0 &&
    filteredMemos.every((m) => checkedSet.has(m.id));

  const toggleSelectAllFiltered = useCallback(() => {
    const filteredIds = filteredMemos.map((m) => m.id);
    if (allFilteredChecked) {
      const filteredSet = new Set(filteredIds);
      setCheckedMemoIds((prev) => prev.filter((id) => !filteredSet.has(id)));
    } else {
      setCheckedMemoIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  }, [filteredMemos, allFilteredChecked]);

  function handlePrint() {
    if (mergedPreview) {
      setTimeout(() => window.print(), 40);
      return;
    }
    setPrintModalOpen(true);
  }

  async function handleConfirmPrint(selectedIds: number[]) {
    setPrintSelectedIds(selectedIds);
    setPrintModalOpen(false);
    setVisibleLimit(9999);

    try {
      const res = await authFetch('/api/memos/mark-printed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memoIds: selectedIds }),
      });
      if (res.ok) {
        const data = (await res.json()) as { memos: Memo[] };
        setMemos(data.memos);
      }
    } catch {
      // Tetap lanjut mencetak walau pencatatan riwayat gagal sementara
    }

    setTimeout(() => window.print(), 100);
  }

  async function handleImportMemos(payload: {
    memos: Array<{
      memo_number: string;
      mode: ClaimMode;
      supplier: string;
      periode_start: string;
      periode_end: string;
      no_kontrak: string;
      source_filename: string;
      items: Array<{
        kode: string;
        nama: string;
        qty: number;
        discount_type: 'potongan' | 'rafraksi';
        diskon_satuan: number;
        harga_satuan: number;
        rafraksi_pct: number;
      }>;
    }>;
    note: string;
  }) {
    const res = await authFetch('/api/memos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        note: payload.note,
        memos: payload.memos,
      }),
    });
    if (!res.ok) {
      const errData = (await res.json()) as { error?: string };
      throw new Error(errData.error || 'Impor gagal');
    }
    const data = (await res.json()) as { memos: Memo[] };
    await loadMemos();
    if (data.memos[0]) {
      setSupplierFilter(getSupplierKey(data.memos[0].supplier));
      const { month, year } = extractMemoMonthYear(data.memos[0]);
      setMonthFilter(month ? String(month) : 'ALL');
      setYearFilter(year ? String(year) : 'ALL');
    }
  }

  async function handleBulkApply(patch: {
    supplier?: string;
    periode_start?: string;
    periode_end?: string;
    no_kontrak?: string;
    status?: MemoStatus;
    note?: string;
  }) {
    const res = await authFetch('/api/memos/bulk-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memoIds: checkedMemoIds,
        ...patch,
      }),
    });
    if (!res.ok) {
      const errData = (await res.json()) as { error?: string };
      throw new Error(errData.error || 'Pembaruan massal gagal');
    }
    const data = (await res.json()) as { memos: Memo[] };
    setMemos(data.memos);
    if (patch.supplier) {
      setSupplierFilter(getSupplierKey(patch.supplier));
    }
    setCheckedMemoIds([]);
  }

  const handleUpdateHeader = useCallback(
    async (
      memoId: number,
      patch: Partial<
        Pick<
          Memo,
          'memo_number' | 'supplier' | 'periode_start' | 'periode_end' | 'no_kontrak' | 'status'
        >
      >
    ) => {
      const res = await authFetch(`/api/memos/${memoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { memo: Memo };
      setMemos((prev) => prev.map((m) => (m.id === memoId ? data.memo : m)));
      if (patch.supplier !== undefined && supplierFilter !== 'ALL') {
        setSupplierFilter(getSupplierKey(data.memo.supplier));
      }
    },
    [authFetch, supplierFilter]
  );

  const handleUpdateItem = useCallback(
    async (
      itemId: number,
      patch: Partial<
        Pick<
          MemoItem,
          | 'kode'
          | 'nama'
          | 'qty'
          | 'discount_type'
          | 'diskon_satuan'
          | 'harga_satuan'
          | 'rafraksi_pct'
        >
      >
    ) => {
      const res = await authFetch(`/api/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { item: MemoItem; memo?: Memo | null };
      if (data.memo) {
        setMemos((prev) => prev.map((m) => (m.id === data.memo!.id ? data.memo! : m)));
      } else {
        setMemos((prev) =>
          prev.map((m) =>
            m.id === data.item.memo_id
              ? {
                  ...m,
                  items: m.items.map((it) => (it.id === itemId ? data.item : it)),
                }
              : m
          )
        );
      }
    },
    [authFetch]
  );

  const handleAddItem = useCallback(
    async (memoId: number) => {
      const res = await authFetch(`/api/memos/${memoId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kode: '',
          nama: '',
          qty: 0,
          diskon_satuan: 0,
          harga_satuan: 0,
          rafraksi_pct: 0,
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { item: MemoItem; memo?: Memo | null };
      if (data.memo) {
        setMemos((prev) => prev.map((m) => (m.id === memoId ? data.memo! : m)));
      } else {
        setMemos((prev) =>
          prev.map((m) => (m.id === memoId ? { ...m, items: [...m.items, data.item] } : m))
        );
      }
    },
    [authFetch]
  );

  const handleDeleteItem = useCallback(
    async (itemId: number) => {
      const res = await authFetch(`/api/items/${itemId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { ok: boolean; memo?: Memo | null };
      if (data.memo) {
        setMemos((prev) => prev.map((m) => (m.id === data.memo!.id ? data.memo! : m)));
      } else {
        setMemos((prev) =>
          prev.map((m) => ({
            ...m,
            items: m.items.filter((it) => it.id !== itemId),
          }))
        );
      }
    },
    [authFetch]
  );

  const handleDeleteMemo = useCallback(
    async (memoId: number) => {
      const res = await authFetch(`/api/memos/${memoId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return;
      setCheckedMemoIds((prev) => prev.filter((id) => id !== memoId));
      setMemos((prev) => prev.filter((m) => m.id !== memoId));
    },
    [authFetch]
  );

  const handleAddComment = useCallback(
    async (memoId: number, comment: string) => {
      const res = await authFetch(`/api/memos/${memoId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { memo?: Memo | null };
      if (data.memo) {
        setMemos((prev) => prev.map((m) => (m.id === memoId ? data.memo! : m)));
      }
    },
    [authFetch]
  );

  const handleDeleteComment = useCallback(
    async (commentId: number) => {
      const res = await authFetch(`/api/comments/${commentId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { ok: boolean; memo?: Memo | null };
      if (data.memo) {
        setMemos((prev) => prev.map((m) => (m.id === data.memo!.id ? data.memo! : m)));
      } else {
        setMemos((prev) =>
          prev.map((m) => ({
            ...m,
            comments: (m.comments ?? []).filter((c) => c.id !== commentId),
          }))
        );
      }
    },
    [authFetch]
  );

  function handlePreviewMerged(config: {
    sourceMemos: Memo[];
    memoNumber: string;
    supplier: string;
    periodeStart: string;
    periodeEnd: string;
    noKontrak: string;
    combineSameKode: boolean;
  }) {
    const previewMemo = buildMergedPreviewMemo(config.sourceMemos, {
      memoNumber: config.memoNumber,
      supplier: config.supplier,
      periodeStart: config.periodeStart,
      periodeEnd: config.periodeEnd,
      noKontrak: config.noKontrak,
      combineSameKode: config.combineSameKode,
    });
    setMergedPreview({
      memo: previewMemo,
      sourceMemoIds: config.sourceMemos.map((m) => m.id),
      combineSameKode: config.combineSameKode,
    });
  }

  async function handleSaveMerged(config: {
    sourceMemoIds: number[];
    memo_number: string;
    supplier: string;
    periode_start: string;
    periode_end: string;
    no_kontrak: string;
    combineSameKode: boolean;
    deleteSources: boolean;
    note: string;
  }) {
    const res = await authFetch('/api/memos/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) {
      const errData = (await res.json()) as { error?: string };
      throw new Error(errData.error || 'Gagal menggabungkan memo');
    }
    const data = (await res.json()) as { memo: Memo };
    setCheckedMemoIds([]);
    setMergedPreview(null);
    await loadMemos();
    setSupplierFilter(getSupplierKey(data.memo.supplier));
    const { month, year } = extractMemoMonthYear(data.memo);
    setMonthFilter(month ? String(month) : 'ALL');
    setYearFilter(year ? String(year) : 'ALL');
  }

  const displayedMemos = useMemo(
    () => filteredMemos.slice(0, visibleLimit),
    [filteredMemos, visibleLimit]
  );

  const printSelectedSet = useMemo(
    () => (printSelectedIds !== null ? new Set(printSelectedIds) : null),
    [printSelectedIds]
  );

  const extraPrintMemos = useMemo(() => {
    if (!printSelectedSet) return [];
    const displayedIds = new Set(displayedMemos.map((d) => d.id));
    return memos.filter((m) => printSelectedSet.has(m.id) && !displayedIds.has(m.id));
  }, [memos, displayedMemos, printSelectedSet]);

  if (authInitialized === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf7fc] text-plum-800 text-sm">
        Memuat Sell Out Promo...
      </div>
    );
  }

  if (!token || !currentUser) {
    return (
      <AuthScreen
        initialized={authInitialized}
        onAuthenticated={(newToken, user) => {
          setToken(newToken);
          setCurrentUser(user);
          setAuthInitialized(true);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#faf7fc] text-slate-900 print:min-h-0 print:block print:bg-white">
      {/* Header Atas Sederhana Tanpa Tab */}
      <header className="no-print sticky top-0 z-30 bg-white/90 backdrop-blur-sm border-b border-plum-100 px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="w-8 h-8 rounded-xl bg-plum-100 text-plum-600 flex items-center justify-center shrink-0">
            <BadgePercent className="w-4 h-4" />
          </span>
          <span className="text-lg font-bold tracking-tight text-plum-900 whitespace-nowrap font-display">
            Sell Out Promo
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="h-9 inline-flex items-center gap-2 px-3 text-sm bg-plum-50/80 border border-plum-200/70 rounded-lg text-plum-900">
            <span className="font-medium truncate max-w-[140px]">
              {currentUser.display_name}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-plum-100 text-plum-700 font-semibold">
              {currentUser.role === 'admin' ? 'Admin' : 'Audit'}
            </span>
          </div>

          {currentUser.role === 'admin' && (
            <>
              <button
                type="button"
                onClick={() => setSuppliersOpen(true)}
                className="h-9 inline-flex items-center gap-1.5 px-3 text-sm font-medium text-plum-800 bg-white hover:bg-plum-50 border border-plum-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Building2 className="w-4 h-4" />
                Supplier
              </button>
              <button
                type="button"
                onClick={() => setUsersOpen(true)}
                className="h-9 inline-flex items-center gap-1.5 px-3 text-sm font-medium text-plum-800 bg-white hover:bg-plum-50 border border-plum-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Users className="w-4 h-4" />
                User
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleLogout}
            className="h-9 inline-flex items-center gap-1.5 px-3 text-sm font-medium text-slate-600 hover:text-plum-900 hover:bg-plum-50 border border-plum-200/70 rounded-lg transition-colors whitespace-nowrap shrink-0"
            title="Log out dari akun"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </button>
        </div>
      </header>

      {/* Kontainer Utama */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-6 py-6 space-y-5 print:max-w-none print:p-0 print:m-0 print:space-y-0">
        {/* Bagian Filter Supplier & Periode (Bulan + Tahun) + Aksi */}
        <section className="no-print bg-white border border-plum-200/80 rounded-xl p-5 shadow-xs shadow-plum-900/[0.02] space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            {/* Filter Utama: Supplier, Bulan, & Tahun */}
            <div className="flex flex-wrap items-end gap-3.5 flex-1">
              <div>
                <label className="block text-sm font-semibold text-plum-900 mb-1.5">
                  Supplier
                </label>
                <SupplierCombobox
                  value={supplierFilter}
                  options={supplierOptions}
                  unassignedKey={UNASSIGNED_KEY}
                  onChange={(next) => {
                    setSupplierFilter(next);
                    setVisibleLimit(20);
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="month-filter-select"
                  className="block text-sm font-semibold text-plum-900 mb-1.5"
                >
                  Bulan
                </label>
                <div className="relative">
                  <select
                    id="month-filter-select"
                    value={monthFilter}
                    onChange={(e) => {
                      setMonthFilter(e.target.value);
                      setVisibleLimit(20);
                    }}
                    className="h-10 appearance-none pl-3.5 pr-9 text-sm font-medium border border-plum-200 hover:border-plum-300 rounded-lg bg-white text-slate-800 min-w-[160px] focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400 transition-colors cursor-pointer"
                  >
                    <option value="ALL">Semua Bulan</option>
                    {MONTH_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-plum-400 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div>
                <label
                  htmlFor="year-filter-select"
                  className="block text-sm font-semibold text-plum-900 mb-1.5"
                >
                  Tahun
                </label>
                <div className="relative">
                  <select
                    id="year-filter-select"
                    value={yearFilter}
                    onChange={(e) => {
                      setYearFilter(e.target.value);
                      setVisibleLimit(20);
                    }}
                    className="h-10 appearance-none pl-3.5 pr-9 text-sm font-medium border border-plum-200 hover:border-plum-300 rounded-lg bg-white text-slate-800 min-w-[130px] focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400 transition-colors cursor-pointer"
                  >
                    <option value="ALL">Semua Tahun</option>
                    {availableYears.map((yr) => (
                      <option key={yr} value={String(yr)}>
                        {yr}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-plum-400 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>
            </div>

            {/* Tombol Aksi Utama: Impor Excel (Admin) & Cetak */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {currentUser.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => setImportOpen(true)}
                  className="h-10 inline-flex items-center gap-1.5 px-4 text-sm font-medium text-plum-800 bg-plum-100/80 hover:bg-plum-200/75 border border-plum-200/80 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Impor Excel
                </button>
              )}

              <button
                type="button"
                onClick={handlePrint}
                disabled={!mergedPreview && memos.length === 0}
                className="h-10 inline-flex items-center gap-1.5 px-4 text-sm font-medium text-white bg-plum-500 hover:bg-plum-600 disabled:opacity-45 rounded-lg shadow-xs transition-colors whitespace-nowrap shrink-0"
              >
                <Printer className="w-4 h-4" />
                {mergedPreview ? 'Cetak Tabel Gabungan' : 'Cetak'}
              </button>
            </div>
          </div>

          {/* Baris Tombol Pilih Semua + Jumlah Memo (kiri) & Gabungkan Memo (kanan) */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-3.5 border-t border-plum-100">
            <div className="flex flex-wrap items-center gap-3">
              {filteredMemos.length > 0 && !mergedPreview && (
                <button
                  type="button"
                  onClick={toggleSelectAllFiltered}
                  className="h-9 inline-flex items-center px-3.5 text-sm font-medium text-plum-800 bg-plum-50 hover:bg-plum-100 border border-plum-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  {allFilteredChecked ? 'Hapus Semua Pilihan' : 'Pilih semua'}
                </button>
              )}

              <span className="text-sm text-slate-600">
                <strong className="font-mono tabular-nums text-plum-900">
                  {filteredMemos.length}
                </strong>{' '}
                memo
              </span>
            </div>

            <div className="flex items-center shrink-0">
              <button
                type="button"
                onClick={() => setMergeOpen(true)}
                disabled={memos.length < 2}
                className="h-9 inline-flex items-center gap-1.5 px-3.5 text-sm font-medium text-plum-800 bg-plum-50 hover:bg-plum-100 border border-plum-200 disabled:opacity-45 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <GitMerge className="w-4 h-4" />
                Gabungkan Memo
              </button>
            </div>
          </div>

          {/* Bilah Aksi Terpilih (muncul saat ada memo dipilih) */}
          {checkedMemoIds.length > 0 && !mergedPreview && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-plum-50/90 border border-plum-200 rounded-lg px-4 py-2.5">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-semibold text-plum-900 font-mono tabular-nums">
                  {checkedMemoIds.length} memo dipilih
                </span>
                <button
                  type="button"
                  onClick={() => setCheckedMemoIds([])}
                  className="text-plum-700 hover:underline font-medium"
                >
                  Batalkan pilihan
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setBulkOpen(true)}
                  className="h-8 px-3.5 text-sm font-medium text-plum-900 bg-white border border-plum-200 hover:bg-plum-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  {currentUser.role === 'admin'
                    ? 'Atur Supplier / Verifikasi'
                    : 'Atur Supplier / Kontrak'}
                </button>
                <button
                  type="button"
                  disabled={checkedMemoIds.length < 2}
                  onClick={() => setMergeOpen(true)}
                  className="h-8 inline-flex items-center gap-1.5 px-3.5 text-sm font-medium text-white bg-plum-500 hover:bg-plum-600 disabled:opacity-45 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <GitMerge className="w-4 h-4" />
                  Gabungkan ({checkedMemoIds.length})
                </button>
              </div>
            </div>
          )}
        </section>

        {error && (
          <div className="no-print bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {/* TABEL LANGSUNG DI BAWAH FILTER */}
        {loading ? (
          <div className="bg-white border border-plum-200/80 rounded-xl p-6 space-y-4">
            <div className="h-7 w-64 bg-plum-100/70 rounded-lg animate-pulse" />
            <div className="h-44 bg-plum-50 rounded-lg animate-pulse" />
          </div>
        ) : mergedPreview ? (
          <div className="print-container space-y-4">
            <div className="no-print flex flex-wrap items-center justify-between gap-3 bg-plum-50/85 border border-plum-200 rounded-xl px-4 py-3 text-sm text-slate-700">
              <span>
                Pratinjau Tabel Gabungan:{' '}
                <strong className="font-mono text-plum-900">
                  {mergedPreview.memo.memo_number}
                </strong>{' '}
                (dari {mergedPreview.memo.source_filename})
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMergedPreview(null)}
                  className="h-8 px-3.5 text-sm font-medium text-slate-700 bg-white border border-plum-200 hover:bg-plum-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Tutup Pratinjau
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleSaveMerged({
                      sourceMemoIds: mergedPreview.sourceMemoIds,
                      memo_number: mergedPreview.memo.memo_number,
                      supplier: mergedPreview.memo.supplier,
                      periode_start: mergedPreview.memo.periode_start,
                      periode_end: mergedPreview.memo.periode_end,
                      no_kontrak: mergedPreview.memo.no_kontrak,
                      combineSameKode: mergedPreview.combineSameKode,
                      deleteSources: false,
                      note: 'Disimpan dari pratinjau gabungan',
                    })
                  }
                  className="h-8 px-3.5 text-sm font-medium text-white bg-plum-500 hover:bg-plum-600 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Simpan ke Database
                </button>
              </div>
            </div>
            <ExcelSheetMemo
              memo={mergedPreview.memo}
              userRole={currentUser.role}
              editable={false}
            />
          </div>
        ) : filteredMemos.length === 0 ? (
          <div className="bg-white border border-plum-200/80 rounded-xl p-10 text-center space-y-3">
            <p className="text-base text-slate-600">
              {currentUser.role === 'audit' && memos.length === 0
                ? 'Belum ada memo terverifikasi yang dapat ditampilkan untuk Audit.'
                : 'Tidak ada memo untuk supplier dan periode yang dipilih.'}
            </p>
            {(supplierFilter !== 'ALL' || monthFilter !== 'ALL' || yearFilter !== 'ALL') &&
              memos.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSupplierFilter('ALL');
                    setMonthFilter('ALL');
                    setYearFilter('ALL');
                  }}
                  className="h-9 px-4 text-sm font-medium text-white bg-plum-500 hover:bg-plum-600 rounded-lg transition-colors"
                >
                  Tampilkan Semua Supplier &amp; Periode
                </button>
              )}
          </div>
        ) : (
          <>
            <div className="print-container space-y-6 print:space-y-0">
              {displayedMemos.map((memo) => {
                const skipInPrint =
                  printSelectedSet !== null
                    ? !printSelectedSet.has(memo.id)
                    : checkedInFiltered.length > 0 && !checkedSet.has(memo.id);
                return (
                  <ExcelSheetMemo
                    key={memo.id}
                    memo={memo}
                    userRole={currentUser.role}
                    editable
                    defaultHistoryOpen={filteredMemos.length === 1}
                    skipInPrint={skipInPrint}
                    onUpdateHeader={handleUpdateHeader}
                    onUpdateItem={handleUpdateItem}
                    onAddItem={handleAddItem}
                    onDeleteItem={handleDeleteItem}
                    onDeleteMemo={handleDeleteMemo}
                    onAddComment={handleAddComment}
                    onDeleteComment={handleDeleteComment}
                  />
                );
              })}

              {extraPrintMemos.map((memo) => (
                <div key={`extra-print-${memo.id}`} className="hidden print:block">
                  <ExcelSheetMemo
                    memo={memo}
                    userRole={currentUser.role}
                    editable={false}
                  />
                </div>
              ))}
            </div>

            {filteredMemos.length > visibleLimit && (
              <div className="no-print text-center pt-2">
                <button
                  type="button"
                  onClick={() => setVisibleLimit((prev) => prev + 20)}
                  className="h-9 px-4 text-sm font-medium text-plum-800 bg-white border border-plum-200 hover:bg-plum-50 rounded-lg transition-colors"
                >
                  Tampilkan 20 memo berikutnya ({filteredMemos.length - visibleLimit} tersisa)
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Modal */}
      {currentUser.role === 'admin' && (
        <ImportExcelModal
          open={importOpen}
          supplierOptions={supplierSuggestions}
          onClose={() => setImportOpen(false)}
          onImport={handleImportMemos}
        />
      )}
      <BulkAssignModal
        open={bulkOpen}
        userRole={currentUser.role}
        selectedCount={checkedMemoIds.length}
        existingSuppliers={supplierSuggestions}
        onClose={() => setBulkOpen(false)}
        onApply={handleBulkApply}
      />
      <MergeMemosModal
        open={mergeOpen}
        memos={filteredMemos.length >= 2 ? filteredMemos : memos}
        supplierOptions={supplierSuggestions}
        initialSelectedIds={checkedMemoIds}
        onClose={() => setMergeOpen(false)}
        onPreviewMerged={handlePreviewMerged}
        onSaveMerged={handleSaveMerged}
      />
      <PrintMemosModal
        open={printModalOpen}
        filteredMemos={filteredMemos}
        allMemos={memos}
        initialSelectedIds={checkedInFiltered.map((m) => m.id)}
        onClose={() => setPrintModalOpen(false)}
        onConfirmPrint={handleConfirmPrint}
      />
      {currentUser.role === 'admin' && (
        <>
          <SuppliersModal
            open={suppliersOpen}
            suppliers={masterSuppliers}
            authFetch={authFetch}
            onSuppliersChange={setMasterSuppliers}
            onClose={() => setSuppliersOpen(false)}
          />
          <UsersModal
            open={usersOpen}
            currentUser={currentUser}
            authFetch={authFetch}
            onClose={() => setUsersOpen(false)}
          />
        </>
      )}
    </div>
  );
}

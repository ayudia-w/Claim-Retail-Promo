import React, { memo, useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  Check,
  History,
  MessageSquare,
  Send,
  ChevronDown,
  ChevronUp,
  Printer,
  ShieldCheck,
  EyeOff,
} from 'lucide-react';
import type {
  AuditAction,
  DiscountType,
  Memo,
  MemoItem,
  UserRole,
} from '../types.ts';
import {
  calcItemClaimTotal,
  calcItemJumlah,
  calcItemTotalDiskon,
  calcItemTotalRafraksi,
  calcMemoGrandTotal,
  formatIDRInline,
  formatIDRParts,
  formatPeriodeShorthand,
  formatQty,
  formatRafraksiPct,
  normalizeKode6,
} from '../utils/claimMath.ts';

interface ExcelSheetMemoProps {
  memo: Memo;
  userRole?: UserRole;
  editable?: boolean;
  defaultHistoryOpen?: boolean;
  skipInPrint?: boolean;
  pageBreakAfter?: boolean;
  onUpdateHeader?: (
    memoId: number,
    patch: Partial<
      Pick<
        Memo,
        'memo_number' | 'supplier' | 'periode_start' | 'periode_end' | 'no_kontrak' | 'status'
      >
    >
  ) => Promise<void>;
  onUpdateItem?: (
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
  ) => Promise<void>;
  onAddItem?: (memoId: number, discountType?: DiscountType) => Promise<void>;
  onDeleteItem?: (itemId: number) => Promise<void>;
  onDeleteMemo?: (memoId: number) => Promise<void>;
  onAddComment?: (memoId: number, comment: string) => Promise<void>;
  onDeleteComment?: (commentId: number) => Promise<void>;
}

function IdrAccountingDisplay({
  value,
  bold = false,
  compact = false,
}: {
  value: number;
  bold?: boolean;
  compact?: boolean;
}) {
  const { isNegative, numberText } = formatIDRParts(value);
  return (
    <div
      className={`flex items-center justify-between gap-2 w-full font-mono tabular-nums ${
        compact ? 'text-[13px] print:text-[11px]' : 'text-sm print:text-[11.5px]'
      } ${bold ? 'font-bold' : 'font-normal'} ${
        isNegative ? 'text-red-600' : 'text-slate-900'
      }`}
    >
      <span className="shrink-0 select-none">Rp</span>
      <span className="text-right">{numberText}</span>
    </div>
  );
}

interface InlineTextCellProps {
  value: string;
  placeholder?: string;
  editable: boolean;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  mono?: boolean;
  kode6?: boolean;
  periodeDate?: boolean;
  compact?: boolean;
  inline?: boolean;
  onCommit: (nextValue: string) => void;
}

function InlineTextCell({
  value,
  placeholder = '',
  editable,
  align = 'left',
  bold = false,
  mono = false,
  kode6 = false,
  periodeDate = false,
  compact = false,
  inline = false,
  onCommit,
}: InlineTextCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const textSize = compact ? 'text-[13px] print:text-[11px]' : 'text-sm print:text-[11.5px]';
  const widthClass = inline ? 'w-auto' : 'w-full';

  if (!editable) {
    return (
      <span
        className={`${inline ? 'inline-block' : 'block'} ${widthClass} ${textSize} ${
          align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'
        } ${bold ? 'font-bold' : ''} ${mono ? 'font-mono tabular-nums' : ''}`}
      >
        {value || ''}
      </span>
    );
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        inputMode={kode6 ? 'numeric' : undefined}
        maxLength={kode6 ? 6 : undefined}
        value={draft}
        onChange={(e) => {
          const val = e.target.value;
          setDraft(kode6 ? val.replace(/\D/g, '').slice(0, 6) : val);
        }}
        onBlur={() => {
          setEditing(false);
          const finalVal = periodeDate
            ? formatPeriodeShorthand(draft)
            : kode6
            ? normalizeKode6(draft)
            : draft.trim();
          if (finalVal !== value.trim()) {
            onCommit(finalVal);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
        className={`${
          inline ? 'w-28' : 'w-full'
        } bg-plum-50/80 px-2 py-1 ${textSize} text-slate-900 outline-none ring-1 ring-plum-500 rounded-[4px] ${
          align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'
        } ${mono ? 'font-mono tabular-nums' : ''}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      title={
        kode6
          ? 'Klik untuk ubah Kode 6 digit'
          : periodeDate
          ? 'Klik untuk ubah tanggal (cth. ketik 2611 → 26 Nov 2026)'
          : 'Klik untuk ubah'
      }
      className={`${widthClass} min-h-[26px] ${
        inline ? 'px-1' : 'px-1.5'
      } py-0.5 rounded-[4px] transition-colors hover:bg-plum-50/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-plum-500 ${textSize} ${
        align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'
      } ${bold ? 'font-bold' : ''} ${mono ? 'font-mono tabular-nums' : ''}`}
    >
      {value ? (
        <span className="text-slate-900">{value}</span>
      ) : (
        <span className="text-slate-400 italic text-xs no-print">{placeholder}</span>
      )}
    </button>
  );
}

interface InlineNumberCellProps {
  value: number;
  editable: boolean;
  isCurrency?: boolean;
  isPercent?: boolean;
  emptyDash?: boolean;
  compact?: boolean;
  onCommit: (nextValue: number) => void;
}

function InlineNumberCell({
  value,
  editable,
  isCurrency = false,
  isPercent = false,
  emptyDash = false,
  compact = false,
  onCommit,
}: InlineNumberCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(emptyDash ? '' : String(value));

  const textSize = compact ? 'text-[13px] print:text-[11px]' : 'text-sm print:text-[11.5px]';

  if (!editable) {
    if (emptyDash) {
      return <span className={`block w-full text-center font-mono text-slate-400 ${textSize}`}>-</span>;
    }
    if (isCurrency) {
      return <IdrAccountingDisplay value={value} compact={compact} />;
    }
    return (
      <span className={`block w-full text-center font-mono tabular-nums ${textSize}`}>
        {isPercent ? formatRafraksiPct(value) : formatQty(value)}
      </span>
    );
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        step="any"
        min={isPercent ? 0 : undefined}
        max={isPercent ? 100 : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (emptyDash && draft.trim() === '') return;
          const parsed = Number(draft);
          if (Number.isFinite(parsed) && (emptyDash || parsed !== value)) {
            onCommit(parsed);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            setDraft(emptyDash ? '' : String(value));
            setEditing(false);
          }
        }}
        className={`w-full bg-plum-50/80 px-2 py-1 text-right font-mono tabular-nums ${textSize} text-slate-900 outline-none ring-1 ring-plum-500 rounded-[4px]`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(emptyDash ? '' : String(value));
        setEditing(true);
      }}
      title={
        emptyDash
          ? isPercent
            ? 'Klik untuk isi Rafraksi % (Potongan otomatis dikosongkan)'
            : 'Klik untuk isi Potongan (Rafraksi % otomatis dikosongkan)'
          : isPercent
          ? 'Klik untuk ubah %'
          : 'Klik untuk ubah angka'
      }
      className="w-full min-h-[26px] px-1.5 py-0.5 rounded-[4px] transition-colors hover:bg-plum-50/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-plum-500"
    >
      {emptyDash ? (
        <span className={`block w-full text-center font-mono text-slate-400 ${textSize}`}>-</span>
      ) : isCurrency ? (
        <IdrAccountingDisplay value={value} compact={compact} />
      ) : (
        <span className={`block w-full text-center font-mono tabular-nums ${textSize} text-slate-900`}>
          {isPercent ? formatRafraksiPct(value) : formatQty(value)}
        </span>
      )}
    </button>
  );
}

interface InlinePotRafCellProps {
  discountType: DiscountType;
  diskonSatuan: number;
  rafraksiPct: number;
  editable: boolean;
  onCommit: (patch: {
    discount_type: DiscountType;
    diskon_satuan: number;
    rafraksi_pct: number;
  }) => void;
}

function InlinePotRafCell({
  discountType,
  diskonSatuan,
  rafraksiPct,
  editable,
  onCommit,
}: InlinePotRafCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (!editable) {
    return discountType === 'rafraksi' ? (
      <span className="block w-full text-center font-mono tabular-nums text-[13px] print:text-[11px] text-slate-900">
        {formatRafraksiPct(rafraksiPct)}
      </span>
    ) : (
      <IdrAccountingDisplay value={diskonSatuan} compact />
    );
  }

  function commitValue() {
    setEditing(false);
    const raw = draft.trim();
    if (!raw) return;

    if (raw.includes('%')) {
      const cleaned = raw.replace(/%/g, '').replace(/\s+/g, '').replace(',', '.');
      const pct = Number(cleaned);
      if (!Number.isFinite(pct) || pct < 0) return;
      if (discountType !== 'rafraksi' || pct !== rafraksiPct) {
        onCommit({
          discount_type: 'rafraksi',
          rafraksi_pct: pct,
          diskon_satuan: 0,
        });
      }
      return;
    }

    let cleanedNum = raw.replace(/^rp\s*/i, '').replace(/\s+/g, '');
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleanedNum)) {
      cleanedNum = cleanedNum.replace(/\./g, '').replace(',', '.');
    } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(cleanedNum)) {
      cleanedNum = cleanedNum.replace(/,/g, '');
    } else {
      cleanedNum = cleanedNum.replace(/,/g, '.');
    }
    const val = Number(cleanedNum);
    if (!Number.isFinite(val)) return;
    if (discountType !== 'potongan' || val !== diskonSatuan) {
      onCommit({
        discount_type: 'potongan',
        diskon_satuan: val,
        rafraksi_pct: 0,
      });
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        placeholder="10.000 / 10%"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitValue}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            setEditing(false);
          }
        }}
        className="w-full bg-plum-50/80 px-2 py-1 text-right font-mono tabular-nums text-[13px] text-slate-900 outline-none ring-1 ring-plum-500 rounded-[4px]"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(discountType === 'rafraksi' ? `${rafraksiPct}%` : String(diskonSatuan));
        setEditing(true);
      }}
      title="Isi angka untuk Potongan Rp (cth. 10.000), atau tambahkan % untuk Rafraksi (cth. 10%)"
      className="w-full min-h-[26px] px-1.5 py-0.5 rounded-[4px] transition-colors hover:bg-plum-50/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-plum-500"
    >
      {discountType === 'rafraksi' ? (
        <span className="block w-full text-center font-mono tabular-nums text-[13px] text-slate-900">
          {formatRafraksiPct(rafraksiPct)}
        </span>
      ) : (
        <IdrAccountingDisplay value={diskonSatuan} compact />
      )}
    </button>
  );
}

const ACTION_LABELS: Record<AuditAction, string> = {
  CREATE_MEMO: 'Memo Dibuat',
  UPDATE_HEADER: 'Header Diubah',
  ADD_ITEM: 'Baris Ditambah',
  UPDATE_ITEM: 'Nilai Diubah',
  DELETE_ITEM: 'Baris Dihapus',
  ADD_COMMENT: 'Catatan Ditambah',
  DELETE_COMMENT: 'Catatan Dihapus',
  MERGE_MEMOS: 'Memo Digabung',
  DELETE_MEMO: 'Memo Dihapus',
  PRINT_MEMO: 'Memo Dicetak',
};

const ACTION_COLOR: Record<AuditAction, string> = {
  CREATE_MEMO: 'text-blue-700',
  UPDATE_HEADER: 'text-slate-900',
  ADD_ITEM: 'text-emerald-700',
  UPDATE_ITEM: 'text-amber-700',
  DELETE_ITEM: 'text-red-700',
  ADD_COMMENT: 'text-slate-700',
  DELETE_COMMENT: 'text-slate-500',
  MERGE_MEMOS: 'text-plum-700',
  DELETE_MEMO: 'text-red-700',
  PRINT_MEMO: 'text-plum-700',
};

const FIELD_LABELS: Record<string, string> = {
  memo_number: 'No. Memo',
  supplier: 'Supplier',
  periode_start: 'Periode Mulai',
  periode_end: 'Periode Selesai',
  no_kontrak: 'No. Kontrak',
  kode: 'Kode',
  nama: 'Nama Produk',
  qty: 'QTY',
  discount_type: 'Jenis Diskon',
  diskon_satuan: 'Diskon Satuan',
  harga_satuan: 'Harga Satuan',
  rafraksi_pct: 'Rafraksi (%)',
  line_item: 'Baris Barang',
  internal_comment: 'Catatan Internal',
  merged_sources: 'Sumber Gabungan',
  merged_into: 'Digabung Ke',
  print: 'Cetakan',
  memo: 'Memo',
};

const dateTimeFormatterID = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatDateTimeID(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return dateTimeFormatterID.format(date);
}

export const ExcelSheetMemo = memo(function ExcelSheetMemo({
  memo,
  userRole = 'admin',
  editable = true,
  defaultHistoryOpen = false,
  skipInPrint = false,
  pageBreakAfter = false,
  onUpdateHeader,
  onUpdateItem,
  onAddItem,
  onDeleteItem,
  onDeleteMemo,
  onAddComment,
  onDeleteComment,
}: ExcelSheetMemoProps) {
  const [commentDraft, setCommentDraft] = useState('');
  const [commentInputOpen, setCommentInputOpen] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(defaultHistoryOpen);
  const [confirmDeleteMemo, setConfirmDeleteMemo] = useState(false);

  const grandTotal = useMemo(
    () => calcMemoGrandTotal({ mode: memo.mode, items: memo.items }),
    [memo.mode, memo.items]
  );
  const logs = memo.audit_logs ?? [];
  const comments = memo.comments ?? [];
  const isVerified = memo.status !== 'draft';
  const isPrinted = Number(memo.print_count ?? 0) > 0;

  async function handleCommentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!onAddComment || !commentDraft.trim()) return;
    setPostingComment(true);
    try {
      await onAddComment(memo.id, commentDraft.trim());
      setCommentDraft('');
      setCommentInputOpen(false);
    } finally {
      setPostingComment(false);
    }
  }

  return (
    <section
      className={`print-memo-block bg-white border border-plum-200/80 rounded-xl p-6 shadow-xs shadow-plum-900/[0.03] ${
        skipInPrint ? 'no-print' : ''
      } ${pageBreakAfter ? 'print-break-after' : ''}`}
    >
      {/* Tata Letak Utama Memo: Tabel Kiri + Panel Info/Aksi/Catatan/Riwayat di Kanan */}
      <div
        className={
          editable
            ? 'flex flex-col xl:flex-row xl:items-start gap-6 print:block'
            : ''
        }
      >
        {/* Kolom Kiri: Metadata Printable & Tabel Excel */}
        <div className="flex-1 min-w-0 overflow-x-auto print:overflow-visible">
          <div className="min-w-[700px] print:min-w-0">
            {/* Blok Metadata 3 Baris (tanpa No. Kontrak karena tidak dicetak) */}
            <table className="print-meta-table w-auto mb-3 print:mb-2.5 text-sm text-slate-900 border-collapse">
              <tbody>
                <tr>
                  <td className="font-bold pr-5 py-0.5 w-[115px] print:w-auto print:pr-3 align-middle">Memo</td>
                  <td className="py-0.5 min-w-[260px] print:min-w-0 align-middle">
                    <InlineTextCell
                      value={memo.memo_number}
                      placeholder="No. Memo"
                      editable={editable && Boolean(onUpdateHeader)}
                      onCommit={(val) => onUpdateHeader?.(memo.id, { memo_number: val })}
                    />
                  </td>
                </tr>
                <tr>
                  <td className="font-bold pr-5 py-0.5 print:w-auto print:pr-3 align-middle">Supplier</td>
                  <td className="py-0.5 min-w-[260px] print:min-w-0 align-middle">
                    <InlineTextCell
                      value={memo.supplier}
                      placeholder="Isi nama supplier"
                      editable={editable && Boolean(onUpdateHeader)}
                      onCommit={(val) => onUpdateHeader?.(memo.id, { supplier: val })}
                    />
                  </td>
                </tr>
                <tr>
                  <td className="font-bold pr-5 py-0.5 print:w-auto print:pr-3 align-middle">Periode</td>
                  <td className="py-0.5 min-w-[260px] print:min-w-0 align-middle">
                    <div className="inline-flex items-center gap-1.5 print:gap-1">
                      <InlineTextCell
                        inline
                        periodeDate
                        value={memo.periode_start}
                        placeholder="Mulai"
                        editable={editable && Boolean(onUpdateHeader)}
                        onCommit={(val) => onUpdateHeader?.(memo.id, { periode_start: val })}
                      />
                      <span className="text-slate-700 select-none">-</span>
                      <InlineTextCell
                        inline
                        periodeDate
                        value={memo.periode_end}
                        placeholder="Selesai"
                        editable={editable && Boolean(onUpdateHeader)}
                        onCommit={(val) => onUpdateHeader?.(memo.id, { periode_end: val })}
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* TABEL POTONGAN (5 kolom bergaris) */}
            {memo.mode === 'potongan' && (
              <table className="print-excel-table w-full print:w-auto border-collapse text-sm text-slate-900">
                <thead>
                  <tr>
                    <th className="border border-slate-800 px-3 py-2 font-bold text-left w-[96px] print:w-auto print:whitespace-nowrap">
                      Kode
                    </th>
                    <th className="border border-slate-800 px-3 py-2 font-bold text-left print:w-auto">
                      Nama
                    </th>
                    <th className="border border-slate-800 px-3 py-2 font-bold text-center w-[88px] print:w-auto print:whitespace-nowrap">
                      QTY
                    </th>
                    <th className="border border-slate-800 px-3 py-2 font-bold text-center w-[155px] print:w-auto print:whitespace-nowrap">
                      Diskon Satuan
                    </th>
                    <th className="border border-slate-800 px-3 py-2 font-bold text-center w-[170px] print:w-auto print:whitespace-nowrap">
                      Total Diskon
                    </th>
                    {editable && (
                      <th className="no-print w-16 border-0" aria-label="Aksi baris" />
                    )}
                  </tr>
                </thead>
                <tbody>
                  {memo.items.length === 0 ? (
                    <tr className="group hover:bg-plum-50/40">
                      <td
                        colSpan={5}
                        className="border border-slate-800 px-3 py-5 text-center text-slate-400 italic"
                      >
                        Belum ada baris barang
                      </td>
                      {editable && (
                        <td className="no-print pl-2 align-middle text-center">
                          {onAddItem && (
                            <button
                              type="button"
                              onClick={() => onAddItem(memo.id)}
                              className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 text-plum-600 hover:text-plum-800 hover:bg-plum-100/80 rounded transition-opacity"
                              title="Tambah baris"
                              aria-label="Tambah baris"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ) : (
                    memo.items.map((item, idx) => {
                      const totalDiskon = calcItemTotalDiskon(item);
                      return (
                        <tr key={item.id} className="group hover:bg-plum-50/40">
                          <td className="border border-slate-800 px-2 py-1.5 align-middle">
                            <InlineTextCell
                              value={item.kode}
                              placeholder="6 digit"
                              editable={editable}
                              mono
                              kode6
                              onCommit={(val) => onUpdateItem?.(item.id, { kode: val })}
                            />
                          </td>
                          <td className="border border-slate-800 px-2 py-1.5 align-middle">
                            <InlineTextCell
                              value={item.nama}
                              placeholder="Nama produk"
                              editable={editable}
                              onCommit={(val) => onUpdateItem?.(item.id, { nama: val })}
                            />
                          </td>
                          <td className="border border-slate-800 px-2 py-1.5 align-middle text-center">
                            <InlineNumberCell
                              value={item.qty}
                              editable={editable}
                              onCommit={(val) => onUpdateItem?.(item.id, { qty: val })}
                            />
                          </td>
                          <td className="border border-slate-800 px-2 py-1.5 align-middle">
                            <InlineNumberCell
                              value={item.diskon_satuan}
                              editable={editable}
                              isCurrency
                              onCommit={(val) => onUpdateItem?.(item.id, { diskon_satuan: val })}
                            />
                          </td>
                          {/* Total Diskon: terkunci / otomatis terhitung */}
                          <td className="border border-slate-800 px-3 py-1.5 align-middle bg-plum-50/35 print:bg-transparent">
                            <IdrAccountingDisplay value={totalDiskon} />
                          </td>
                          {editable && (
                            <td className="no-print pl-2 align-middle text-center">
                              <div className="inline-flex items-center justify-center gap-0.5">
                                {onAddItem && idx === memo.items.length - 1 && (
                                  <button
                                    type="button"
                                    onClick={() => onAddItem(memo.id)}
                                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 text-plum-600 hover:text-plum-800 hover:bg-plum-100/80 rounded transition-opacity"
                                    title="Tambah baris"
                                    aria-label="Tambah baris"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => onDeleteItem?.(item.id)}
                                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 text-slate-400 hover:text-red-600 rounded transition-opacity"
                                  title="Hapus baris"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                  <tr>
                    <td
                      colSpan={4}
                      className="border border-slate-800 px-3 py-2 font-bold text-center"
                    >
                      Total
                    </td>
                    <td className="border border-slate-800 px-3 py-2">
                      <IdrAccountingDisplay value={grandTotal} bold />
                    </td>
                    {editable && <td className="no-print" />}
                  </tr>
                </tbody>
              </table>
            )}

            {/* TABEL RAFRAKSI (7 kolom bergaris) */}
            {memo.mode === 'rafraksi' && (
              <table className="print-excel-table w-full print:w-auto border-collapse text-sm text-slate-900">
                <thead>
                  <tr>
                    <th className="border border-slate-800 px-2.5 py-2 font-bold text-left w-[88px] print:w-auto print:whitespace-nowrap">
                      Kode
                    </th>
                    <th className="border border-slate-800 px-2.5 py-2 font-bold text-left print:w-auto">
                      Nama
                    </th>
                    <th className="border border-slate-800 px-2.5 py-2 font-bold text-center w-[72px] print:w-auto print:whitespace-nowrap">
                      QTY
                    </th>
                    <th className="border border-slate-800 px-2.5 py-2 font-bold text-center w-[132px] print:w-auto print:whitespace-nowrap">
                      Harga Satuan
                    </th>
                    <th className="border border-slate-800 px-2.5 py-2 font-bold text-center w-[142px] print:w-auto print:whitespace-nowrap">
                      Jumlah
                    </th>
                    <th className="border border-slate-800 px-2.5 py-2 font-bold text-center w-[88px] print:w-auto print:whitespace-nowrap">
                      Rafraksi
                    </th>
                    <th className="border border-slate-800 px-2.5 py-2 font-bold text-center w-[148px] print:w-auto print:whitespace-nowrap">
                      Total Rafraksi
                    </th>
                    {editable && (
                      <th className="no-print w-16 border-0" aria-label="Aksi baris" />
                    )}
                  </tr>
                </thead>
                <tbody>
                  {memo.items.length === 0 ? (
                    <tr className="group hover:bg-plum-50/40">
                      <td
                        colSpan={7}
                        className="border border-slate-800 px-3 py-5 text-center text-slate-400 italic"
                      >
                        Belum ada baris barang
                      </td>
                      {editable && (
                        <td className="no-print pl-2 align-middle text-center">
                          {onAddItem && (
                            <button
                              type="button"
                              onClick={() => onAddItem(memo.id)}
                              className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 text-plum-600 hover:text-plum-800 hover:bg-plum-100/80 rounded transition-opacity"
                              title="Tambah baris"
                              aria-label="Tambah baris"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ) : (
                    memo.items.map((item, idx) => {
                      const jumlah = calcItemJumlah(item);
                      const totalRafraksi = calcItemTotalRafraksi(item);
                      return (
                        <tr key={item.id} className="group hover:bg-plum-50/40">
                          <td className="border border-slate-800 px-2 py-1.5 align-middle">
                            <InlineTextCell
                              value={item.kode}
                              placeholder="6 digit"
                              editable={editable}
                              mono
                              kode6
                              onCommit={(val) => onUpdateItem?.(item.id, { kode: val })}
                            />
                          </td>
                          <td className="border border-slate-800 px-2 py-1.5 align-middle">
                            <InlineTextCell
                              value={item.nama}
                              placeholder="Nama produk"
                              editable={editable}
                              onCommit={(val) => onUpdateItem?.(item.id, { nama: val })}
                            />
                          </td>
                          <td className="border border-slate-800 px-2 py-1.5 align-middle text-center">
                            <InlineNumberCell
                              value={item.qty}
                              editable={editable}
                              onCommit={(val) => onUpdateItem?.(item.id, { qty: val })}
                            />
                          </td>
                          <td className="border border-slate-800 px-2 py-1.5 align-middle">
                            <InlineNumberCell
                              value={item.harga_satuan}
                              editable={editable}
                              isCurrency
                              onCommit={(val) => onUpdateItem?.(item.id, { harga_satuan: val })}
                            />
                          </td>
                          {/* Jumlah: terkunci / otomatis terhitung */}
                          <td className="border border-slate-800 px-2.5 py-1.5 align-middle bg-plum-50/35 print:bg-transparent">
                            <IdrAccountingDisplay value={jumlah} />
                          </td>
                          <td className="border border-slate-800 px-2 py-1.5 align-middle text-center">
                            <InlineNumberCell
                              value={item.rafraksi_pct}
                              editable={editable}
                              isPercent
                              onCommit={(val) => onUpdateItem?.(item.id, { rafraksi_pct: val })}
                            />
                          </td>
                          {/* Total Rafraksi: terkunci / otomatis terhitung */}
                          <td className="border border-slate-800 px-2.5 py-1.5 align-middle bg-plum-50/35 print:bg-transparent">
                            <IdrAccountingDisplay value={totalRafraksi} />
                          </td>
                          {editable && (
                            <td className="no-print pl-2 align-middle text-center">
                              <div className="inline-flex items-center justify-center gap-0.5">
                                {onAddItem && idx === memo.items.length - 1 && (
                                  <button
                                    type="button"
                                    onClick={() => onAddItem(memo.id)}
                                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 text-plum-600 hover:text-plum-800 hover:bg-plum-100/80 rounded transition-opacity"
                                    title="Tambah baris"
                                    aria-label="Tambah baris"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => onDeleteItem?.(item.id)}
                                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 text-slate-400 hover:text-red-600 rounded transition-opacity"
                                  title="Hapus baris"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                  <tr>
                    <td
                      colSpan={6}
                      className="border border-slate-800 px-3 py-2 font-bold text-center"
                    >
                      Total
                    </td>
                    <td className="border border-slate-800 px-2.5 py-2">
                      <IdrAccountingDisplay value={grandTotal} bold />
                    </td>
                    {editable && <td className="no-print" />}
                  </tr>
                </tbody>
              </table>
            )}

            {/* TABEL CAMPURAN / MIXED (7 kolom bergaris dengan kolom Pot/Raf gabungan) */}
            {memo.mode === 'mixed' && (
              <table className="print-excel-table w-full print:w-auto border-collapse text-[13px] text-slate-900">
                <thead>
                  <tr>
                    <th className="border border-slate-800 px-2 py-2 font-bold text-left w-[76px] print:w-auto print:whitespace-nowrap">
                      Kode
                    </th>
                    <th className="border border-slate-800 px-2 py-2 font-bold text-left print:w-auto">
                      Nama
                    </th>
                    <th className="border border-slate-800 px-2 py-2 font-bold text-center w-[66px] print:w-auto print:whitespace-nowrap">
                      QTY
                    </th>
                    <th className="border border-slate-800 px-2 py-2 font-bold text-center w-[122px] print:w-auto print:whitespace-nowrap">
                      Harga Satuan
                    </th>
                    <th className="border border-slate-800 px-2 py-2 font-bold text-center w-[130px] print:w-auto print:whitespace-nowrap">
                      Jumlah
                    </th>
                    <th className="border border-slate-800 px-2 py-2 font-bold text-center w-[126px] print:w-auto print:whitespace-nowrap">
                      Pot/Raf
                    </th>
                    <th className="border border-slate-800 px-2 py-2 font-bold text-center w-[132px] print:w-auto print:whitespace-nowrap">
                      Total Diskon
                    </th>
                    {editable && (
                      <th className="no-print w-16 border-0" aria-label="Aksi baris" />
                    )}
                  </tr>
                </thead>
                <tbody>
                  {memo.items.length === 0 ? (
                    <tr className="group hover:bg-plum-50/40">
                      <td
                        colSpan={7}
                        className="border border-slate-800 px-3 py-5 text-center text-slate-400 italic"
                      >
                        Belum ada baris barang
                      </td>
                      {editable && (
                        <td className="no-print pl-2 align-middle text-center">
                          {onAddItem && (
                            <button
                              type="button"
                              onClick={() => onAddItem(memo.id)}
                              className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 text-plum-600 hover:text-plum-800 hover:bg-plum-100/80 rounded transition-opacity"
                              title="Tambah baris"
                              aria-label="Tambah baris"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ) : (
                    memo.items.map((item, idx) => {
                      const jumlah = calcItemJumlah(item);
                      const rowClaimTotal = calcItemClaimTotal(item);

                      return (
                        <tr key={item.id} className="group hover:bg-plum-50/40">
                          <td className="border border-slate-800 px-1.5 py-1.5 align-middle">
                            <InlineTextCell
                              value={item.kode}
                              placeholder="6 digit"
                              editable={editable}
                              mono
                              kode6
                              compact
                              onCommit={(val) => onUpdateItem?.(item.id, { kode: val })}
                            />
                          </td>
                          <td className="border border-slate-800 px-1.5 py-1.5 align-middle">
                            <InlineTextCell
                              value={item.nama}
                              placeholder="Nama produk"
                              editable={editable}
                              compact
                              onCommit={(val) => onUpdateItem?.(item.id, { nama: val })}
                            />
                          </td>
                          <td className="border border-slate-800 px-1.5 py-1.5 align-middle text-center">
                            <InlineNumberCell
                              value={item.qty}
                              editable={editable}
                              compact
                              onCommit={(val) => onUpdateItem?.(item.id, { qty: val })}
                            />
                          </td>
                          <td className="border border-slate-800 px-1.5 py-1.5 align-middle">
                            <InlineNumberCell
                              value={item.harga_satuan}
                              editable={editable}
                              isCurrency
                              compact
                              onCommit={(val) => onUpdateItem?.(item.id, { harga_satuan: val })}
                            />
                          </td>
                          {/* Jumlah: terkunci / otomatis terhitung */}
                          <td className="border border-slate-800 px-2 py-1.5 align-middle bg-plum-50/35 print:bg-transparent">
                            <IdrAccountingDisplay value={jumlah} compact />
                          </td>
                          {/* Pot/Raf: angka saja = Potongan Rp, pakai % = Rafraksi % */}
                          <td className="border border-slate-800 px-1.5 py-1.5 align-middle">
                            <InlinePotRafCell
                              discountType={item.discount_type}
                              diskonSatuan={item.diskon_satuan}
                              rafraksiPct={item.rafraksi_pct}
                              editable={editable}
                              onCommit={(patch) => onUpdateItem?.(item.id, patch)}
                            />
                          </td>
                          {/* Total Diskon: terkunci / otomatis terhitung */}
                          <td className="border border-slate-800 px-2 py-1.5 align-middle bg-plum-50/35 print:bg-transparent">
                            <IdrAccountingDisplay value={rowClaimTotal} compact />
                          </td>
                          {editable && (
                            <td className="no-print pl-2 align-middle text-center">
                              <div className="inline-flex items-center justify-center gap-0.5">
                                {onAddItem && idx === memo.items.length - 1 && (
                                  <button
                                    type="button"
                                    onClick={() => onAddItem(memo.id)}
                                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 text-plum-600 hover:text-plum-800 hover:bg-plum-100/80 rounded transition-opacity"
                                    title="Tambah baris"
                                    aria-label="Tambah baris"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => onDeleteItem?.(item.id)}
                                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 text-slate-400 hover:text-red-600 rounded transition-opacity"
                                  title="Hapus baris"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                  <tr>
                    <td
                      colSpan={6}
                      className="border border-slate-800 px-2.5 py-2 font-bold text-center"
                    >
                      Total
                    </td>
                    <td className="border border-slate-800 px-2 py-2">
                      <IdrAccountingDisplay value={grandTotal} bold compact />
                    </td>
                    {editable && <td className="no-print" />}
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Kolom Kanan (.no-print): Status + Hapus Memo, Info Internal (No. Kontrak & Total), Status Cetak, Catatan Internal, & Riwayat */}
        {editable && (
          <aside className="no-print w-full xl:w-[372px] shrink-0 xl:border-l xl:border-plum-100 xl:pl-5 pt-4 xl:pt-0 border-t xl:border-t-0 border-plum-100 space-y-4">
            <div className="space-y-3 pb-4 border-b border-plum-100">
              {/* Baris Atas: Status Verifikasi & Hapus Memo */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {userRole === 'admin' && onUpdateHeader ? (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateHeader(memo.id, {
                          status: isVerified ? 'draft' : 'verified',
                        })
                      }
                      title={
                        isVerified
                          ? 'Terverifikasi (terlihat oleh Audit) — klik untuk ubah ke Belum Dicek'
                          : 'Belum Dicek (tersembunyi dari Audit) — klik untuk verifikasi'
                      }
                      className={`h-8 inline-flex items-center gap-1.5 px-2.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                        isVerified
                          ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800 hover:bg-emerald-100/70'
                          : 'bg-amber-50/80 border-amber-200 text-amber-900 hover:bg-amber-100/70'
                      }`}
                    >
                      {isVerified ? (
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      )}
                      <span>{isVerified ? 'Terverifikasi' : 'Belum Dicek'}</span>
                    </button>
                  ) : (
                    <span className="h-8 inline-flex items-center gap-1 px-2.5 text-xs font-medium text-emerald-700 bg-emerald-50/70 border border-emerald-200/80 rounded-lg whitespace-nowrap shrink-0">
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>Terverifikasi</span>
                    </span>
                  )}
                </div>

                {onDeleteMemo &&
                  (confirmDeleteMemo ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDeleteMemo(false);
                          onDeleteMemo(memo.id);
                        }}
                        className="h-8 px-2.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        Ya, Hapus
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteMemo(false)}
                        className="h-8 px-2 text-xs text-slate-600 hover:bg-plum-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteMemo(true)}
                      className="h-8 inline-flex items-center gap-1 px-2 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      title="Hapus memo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Hapus
                    </button>
                  ))}
              </div>

              {/* Info Internal: No. Kontrak & Total Memo (tidak dicetak) */}
              <div className="grid grid-cols-2 gap-2.5 bg-plum-50/60 border border-plum-200/70 rounded-lg p-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-plum-700 mb-0.5">No. Kontrak</div>
                  <InlineTextCell
                    value={memo.no_kontrak}
                    placeholder="Isi no. kontrak"
                    editable={editable && Boolean(onUpdateHeader)}
                    compact
                    onCommit={(val) => onUpdateHeader?.(memo.id, { no_kontrak: val })}
                  />
                </div>
                <div className="min-w-0 text-right border-l border-plum-200/70 pl-2.5">
                  <div className="text-xs font-medium text-plum-700 mb-1">Total Memo</div>
                  <div className="text-sm font-bold font-mono tabular-nums text-plum-900 truncate">
                    {formatIDRInline(grandTotal)}
                  </div>
                </div>
              </div>

              {/* Status Cetak */}
              <div
                className={`flex items-center gap-2 text-xs px-2.5 py-2 rounded-lg border ${
                  isPrinted
                    ? 'bg-plum-50/70 border-plum-200/80 text-plum-900'
                    : 'bg-slate-50/70 border-slate-200/80 text-slate-500'
                }`}
              >
                <Printer
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isPrinted ? 'text-plum-600' : 'text-slate-400'
                  }`}
                />
                {isPrinted ? (
                  <span className="truncate">
                    Sudah dicetak ({memo.print_count}×) · {formatDateTimeID(memo.printed_at)}
                    {memo.printed_by ? ` (${memo.printed_by})` : ''}
                  </span>
                ) : (
                  <span>Belum dicetak</span>
                )}
              </div>
            </div>

            {/* Catatan Internal (Sorotan Utama, Tanpa Tanggal/Waktu, Pesan Lebih Menonjol) */}
            <div className="bg-plum-50/75 border border-plum-200/90 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-sm font-bold text-plum-900">
                  <MessageSquare className="w-4 h-4 text-plum-600" />
                  Catatan Internal
                  {comments.length > 0 && (
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-plum-200/70 text-plum-800 font-mono tabular-nums">
                      {comments.length}
                    </span>
                  )}
                </span>

                {onAddComment && (
                  <button
                    type="button"
                    onClick={() => setCommentInputOpen((prev) => !prev)}
                    aria-label={commentInputOpen ? 'Tutup form catatan' : 'Tambah catatan'}
                    title={commentInputOpen ? 'Tutup' : 'Tambah catatan'}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-lg bg-white hover:bg-plum-100 text-plum-700 border border-plum-200/90 transition-colors shrink-0"
                  >
                    <Plus
                      className={`w-4 h-4 transition-transform ${
                        commentInputOpen ? 'rotate-45' : ''
                      }`}
                    />
                  </button>
                )}
              </div>

              {comments.length > 0 ? (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-0.5">
                  {comments.map((c) => (
                    <div
                      key={c.id}
                      className="group flex items-start justify-between gap-2 bg-white border border-plum-200/80 border-l-4 border-l-plum-400 rounded-lg px-3.5 py-2.5 shadow-2xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-plum-950 leading-relaxed whitespace-pre-wrap break-words">
                          {c.comment}
                        </p>
                        <div className="mt-1 text-[11px] text-slate-400">— {c.author}</div>
                      </div>
                      {onDeleteComment && (
                        <button
                          type="button"
                          onClick={() => onDeleteComment(c.id)}
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-400 hover:text-rose-600 rounded transition-opacity shrink-0"
                          title="Hapus catatan"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                !commentInputOpen && (
                  <p className="text-xs text-plum-700/70">Belum ada catatan internal.</p>
                )
              )}

              {onAddComment && commentInputOpen && (
                <form onSubmit={handleCommentSubmit} className="flex items-center gap-2 pt-0.5">
                  <input
                    autoFocus
                    type="text"
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setCommentInputOpen(false);
                      }
                    }}
                    placeholder="Tulis catatan penting..."
                    className="flex-1 min-w-0 h-9 px-3 text-sm bg-white border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
                  />
                  <button
                    type="submit"
                    disabled={postingComment || !commentDraft.trim()}
                    className="h-9 inline-flex items-center justify-center gap-1.5 px-3 text-sm font-medium text-white bg-plum-500 hover:bg-plum-600 disabled:opacity-45 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    title="Simpan Catatan"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Simpan
                  </button>
                </form>
              )}
            </div>

            {/* Riwayat Perubahan Memo */}
            <div className="pt-4 border-t border-plum-100">
              <button
                type="button"
                onClick={() => setHistoryOpen((prev) => !prev)}
                className="w-full flex items-center justify-between gap-2 text-left text-sm font-semibold text-plum-900 hover:text-plum-700 transition-colors"
              >
                <span className="inline-flex items-center gap-2">
                  <History className="w-4 h-4 text-plum-500" />
                  <span>Riwayat Perubahan</span>
                  {logs.length > 0 && (
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-plum-200/70 text-plum-800 font-mono tabular-nums">
                      {logs.length}
                    </span>
                  )}
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-plum-600">
                  {historyOpen ? (
                    <>
                      Tutup
                      <ChevronUp className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      Lihat
                      <ChevronDown className="w-4 h-4" />
                    </>
                  )}
                </span>
              </button>

              {!historyOpen && logs[0] && (
                <p className="mt-1.5 text-xs text-slate-500 truncate">
                  Terakhir: {ACTION_LABELS[logs[0].action] ?? logs[0].action} oleh {logs[0].actor} (
                  {formatDateTimeID(logs[0].created_at)})
                </p>
              )}

              {historyOpen && (
                <div className="mt-2.5 max-h-64 overflow-y-auto border border-plum-200/80 rounded-lg divide-y divide-plum-50">
                  {logs.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-slate-400 text-center">
                      Belum ada riwayat perubahan.
                    </div>
                  ) : (
                    logs.map((log) => (
                      <div key={log.id} className="px-3 py-2.5 text-xs space-y-1 hover:bg-plum-50/40">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`font-semibold ${
                              ACTION_COLOR[log.action] ?? 'text-slate-700'
                            }`}
                          >
                            {ACTION_LABELS[log.action] ?? log.action}
                          </span>
                          <span className="font-mono tabular-nums text-slate-400">
                            {formatDateTimeID(log.created_at)}
                          </span>
                        </div>
                        <div className="text-slate-700">
                          <span className="font-medium text-slate-900">{log.actor || 'Admin'}</span>
                          <span className="text-slate-300 mx-1.5">·</span>
                          {log.item_kode ? (
                            <span className="font-mono text-slate-800">{log.item_kode} · </span>
                          ) : null}
                          <span className="text-slate-600">
                            {FIELD_LABELS[log.field_name] ?? (log.field_name || '-')}
                          </span>
                        </div>
                        <div className="font-mono text-slate-800 break-words">
                          {log.old_value ? (
                            <span>
                              <span className="text-slate-400 line-through">{log.old_value}</span>
                              <span className="text-slate-400 mx-1">→</span>
                              <span className="font-medium text-slate-900">{log.new_value}</span>
                            </span>
                          ) : (
                            <span>{log.new_value || '-'}</span>
                          )}
                        </div>
                        {log.note && <div className="text-slate-500 italic">{log.note}</div>}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </section>
  );
});

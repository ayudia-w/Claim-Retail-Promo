import type { ClaimMode, Memo, MemoItem } from '../types.ts';

const idrNumberFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 0,
});

const qtyDecimalFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 2,
});

export function normalizeKode6(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length > 0) {
    return digits.slice(0, 6);
  }
  return raw.trim().slice(0, 6);
}

const SHORT_MONTHS_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

export function formatPeriodeShorthand(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // 4 digit DDMM -> DD Mon YYYY (tahun saat ini)
  const match4 = trimmed.match(/^(\d{2})(\d{2})$/);
  if (match4) {
    const day = Number(match4[1]);
    const month = Number(match4[2]);
    const year = new Date().getFullYear();
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const check = new Date(year, month - 1, day);
      if (
        check.getFullYear() === year &&
        check.getMonth() === month - 1 &&
        check.getDate() === day
      ) {
        return `${String(day).padStart(2, '0')} ${SHORT_MONTHS_ID[month - 1]} ${year}`;
      }
    }
  }

  // 6 digit DDMMYY atau 8 digit DDMMYYYY -> DD Mon YYYY
  const match68 = trimmed.match(/^(\d{2})(\d{2})(\d{2}|\d{4})$/);
  if (match68) {
    const day = Number(match68[1]);
    const month = Number(match68[2]);
    let year = Number(match68[3]);
    if (match68[3].length === 2) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const check = new Date(year, month - 1, day);
      if (
        check.getFullYear() === year &&
        check.getMonth() === month - 1 &&
        check.getDate() === day
      ) {
        return `${String(day).padStart(2, '0')} ${SHORT_MONTHS_ID[month - 1]} ${year}`;
      }
    }
  }

  return trimmed;
}

export function calcItemTotalDiskon(
  item: Pick<MemoItem, 'qty' | 'diskon_satuan'>
): number {
  return Number(item.qty || 0) * Number(item.diskon_satuan || 0);
}

export function calcItemJumlah(
  item: Pick<MemoItem, 'qty' | 'harga_satuan'>
): number {
  return Number(item.qty || 0) * Number(item.harga_satuan || 0);
}

export function calcItemTotalRafraksi(
  item: Pick<MemoItem, 'qty' | 'harga_satuan' | 'rafraksi_pct'>
): number {
  return Number(item.qty || 0) * Number(item.harga_satuan || 0) * (Number(item.rafraksi_pct || 0) / 100);
}

export function calcItemClaimTotal(
  item: Pick<
    MemoItem,
    'qty' | 'diskon_satuan' | 'harga_satuan' | 'rafraksi_pct' | 'discount_type'
  >
): number {
  return item.discount_type === 'rafraksi'
    ? calcItemTotalRafraksi(item)
    : calcItemTotalDiskon(item);
}

export function calcMemoGrandTotal(memo: Pick<Memo, 'mode' | 'items'>): number {
  let sum = 0;
  if (memo.mode === 'potongan') {
    for (const item of memo.items) {
      sum += calcItemTotalDiskon(item);
    }
    return sum;
  }
  if (memo.mode === 'rafraksi') {
    for (const item of memo.items) {
      sum += calcItemTotalRafraksi(item);
    }
    return sum;
  }
  for (const item of memo.items) {
    sum += calcItemClaimTotal(item);
  }
  return sum;
}

export function formatIDRParts(value: number): {
  isZero: boolean;
  isNegative: boolean;
  numberText: string;
} {
  const rounded = Math.round(Number(value || 0));
  if (rounded === 0) {
    return { isZero: true, isNegative: false, numberText: '-' };
  }
  const isNegative = rounded < 0;
  const absFormatted = idrNumberFormatter.format(Math.abs(rounded));
  return {
    isZero: false,
    isNegative,
    numberText: isNegative ? `(${absFormatted})` : absFormatted,
  };
}

export function formatIDRInline(value: number): string {
  const rounded = Math.round(Number(value || 0));
  if (rounded === 0) return 'Rp -';
  const absFormatted = idrNumberFormatter.format(Math.abs(rounded));
  return rounded < 0 ? `-Rp ${absFormatted}` : `Rp ${absFormatted}`;
}

export function formatQty(value: number): string {
  const num = Number(value || 0);
  return Number.isInteger(num)
    ? idrNumberFormatter.format(num)
    : qtyDecimalFormatter.format(num);
}

export function formatRafraksiPct(pct: number): string {
  const num = Number(pct || 0);
  if (!Number.isFinite(num) || num === 0) return '0%';
  const rounded = Math.round(num * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(2).replace(/\.?0+$/, '')}%`;
}

export function resolveMergedMode(sourceMemos: Array<Pick<Memo, 'mode'>>): ClaimMode {
  if (sourceMemos.length === 0) return 'potongan';
  const first = sourceMemos[0].mode;
  if (sourceMemos.every((m) => m.mode === first)) {
    return first;
  }
  return 'mixed';
}

export function buildMergedPreviewMemo(
  sourceMemos: Memo[],
  options: {
    memoNumber: string;
    supplier: string;
    periodeStart: string;
    periodeEnd: string;
    noKontrak: string;
    combineSameKode: boolean;
  }
): Memo {
  const mode = resolveMergedMode(sourceMemos);
  const normalizedItems = sourceMemos.flatMap((m) =>
    m.items.map((item) => ({
      ...item,
      discount_type:
        m.mode === 'mixed'
          ? item.discount_type
          : m.mode === 'rafraksi'
          ? ('rafraksi' as const)
          : ('potongan' as const),
    }))
  );

  let mergedItems: MemoItem[];

  if (options.combineSameKode) {
    const byKey = new Map<string, MemoItem>();
    for (const item of normalizedItems) {
      const ratePart =
        item.discount_type === 'potongan'
          ? `P_${item.diskon_satuan}`
          : `R_${item.harga_satuan}_${item.rafraksi_pct}`;
      const key = `${item.kode.trim()}__${ratePart}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.qty += Number(item.qty || 0);
      } else {
        byKey.set(key, {
          ...item,
          id: -(byKey.size + 1),
          memo_id: -1,
          row_order: byKey.size,
        });
      }
    }
    mergedItems = Array.from(byKey.values());
  } else {
    mergedItems = normalizedItems.map((item, idx) => ({
      ...item,
      id: -(idx + 1),
      memo_id: -1,
      row_order: idx,
    }));
  }

  const now = new Date().toISOString();
  return {
    id: -1,
    memo_number: options.memoNumber,
    mode,
    supplier: options.supplier,
    periode_start: options.periodeStart,
    periode_end: options.periodeEnd,
    no_kontrak: options.noKontrak,
    source_filename: `Merged (${sourceMemos.map((m) => m.memo_number).join(', ')})`,
    status: 'draft',
    printed_at: '',
    printed_by: '',
    print_count: 0,
    created_at: now,
    updated_at: now,
    items: mergedItems,
    comments: [],
  };
}

export type ClaimMode = 'potongan' | 'rafraksi' | 'mixed';

export type DiscountType = 'potongan' | 'rafraksi';

export type MemoStatus = 'draft' | 'verified';

export type UserRole = 'admin' | 'audit';

export interface AuthUser {
  id: number;
  username: string;
  display_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface SupplierRecord {
  id: number;
  name: string;
  created_at: string;
}

export interface MemoItem {
  id: number;
  memo_id: number;
  row_order: number;
  kode: string;
  nama: string;
  qty: number;
  discount_type: DiscountType;
  diskon_satuan: number;
  harga_satuan: number;
  rafraksi_pct: number;
  created_at: string;
  updated_at: string;
}

export interface MemoComment {
  id: number;
  memo_id: number;
  author: string;
  comment: string;
  created_at: string;
}

export interface Memo {
  id: number;
  memo_number: string;
  mode: ClaimMode;
  supplier: string;
  periode_start: string;
  periode_end: string;
  no_kontrak: string;
  source_filename: string;
  status: MemoStatus;
  printed_at: string;
  printed_by: string;
  print_count: number;
  created_at: string;
  updated_at: string;
  items: MemoItem[];
  comments: MemoComment[];
  audit_logs?: AuditLogEntry[];
}

export type AuditAction =
  | 'CREATE_MEMO'
  | 'UPDATE_HEADER'
  | 'ADD_ITEM'
  | 'UPDATE_ITEM'
  | 'DELETE_ITEM'
  | 'ADD_COMMENT'
  | 'DELETE_COMMENT'
  | 'MERGE_MEMOS'
  | 'DELETE_MEMO'
  | 'PRINT_MEMO';

export interface AuditLogEntry {
  id: number;
  memo_id: number | null;
  memo_number: string;
  item_id: number | null;
  item_kode: string;
  action: AuditAction;
  field_name: string;
  old_value: string;
  new_value: string;
  actor: string;
  note: string;
  created_at: string;
}

export interface ParsedExcelMemo {
  filename: string;
  memo_number: string;
  mode: ClaimMode;
  excludedReason: string | null;
  include: boolean;
  items: Array<{
    kode: string;
    nama: string;
    qty: number;
    discount_type: DiscountType;
    diskon_satuan: number;
    harga_satuan: number;
    rafraksi_pct: number;
  }>;
}

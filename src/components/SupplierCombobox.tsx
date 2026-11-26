import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

export interface SupplierOption {
  key: string;
  label: string;
}

interface SupplierComboboxProps {
  value: string; // 'ALL' | UNASSIGNED_KEY | supplier name
  options: SupplierOption[];
  unassignedKey: string;
  onChange: (nextKey: string) => void;
}

export function SupplierCombobox({
  value,
  options,
  unassignedKey,
  onChange,
}: SupplierComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 20);
    } else {
      setQuery('');
    }
  }, [open]);

  const selectedLabel = useMemo(() => {
    if (value === 'ALL') return 'Semua Supplier';
    const found = options.find((o) => o.key === value);
    return found ? found.label : value;
  }, [value, options]);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div ref={containerRef} className="relative w-full sm:w-80">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full h-10 flex items-center justify-between gap-2 px-3.5 text-sm bg-white border border-plum-200 hover:border-plum-300 rounded-lg text-left transition-colors focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
      >
        <span
          className={`truncate ${
            value === unassignedKey ? 'text-amber-700 font-medium' : 'text-slate-800 font-medium'
          }`}
        >
          {selectedLabel}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {value !== 'ALL' && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange('ALL');
                setOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  onChange('ALL');
                  setOpen(false);
                }
              }}
              className="p-0.5 text-plum-400 hover:text-plum-700 rounded"
              title="Tampilkan semua supplier"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-plum-400 transition-transform duration-150 ${
              open ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1.5 z-40 bg-white border border-plum-200 rounded-xl shadow-lg shadow-plum-900/10 overflow-hidden">
          <div className="p-2 border-b border-plum-100 bg-plum-50/50">
            <div className="relative">
              <Search className="w-4 h-4 text-plum-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setOpen(false);
                }}
                placeholder="Ketik nama supplier..."
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-white border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-plum-50">
            {!query.trim() && (
              <button
                type="button"
                onClick={() => {
                  onChange('ALL');
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm text-left hover:bg-plum-50/60 transition-colors ${
                  value === 'ALL'
                    ? 'bg-plum-50 text-plum-900 font-semibold'
                    : 'text-slate-700'
                }`}
              >
                <span>Semua Supplier</span>
              </button>
            )}

            {filteredOptions.length === 0 ? (
              <div className="px-3.5 py-4 text-sm text-slate-400 text-center">
                Supplier tidak ditemukan
              </div>
            ) : (
              filteredOptions.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    onChange(opt.key);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm text-left hover:bg-plum-50/60 transition-colors ${
                    value === opt.key
                      ? 'bg-plum-50 text-plum-900 font-semibold'
                      : opt.key === unassignedKey
                      ? 'text-amber-700'
                      : 'text-slate-700'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

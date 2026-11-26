import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

interface SupplierAutocompleteInputProps {
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (nextValue: string) => void;
}

export function SupplierAutocompleteInput({
  value,
  options,
  placeholder = 'Ketik atau pilih supplier...',
  onChange,
}: SupplierAutocompleteInputProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => opt.toLowerCase().includes(q));
  }, [options, value]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [value, open]);

  function selectOption(option: string) {
    onChange(option);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (!open) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (filtered.length === 0 ? -1 : (prev + 1) % filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) =>
        filtered.length === 0 ? -1 : prev <= 0 ? filtered.length - 1 : prev - 1
      );
    } else if (e.key === 'Enter' && activeIndex >= 0 && filtered[activeIndex]) {
      e.preventDefault();
      selectOption(filtered[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={value}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full px-3.5 py-2 pr-14 text-sm border border-plum-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-plum-400/30 focus:border-plum-400"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(true);
              }}
              className="p-1 text-plum-400 hover:text-plum-700 rounded"
              title="Kosongkan"
              tabIndex={-1}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="p-1 text-plum-400 hover:text-plum-700 rounded"
            title="Tampilkan daftar supplier"
            tabIndex={-1}
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-150 ${
                open ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {open && (
        <div className="absolute left-0 right-0 mt-1 z-30 bg-white border border-plum-200 rounded-xl shadow-lg shadow-plum-900/10 max-h-48 overflow-y-auto divide-y divide-plum-50">
          {filtered.length === 0 ? (
            <div className="px-3.5 py-2.5 text-xs text-slate-400">
              {options.length === 0
                ? 'Belum ada daftar supplier. Anda tetap bisa mengetik manual.'
                : 'Tidak ada supplier yang cocok — teks yang diketik akan dipakai.'}
            </div>
          ) : (
            filtered.map((opt, idx) => (
              <button
                key={opt}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectOption(opt);
                }}
                className={`w-full px-3.5 py-2 text-sm text-left transition-colors truncate ${
                  idx === activeIndex || opt.toLowerCase() === value.trim().toLowerCase()
                    ? 'bg-plum-50 text-plum-900 font-medium'
                    : 'text-slate-700 hover:bg-plum-50/60'
                }`}
              >
                {opt}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

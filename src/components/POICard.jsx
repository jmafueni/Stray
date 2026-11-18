// src/components/POICard.jsx
import React from 'react';
import { MapPin, Sparkles, Navigation } from 'lucide-react';

export default function POICard({
  poi,
  index = 0,
  isSelected,
  onSelect,
  theme = 'paper',
}) {
  if (!poi) return null;

  const isDark = theme === 'dark';
  const stopNumber = index + 1;

  return (
    <button
      type="button"
      onClick={() => onSelect && onSelect(poi)}
      className={`group text-left flex-shrink-0 w-64 rounded-2xl p-3.5 transition-all duration-200 border ${
        isSelected
          ? isDark
            ? 'bg-[#242429] border-[#FF6B4A] ring-1 ring-[#FF6B4A]/40 shadow-md shadow-[#FF6B4A]/15 -translate-y-0.5'
            : 'bg-[#FAF8F5] border-[#FF6B4A] ring-1 ring-[#FF6B4A]/35 shadow-[0_6px_18px_rgba(255,107,74,0.16)] -translate-y-0.5'
          : isDark
          ? 'bg-[#202024] border-white/10 hover:border-white/20 shadow-sm'
          : 'bg-[#FAF8F5] border-[#1C1C1E]/12 hover:border-[#1C1C1E]/25 shadow-[0_2px_10px_rgba(28,28,30,0.04)]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="relative w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-lg border"
            style={{
              backgroundColor: `${poi.color}18`,
              borderColor: `${poi.color}35`,
              color: poi.color,
            }}
          >
            {poi.icon}
            <span
              className="font-editorial absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center text-[#FAF8F5] shadow-sm"
              style={{ backgroundColor: poi.color }}
            >
              {stopNumber}
            </span>
          </span>
          <div className="min-w-0">
            <span
              className={`text-[10px] font-semibold uppercase tracking-widest block truncate ${
                isDark ? 'text-stone-400' : 'text-stone-500'
              }`}
            >
              {poi.category}
            </span>
            <h4
              className={`font-editorial text-sm font-bold leading-snug truncate transition-colors group-hover:text-[#FF6B4A] ${
                isSelected
                  ? 'text-[#FF6B4A]'
                  : isDark
                  ? 'text-[#F4F1EA]'
                  : 'text-[#1C1C1E]'
              }`}
              title={poi.name}
            >
              {poi.name}
            </h4>
          </div>
        </div>

        <span
          className={`flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
            isDark
              ? 'bg-amber-500/15 text-amber-300 border-amber-400/25'
              : 'bg-amber-500/10 text-amber-800 border-amber-600/20'
          }`}
        >
          <Sparkles className="w-3 h-3 text-[#D97706]" />
          {poi.vibeScore}%
        </span>
      </div>

      {poi.address && (
        <div
          className={`mt-1.5 flex items-center gap-1 text-[11px] font-medium truncate ${
            isDark ? 'text-stone-300' : 'text-stone-700'
          }`}
          title={poi.address}
        >
          <MapPin className="w-3 h-3 text-[#FF6B4A] flex-shrink-0" />
          <span className="truncate">{poi.address}</span>
        </div>
      )}

      <p
        className={`mt-1.5 text-xs italic line-clamp-1 ${
          isDark ? 'text-stone-400' : 'text-stone-600'
        }`}
      >
        “{poi.note}”
      </p>

      <div
        className={`mt-2.5 pt-2 border-t flex items-center justify-between text-[11px] ${
          isDark
            ? 'border-white/10 text-stone-400'
            : 'border-[#1C1C1E]/10 text-stone-600'
        }`}
      >
        <span className="inline-flex items-center gap-1 font-medium">
          <Navigation className="w-3 h-3 text-[#FF6B4A]" />+{poi.detourMeters}m detour
        </span>
        <span
          className={`inline-flex items-center gap-1 font-semibold ${
            isSelected
              ? 'text-[#FF6B4A]'
              : isDark
              ? 'text-stone-300'
              : 'text-[#1C1C1E]'
          }`}
        >
          {isSelected ? 'Viewing on Map' : 'Field Note →'}
        </span>
      </div>
    </button>
  );
}

// src/components/ActiveDriftHUD.jsx
import React from 'react';
import {
  Pause,
  Play,
  CheckCircle2,
  Navigation,
  Sparkles,
  FastForward,
  X,
  MapPin,
  Footprints,
  Zap,
} from 'lucide-react';

function formatElapsed(seconds = 0) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function ActiveDriftHUD({
  theme = 'paper',
  route,
  isPaused = false,
  onTogglePause,
  isSimulating = false,
  onToggleSimulate,
  elapsedSeconds = 0,
  progressPct = 0,
  coveredKm = 0,
  coveredSteps = 0,
  nextStop = null,
  distanceToNextStopMeters = null,
  visitedStopIds = [],
  onMarkStopVisited,
  onSelectPOI,
  onFinishDrift,
  onCancelDrift,
}) {
  const isDark = theme === 'dark';
  const totalStops = route?.pois?.length || 0;
  const visitedCount = visitedStopIds.length;
  const isRun = route?.activityMode === 'run';

  return (
    <div className="pointer-events-none absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-20 w-[calc(100%-1.5rem)] max-w-md transform-gpu will-change-transform">
      <section
        aria-label="Active Drift Live HUD"
        className={`pointer-events-auto w-full transform-gpu will-change-transform border rounded-3xl p-4 sm:p-5 shadow-2xl transition-colors duration-300 ${
          isDark
            ? 'bg-[#18181B]/[0.96] border-white/15 text-[#F4F1EA] shadow-black/80'
            : 'bg-[#F4F1EA]/[0.96] border-[#1C1C1E]/15 text-[#1C1C1E] shadow-[0_16px_48px_rgba(28,28,30,0.22)]'
        }`}
      >
        {/* Top Status Row: Live Beacon + Simulate Toggle + Cancel */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              {!isPaused && (
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    isRun ? 'bg-emerald-400' : 'bg-[#FF6B4A]'
                  }`}
                />
              )}
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  isPaused
                    ? 'bg-amber-400'
                    : isRun
                    ? 'bg-emerald-500'
                    : 'bg-[#FF6B4A]'
                }`}
              />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-widest">
              {isPaused
                ? 'Drift Paused'
                : isRun
                ? 'Live Run Flow'
                : 'Live Walk Drift'}
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                isDark
                  ? 'bg-white/5 border-white/10 text-stone-300'
                  : 'bg-[#FAF8F5] border-[#1C1C1E]/10 text-stone-600'
              }`}
            >
              {visitedCount}/{totalStops} stops reached
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleSimulate}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border transition active:scale-95 ${
                isSimulating
                  ? 'bg-[#FF6B4A] text-white border-[#FF6B4A] shadow-sm shadow-[#FF6B4A]/30'
                  : isDark
                  ? 'bg-[#202024] border-white/15 text-stone-300 hover:border-white/30'
                  : 'bg-[#FAF8F5] border-[#1C1C1E]/15 text-stone-700 hover:border-[#1C1C1E]/30'
              }`}
              title="Simulate live GPS movement along the route for desktop testing"
            >
              <FastForward className="w-3 h-3" />
              {isSimulating ? 'Simulating GPS' : 'Simulate Move'}
            </button>

            <button
              type="button"
              onClick={onCancelDrift}
              className={`p-1.5 rounded-full border transition ${
                isDark
                  ? 'border-white/10 text-stone-400 hover:text-stone-200 hover:bg-white/5'
                  : 'border-[#1C1C1E]/10 text-stone-500 hover:text-[#1C1C1E] hover:bg-[#EAE5DB]/60'
              }`}
              title="Exit Active Drift without saving"
              aria-label="Exit Active Drift"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Live Telemetry Strip: Elapsed Time, Distance, Steps */}
        <div
          className={`mt-3 grid grid-cols-3 gap-2 p-3 rounded-2xl border ${
            isDark
              ? 'bg-[#202024] border-white/10'
              : 'bg-[#FAF8F5] border-[#1C1C1E]/10'
          }`}
        >
          <div>
            <span
              className={`text-[10px] uppercase tracking-wider font-semibold block ${
                isDark ? 'text-stone-400' : 'text-stone-500'
              }`}
            >
              Elapsed
            </span>
            <span className="font-editorial text-lg font-bold tracking-tight">
              {formatElapsed(elapsedSeconds)}
            </span>
          </div>

          <div>
            <span
              className={`text-[10px] uppercase tracking-wider font-semibold block ${
                isDark ? 'text-stone-400' : 'text-stone-500'
              }`}
            >
              Covered
            </span>
            <span className="font-editorial text-lg font-bold tracking-tight">
              {coveredKm.toFixed(2)}{' '}
              <span className="text-xs font-sans font-normal text-[#FF6B4A]">
                / {route?.distanceKm || 4.5} km
              </span>
            </span>
          </div>

          <div className="text-right">
            <span
              className={`text-[10px] uppercase tracking-wider font-semibold block ${
                isDark ? 'text-stone-400' : 'text-stone-500'
              }`}
            >
              Steps
            </span>
            <span className="font-editorial text-lg font-bold tracking-tight inline-flex items-center gap-1">
              {isRun ? (
                <Zap className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Footprints className="w-3.5 h-3.5 text-[#FF6B4A]" />
              )}
              {coveredSteps.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Route Progress Bar */}
        <div className="mt-2.5">
          <div
            className={`w-full h-1.5 rounded-full overflow-hidden ${
              isDark ? 'bg-white/10' : 'bg-[#EAE5DB]'
            }`}
          >
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                isRun ? 'bg-emerald-500' : 'bg-[#FF6B4A]'
              }`}
              style={{ width: `${Math.min(100, Math.max(3, progressPct))}%` }}
            />
          </div>
        </div>

        {/* Next Upcoming Curated Stop Spotlight */}
        <div className="mt-3">
          {nextStop ? (
            <div
              onClick={() => onSelectPOI && onSelectPOI(nextStop)}
              className={`cursor-pointer p-3 rounded-2xl border transition flex items-center justify-between gap-3 ${
                isDark
                  ? 'bg-[#202024] border-white/12 hover:border-[#FF6B4A]'
                  : 'bg-[#FAF8F5] border-[#1C1C1E]/12 hover:border-[#FF6B4A]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-lg border"
                  style={{
                    backgroundColor: `${nextStop.color}18`,
                    borderColor: `${nextStop.color}38`,
                    color: nextStop.color,
                  }}
                >
                  {nextStop.icon}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#FF6B4A]">
                      Next Stop • {nextStop.category}
                    </span>
                  </div>
                  <h4 className="font-editorial text-sm font-bold truncate">
                    {nextStop.name}
                  </h4>
                  {nextStop.address && (
                    <p
                      className={`text-[11px] truncate flex items-center gap-1 ${
                        isDark ? 'text-stone-400' : 'text-stone-600'
                      }`}
                    >
                      <MapPin className="w-3 h-3 text-[#FF6B4A] flex-shrink-0" />
                      {nextStop.address}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-end flex-shrink-0 gap-1">
                <span
                  className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
                    distanceToNextStopMeters !== null &&
                    distanceToNextStopMeters <= 60
                      ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                      : isDark
                      ? 'bg-white/10 text-[#F4F1EA]'
                      : 'bg-[#EAE5DB] text-[#1C1C1E]'
                  }`}
                >
                  <Navigation className="w-3 h-3 text-[#FF6B4A]" />
                  {distanceToNextStopMeters !== null
                    ? `${distanceToNextStopMeters}m`
                    : 'Ahead'}
                </span>
                {onMarkStopVisited && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkStopVisited(nextStop.id);
                    }}
                    className="text-[10px] font-semibold text-[#FF6B4A] hover:underline"
                  >
                    Check in ✓
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div
              className={`p-3 rounded-2xl border flex items-center justify-between ${
                isDark
                  ? 'bg-emerald-500/10 border-emerald-400/25 text-emerald-300'
                  : 'bg-emerald-500/10 border-emerald-600/25 text-emerald-900'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Sparkles className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>
                  All curated stops visited! Complete your drift to log it to the
                  Hall of Fame.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Primary Controls: Pause/Resume & Finish & Save Drift */}
        <div className="mt-3 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onTogglePause}
            className={`px-4 py-2.5 rounded-2xl border font-semibold text-xs inline-flex items-center justify-center gap-1.5 transition active:scale-95 ${
              isDark
                ? 'bg-[#202024] border-white/15 text-[#F4F1EA] hover:border-white/30'
                : 'bg-[#FAF8F5] border-[#1C1C1E]/15 text-[#1C1C1E] hover:border-[#1C1C1E]/35'
            }`}
          >
            {isPaused ? (
              <>
                <Play className="w-3.5 h-3.5 text-[#FF6B4A]" />
                Resume
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5 text-amber-500" />
                Pause
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onFinishDrift}
            className="flex-1 py-2.5 px-4 rounded-2xl bg-[#FF6B4A] hover:bg-[#e85d3d] active:scale-98 text-white font-semibold text-xs inline-flex items-center justify-center gap-2 shadow-lg shadow-[#FF6B4A]/30 transition"
          >
            <CheckCircle2 className="w-4 h-4" />
            Finish &amp; Save Drift
          </button>
        </div>
      </section>
    </div>
  );
}

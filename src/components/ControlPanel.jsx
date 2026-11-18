// src/components/ControlPanel.jsx
import React, { useState, useEffect } from 'react';
import {
  Compass,
  CalendarClock,
  Footprints,
  Zap,
  Shuffle,
  Award,
  Clock,
  ShieldCheck,
  Mountain,
  Heart,
  Repeat,
  ArrowRight,
  Search,
  MapPin,
  Loader2,
  X,
  Play,
  Bookmark,
  Trash2,
  Sparkles,
  CheckCircle2,
  Utensils,
  Coffee,
} from 'lucide-react';
import { stepsToKm, geocodeDestination } from '../utils/router';
import { STOP_VIBE_MODES } from '../utils/pois';
import { getCombinedHallOfFameRoutes } from '../utils/storage';
import POICard from './POICard';

export default function ControlPanel({
  theme = 'paper',
  origin,
  routeType = 'loop',
  setRouteType,
  destination,
  destinationLabel,
  onSelectDestination,
  planMode,
  setPlanMode,
  activityMode,
  setActivityMode,
  stopVibe = 'all',
  setStopVibe,
  steps,
  setSteps,
  scheduledTime = '18:30',
  setScheduledTime,
  route,
  routes = [],
  selectedRouteId = null,
  onSelectRoute,
  isRouting = false,
  selectedPOI,
  onSelectPOI,
  onRegenerate,
  onLoadPreset,
  driftHistory,
  onStartDrift,
  onSaveRoute,
  onLoadSavedRoute,
  onToggleFavoriteRoute,
  onDeleteSavedRoute,
}) {
  const [activeTab, setActiveTab] = useState('discover'); // 'discover' | 'hallOfFame'
  const [routineDay, setRoutineDay] = useState('Today');

  const hallOfFameList = getCombinedHallOfFameRoutes(driftHistory);
  const exploredStopsCount = driftHistory?.visitedPoiNames?.length || 0;
  const isCurrentRouteSaved = Boolean(
    route?.id && driftHistory?.routes?.some((r) => r.id === route.id)
  );
  const freshStopCount =
    route?.pois?.filter((p) => p.isFreshDiscovery !== false).length || 0;

  // Geocoding search states for Point A -> Point B mode
  const [searchQuery, setSearchQuery] = useState(destinationLabel || '');
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const isDark = theme === 'dark';
  const displayDistanceKm = route?.distanceKm || stepsToKm(steps);
  const displaySteps = route?.steps || steps;

  // Keep search input synchronized when user taps on the map to drop Point B
  useEffect(() => {
    if (destinationLabel) {
      setSearchQuery(destinationLabel);
    }
  }, [destinationLabel]);

  // Debounced Mapbox Geocoding autocomplete
  useEffect(() => {
    if (routeType !== 'pointToPoint') return;
    const trimmed = searchQuery.trim();

    if (
      !trimmed ||
      trimmed.length < 2 ||
      trimmed === destinationLabel
    ) {
      setSuggestions([]);
      setIsSearching(false);
      setHasSearched(false);
      return;
    }

    const controller = new AbortController();
    setIsSearching(true);

    const timer = setTimeout(async () => {
      const results = await geocodeDestination(trimmed, origin, controller.signal);
      setSuggestions(results);
      setIsSearching(false);
      setHasSearched(true);
      setShowDropdown(true);
    }, 240);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, destinationLabel, routeType, origin]);

  const handlePickSuggestion = (item) => {
    setSearchQuery(item.name);
    setSuggestions([]);
    setHasSearched(false);
    setShowDropdown(false);
    if (onSelectDestination) {
      onSelectDestination(item.coords, item.name);
    }
  };

  return (
    <div className="pointer-events-none absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-20 w-[calc(100%-1.5rem)] max-w-md">
      <section
        aria-label="Stray Route Controls"
        className={`pointer-events-auto w-full backdrop-blur-xl border rounded-3xl p-4 sm:p-5 shadow-2xl transition-colors duration-300 ${
          isDark
            ? 'bg-[#18181B]/95 border-white/15 text-[#F4F1EA] shadow-black/70'
            : 'bg-[#F4F1EA]/95 border-[#1C1C1E]/15 text-[#1C1C1E] shadow-[0_16px_48px_rgba(28,28,30,0.18)]'
        }`}
      >
      {/* Grab Handle for Mobile Sheet */}
      <div
        className={`w-10 h-1 rounded-full mx-auto mb-3 sm:hidden ${
          isDark ? 'bg-white/20' : 'bg-[#1C1C1E]/20'
        }`}
      />

      {/* 1. Top Row: Timing Mode (Instant vs Planner) + Route Shape (Loop vs Point A -> B) */}
      <div className="grid grid-cols-2 gap-2">
        {/* Timing Switcher */}
        <div
          className={`grid grid-cols-2 gap-1 p-1 rounded-2xl border ${
            isDark
              ? 'bg-[#202024] border-white/10'
              : 'bg-[#EAE5DB] border-[#1C1C1E]/10'
          }`}
        >
          <button
            type="button"
            onClick={() => setPlanMode('instant')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-[11px] font-semibold transition-all ${
              planMode === 'instant'
                ? 'bg-[#FF6B4A] text-white shadow-sm shadow-[#FF6B4A]/30'
                : isDark
                ? 'text-stone-400 hover:text-stone-200'
                : 'text-stone-600 hover:text-[#1C1C1E]'
            }`}
          >
            <Compass className="w-3 h-3" />
            Drift
          </button>
          <button
            type="button"
            onClick={() => setPlanMode('planner')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-[11px] font-semibold transition-all ${
              planMode === 'planner'
                ? 'bg-[#FF6B4A] text-white shadow-sm shadow-[#FF6B4A]/30'
                : isDark
                ? 'text-stone-400 hover:text-stone-200'
                : 'text-stone-600 hover:text-[#1C1C1E]'
            }`}
          >
            <CalendarClock className="w-3 h-3" />
            Plan
          </button>
        </div>

        {/* Route Shape Switcher: Closed Loop vs Point A -> B */}
        <div
          className={`grid grid-cols-2 gap-1 p-1 rounded-2xl border ${
            isDark
              ? 'bg-[#202024] border-white/10'
              : 'bg-[#EAE5DB] border-[#1C1C1E]/10'
          }`}
        >
          <button
            type="button"
            onClick={() => setRouteType('loop')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-[11px] font-semibold transition-all ${
              routeType === 'loop'
                ? isDark
                  ? 'bg-[#F4F1EA] text-[#1C1C1E] shadow-sm'
                  : 'bg-[#1C1C1E] text-[#F4F1EA] shadow-sm'
                : isDark
                ? 'text-stone-400 hover:text-stone-200'
                : 'text-stone-600 hover:text-[#1C1C1E]'
            }`}
          >
            <Repeat className="w-3 h-3" />
            Loop
          </button>
          <button
            type="button"
            onClick={() => setRouteType('pointToPoint')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-[11px] font-semibold transition-all ${
              routeType === 'pointToPoint'
                ? isDark
                  ? 'bg-[#F4F1EA] text-[#1C1C1E] shadow-sm'
                  : 'bg-[#1C1C1E] text-[#F4F1EA] shadow-sm'
                : isDark
                ? 'text-stone-400 hover:text-stone-200'
                : 'text-stone-600 hover:text-[#1C1C1E]'
            }`}
          >
            <ArrowRight className="w-3 h-3" />
            Point A→B
          </button>
        </div>
      </div>

      {/* Routine Planner Contextual Bar */}
      {planMode === 'planner' && (
        <div
          className={`mt-2.5 flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs ${
            isDark
              ? 'bg-[#202024] border-white/10 text-stone-300'
              : 'bg-[#FAF8F5] border-[#1C1C1E]/12 text-stone-700'
          }`}
        >
          <div className="flex items-center gap-1.5">
            {['Today', 'Tomorrow', 'Sun AM'].map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => setRoutineDay(day)}
                className={`px-2 py-1 rounded-lg font-semibold transition ${
                  routineDay === day
                    ? isDark
                      ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                      : 'bg-amber-500/15 text-amber-900 border border-amber-600/30'
                    : isDark
                    ? 'text-stone-400 hover:text-stone-200'
                    : 'text-stone-500 hover:text-[#1C1C1E]'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 font-semibold">
            <Clock className="w-3.5 h-3.5 text-[#FF6B4A]" />
            <input
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime && setScheduledTime(e.target.value)}
              className="bg-transparent text-xs font-bold focus:outline-none"
            />
          </label>
        </div>
      )}

      {/* Point A -> Point B Destination Search Bar (Mapbox Geocoding + Map Tap) */}
      {routeType === 'pointToPoint' && (
        <div className="relative mt-2.5">
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-2xl border transition ${
              isDark
                ? 'bg-[#202024] border-white/15 focus-within:border-[#FF6B4A]'
                : 'bg-[#FAF8F5] border-[#1C1C1E]/15 focus-within:border-[#FF6B4A] shadow-[0_2px_8px_rgba(28,28,30,0.04)]'
            }`}
          >
            <Search className="w-4 h-4 text-[#FF6B4A] flex-shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowDropdown(true);
              }}
              placeholder="Search Point B (or tap anywhere on map)..."
              className="w-full bg-transparent text-xs font-medium focus:outline-none placeholder:text-stone-400"
            />
            {isSearching && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF6B4A] flex-shrink-0" />
            )}
            {searchQuery && !isSearching && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSuggestions([]);
                  setHasSearched(false);
                  setShowDropdown(false);
                }}
                className="text-stone-400 hover:text-[#FF6B4A]"
                aria-label="Clear destination search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Autocomplete Suggestions Dropdown */}
          {showDropdown && suggestions.length > 0 && (
            <ul
              className={`absolute left-0 right-0 bottom-full mb-1.5 z-30 rounded-2xl border overflow-hidden shadow-xl ${
                isDark
                  ? 'bg-[#202024] border-white/15 text-[#F4F1EA]'
                  : 'bg-[#FAF8F5] border-[#1C1C1E]/15 text-[#1C1C1E]'
              }`}
            >
              {suggestions.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handlePickSuggestion(item)}
                    className={`w-full text-left px-3.5 py-2.5 text-xs flex items-center justify-between gap-2.5 border-b last:border-b-0 transition ${
                      isDark
                        ? 'border-white/5 hover:bg-white/5'
                        : 'border-[#1C1C1E]/5 hover:bg-[#EAE5DB]/60'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <MapPin className="w-3.5 h-3.5 text-[#FF6B4A] mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-editorial font-bold truncate">
                            {item.name}
                          </span>
                          {item.category && (
                            <span
                              className={`text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.2 rounded border flex-shrink-0 ${
                                isDark
                                  ? 'bg-white/5 border-white/10 text-stone-400'
                                  : 'bg-[#F4F1EA] border-[#1C1C1E]/10 text-stone-600'
                              }`}
                            >
                              {item.category}
                            </span>
                          )}
                        </div>
                        <div
                          className={`text-[10px] truncate ${
                            isDark ? 'text-stone-400' : 'text-stone-500'
                          }`}
                        >
                          {item.fullName}
                        </div>
                      </div>
                    </div>

                    {item.distanceLabel && (
                      <span
                        className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          isDark
                            ? 'bg-[#FF6B4A]/15 border-[#FF6B4A]/30 text-[#FF6B4A]'
                            : 'bg-[#FF6B4A]/10 border-[#FF6B4A]/25 text-[#FF6B4A]'
                        }`}
                      >
                        {item.distanceLabel}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Empty-state message when no local walkable destination matches */}
          {showDropdown &&
            hasSearched &&
            !isSearching &&
            suggestions.length === 0 && (
              <div
                className={`absolute left-0 right-0 bottom-full mb-1.5 z-30 rounded-2xl border px-3.5 py-3 text-xs shadow-xl ${
                  isDark
                    ? 'bg-[#202024] border-white/15 text-stone-300'
                    : 'bg-[#FAF8F5] border-[#1C1C1E]/15 text-stone-600'
                }`}
              >
                No nearby walkable spots found — try a street, park, or metro
                station
              </div>
            )}
        </div>
      )}

      {/* 2. Activity Mode Switcher: Walk vs Run */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex-1 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setActivityMode('walk')}
            className={`flex items-center gap-2.5 p-2.5 rounded-2xl border text-left transition-all ${
              activityMode === 'walk'
                ? isDark
                  ? 'bg-[#242429] border-[#FF6B4A] text-[#F4F1EA]'
                  : 'bg-[#FAF8F5] border-[#FF6B4A] text-[#1C1C1E] shadow-sm'
                : isDark
                ? 'bg-[#202024]/70 border-white/10 text-stone-400 hover:border-white/20'
                : 'bg-[#EAE5DB]/60 border-[#1C1C1E]/10 text-stone-600 hover:border-[#1C1C1E]/25'
            }`}
          >
            <span className="p-2 rounded-xl bg-[#FF6B4A]/15 text-[#FF6B4A]">
              <Footprints className="w-4 h-4" />
            </span>
            <div>
              <div className="font-editorial text-xs font-bold">Walk Drift</div>
              <div className={`text-[10px] ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
                Bistros, Coffee &amp; Gems
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActivityMode('run')}
            className={`flex items-center gap-2.5 p-2.5 rounded-2xl border text-left transition-all ${
              activityMode === 'run'
                ? isDark
                  ? 'bg-[#242429] border-emerald-400 text-[#F4F1EA]'
                  : 'bg-[#FAF8F5] border-emerald-600 text-[#1C1C1E] shadow-sm'
                : isDark
                ? 'bg-[#202024]/70 border-white/10 text-stone-400 hover:border-white/20'
                : 'bg-[#EAE5DB]/60 border-[#1C1C1E]/10 text-stone-600 hover:border-[#1C1C1E]/25'
            }`}
          >
            <span
              className={`p-2 rounded-xl ${
                isDark
                  ? 'bg-emerald-400/15 text-emerald-400'
                  : 'bg-emerald-600/15 text-emerald-700'
              }`}
            >
              <Zap className="w-4 h-4" />
            </span>
            <div>
              <div className="font-editorial text-xs font-bold">Run Flow</div>
              <div className={`text-[10px] ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
                Flat &amp; Zero-Light
              </div>
            </div>
          </button>
        </div>

        <button
          type="button"
          onClick={onRegenerate}
          title={
            routeType === 'pointToPoint'
              ? 'Spin alternative side-street corridor between A and B'
              : 'Spin a fresh street loop direction'
          }
          className="h-full px-3.5 py-3 rounded-2xl bg-[#FF6B4A] hover:bg-[#e85d3d] active:scale-95 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-[#FF6B4A]/25 transition"
        >
          <Shuffle className={`w-4 h-4 ${isRouting ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Spin</span>
        </button>
      </div>

      {/* 2b. Curated Stop Vibe Selector (Walk Drift mode: All Gems / Niche Eats / Coffee & Culture) */}
      {activityMode === 'walk' && (
        <div
          role="group"
          aria-label="Curated Stop Vibe Filter"
          className={`mt-2 grid grid-cols-3 gap-1 p-1 rounded-2xl border ${
            isDark
              ? 'bg-[#202024] border-white/10'
              : 'bg-[#EAE5DB]/75 border-[#1C1C1E]/10'
          }`}
        >
          {STOP_VIBE_MODES.map((vibe) => {
            const isActive = stopVibe === vibe.id;
            const VibeIcon =
              vibe.id === 'eats'
                ? Utensils
                : vibe.id === 'culture'
                ? Coffee
                : Sparkles;
            return (
              <button
                key={vibe.id}
                type="button"
                onClick={() => {
                  if (onSelectPOI) onSelectPOI(null);
                  if (setStopVibe) setStopVibe(vibe.id);
                }}
                title={vibe.shortDesc}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-[11px] font-semibold transition-all ${
                  isActive
                    ? isDark
                      ? 'bg-[#2A2A30] text-[#FF6B4A] border border-[#FF6B4A]/40 shadow-sm'
                      : 'bg-[#FAF8F5] text-[#1C1C1E] border border-[#FF6B4A]/45 shadow-sm'
                    : isDark
                    ? 'text-stone-400 hover:text-stone-200'
                    : 'text-stone-600 hover:text-[#1C1C1E]'
                }`}
              >
                <VibeIcon
                  className={`w-3 h-3 flex-shrink-0 ${
                    isActive ? 'text-[#FF6B4A]' : 'opacity-75'
                  }`}
                />
                <span className="truncate">{vibe.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 3. Editorial Distance / Step Panel (Slider in Loop mode, Real A->B Readout in Point-to-Point mode) */}
      <div
        className={`mt-3 p-3.5 rounded-2xl border ${
          isDark
            ? 'bg-[#202024] border-white/10'
            : 'bg-[#FAF8F5] border-[#1C1C1E]/12 shadow-[0_2px_8px_rgba(28,28,30,0.03)]'
        }`}
      >
        <div className="flex items-baseline justify-between mb-1.5">
          <div>
            <span
              className={`text-[10px] uppercase tracking-widest font-semibold flex items-center gap-1.5 ${
                isDark ? 'text-stone-400' : 'text-stone-500'
              }`}
            >
              {routeType === 'pointToPoint'
                ? 'Street Corridor (Point A → B)'
                : 'Target Loop Effort'}
              {isRouting && (
                <span className="inline-flex items-center gap-1 text-[#FF6B4A] font-bold">
                  <Loader2 className="w-3 h-3 animate-spin" /> routing...
                </span>
              )}
            </span>
            <div className="flex items-baseline gap-2">
              <span className="font-editorial text-xl font-bold tracking-tight">
                {displaySteps.toLocaleString()}{' '}
                <span
                  className={`font-sans text-xs font-normal ${
                    isDark ? 'text-stone-400' : 'text-stone-500'
                  }`}
                >
                  steps
                </span>
              </span>
              <span className="text-xs font-bold text-[#FF6B4A]">
                ≈ {displayDistanceKm} km
              </span>
            </div>
          </div>

          <div className="text-right">
            <span
              className={`text-[10px] uppercase tracking-wider font-semibold block ${
                isDark ? 'text-stone-400' : 'text-stone-500'
              }`}
            >
              Est. Duration
            </span>
            <span className="font-editorial text-sm font-bold">
              ~{route?.estimatedMinutes || 35} min
            </span>
          </div>
        </div>

        {routeType === 'loop' ? (
          <input
            type="range"
            min={2000}
            max={20000}
            step={500}
            value={steps}
            onChange={(e) => setSteps(Number(e.target.value))}
            aria-label="Target steps slider"
            className={`w-full accent-[#FF6B4A] h-1.5 rounded-lg cursor-pointer ${
              isDark ? 'bg-stone-700' : 'bg-[#EAE5DB]'
            }`}
          />
        ) : (
          <div
            className={`text-[11px] flex items-center justify-between py-1 px-2.5 rounded-xl ${
              isDark ? 'bg-white/5 text-stone-300' : 'bg-[#F4F1EA] text-stone-600'
            }`}
          >
            <span className="truncate">
              🏁 <strong>Point B:</strong> {destinationLabel || 'Tap map or search above'}
            </span>
            <span className="text-[10px] text-[#FF6B4A] font-semibold ml-2 flex-shrink-0">
              Tap map to move
            </span>
          </div>
        )}

        {/* Route Comfort Badges */}
        {route?.metrics && (
          <div
            className={`mt-2.5 pt-2 border-t flex items-center justify-between text-[11px] font-medium ${
              isDark
                ? 'border-white/10 text-stone-300'
                : 'border-[#1C1C1E]/10 text-stone-700'
            }`}
          >
            <span className="inline-flex items-center gap-1">
              <ShieldCheck
                className={`w-3.5 h-3.5 ${
                  isDark ? 'text-emerald-400' : 'text-emerald-700'
                }`}
              />
              {route.metrics.lowTrafficPct}% Quiet Streets
            </span>
            <span className="inline-flex items-center gap-1">
              <Mountain className="w-3.5 h-3.5 text-[#D97706]" />+
              {route.metrics.elevationGainMeters}m Gain
            </span>
            <span className={isDark ? 'text-stone-400' : 'text-stone-500'}>
              {route.metrics.trafficLightsAvoided} lights bypassed
            </span>
          </div>
        )}
      </div>

      {/* 3b. Compact 3-Column Route Alternatives Selector Strip (Apple Maps / Citymapper style) */}
      {routes.length > 1 && (
        <div
          role="radiogroup"
          aria-label="Route Alternatives"
          className="mt-2.5 grid grid-cols-3 gap-1.5"
        >
          {routes.slice(0, 3).map((candidate, idx) => {
            const isSelected =
              (selectedRouteId && candidate.id === selectedRouteId) ||
              (!selectedRouteId && idx === 0);
            const stopCount = candidate?.pois?.length || 0;
            const label =
              candidate.variantLabel ||
              (idx === 0
                ? 'Curated Drift'
                : idx === 1
                ? 'Quiet Alleys'
                : 'Scenic Arc');

            return (
              <button
                key={candidate.id || idx}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onSelectRoute && onSelectRoute(candidate.id)}
                className={`text-left px-2.5 py-2 rounded-2xl border transition-all ${
                  isSelected
                    ? isDark
                      ? 'bg-[#26262C] border-[#FF6B4A] ring-1 ring-[#FF6B4A]/35 shadow-sm'
                      : 'bg-[#FAF8F5] border-[#FF6B4A] ring-1 ring-[#FF6B4A]/35 shadow-[0_4px_14px_rgba(255,107,74,0.14)]'
                    : isDark
                    ? 'bg-[#202024]/75 border-white/10 text-stone-400 hover:border-white/25 hover:text-stone-200'
                    : 'bg-[#EAE5DB]/60 border-[#1C1C1E]/10 text-stone-600 hover:border-[#1C1C1E]/25 hover:text-[#1C1C1E]'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`font-editorial text-[11px] font-bold truncate ${
                      isSelected
                        ? 'text-[#FF6B4A]'
                        : isDark
                        ? 'text-[#F4F1EA]'
                        : 'text-[#1C1C1E]'
                    }`}
                  >
                    {label}
                  </span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      isSelected
                        ? 'bg-[#FF6B4A]'
                        : isDark
                        ? 'bg-zinc-600'
                        : 'bg-stone-400'
                    }`}
                  />
                </div>
                <div
                  className={`text-[10px] font-semibold mt-0.5 truncate ${
                    isSelected
                      ? isDark
                        ? 'text-stone-200'
                        : 'text-[#1C1C1E]'
                      : isDark
                      ? 'text-stone-400'
                      : 'text-stone-600'
                  }`}
                >
                  {candidate.estimatedMinutes} min • {candidate.distanceKm} km
                </div>
                <div
                  className={`text-[9px] mt-0.5 truncate ${
                    isDark ? 'text-stone-400' : 'text-stone-500'
                  }`}
                >
                  {stopCount} stops • {candidate.quietScore || candidate.metrics?.lowTrafficPct || 95}% calm
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* 4. Editorial Curated Discovery & Hall of Fame Switcher */}
      <div className="mt-3">
        <div
          className={`flex items-center justify-between mb-2 border-b pb-1.5 ${
            isDark ? 'border-white/10' : 'border-[#1C1C1E]/10'
          }`}
        >
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveTab('discover')}
              className={`font-editorial inline-flex items-center gap-1.5 text-xs font-bold pb-1 -mb-[7px] border-b-2 transition ${
                activeTab === 'discover'
                  ? 'border-[#FF6B4A] text-[#FF6B4A]'
                  : isDark
                  ? 'border-transparent text-stone-400 hover:text-stone-200'
                  : 'border-transparent text-stone-500 hover:text-[#1C1C1E]'
              }`}
            >
              <span>Curated Stops ({route?.pois?.length || 0})</span>
              {isRouting && (
                <span className="inline-flex items-center gap-1 text-[10px] font-sans font-semibold text-[#FF6B4A] animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" /> discovering...
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('hallOfFame')}
              className={`font-editorial inline-flex items-center gap-1 text-xs font-bold pb-1 -mb-[7px] border-b-2 transition ${
                activeTab === 'hallOfFame'
                  ? 'border-[#D97706] text-[#D97706]'
                  : isDark
                  ? 'border-transparent text-stone-400 hover:text-stone-200'
                  : 'border-transparent text-stone-500 hover:text-[#1C1C1E]'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              Hall of Fame ({hallOfFameList.length})
            </button>
          </div>

          {/* Fresh Discovery & Explored Memory Badge */}
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
              isDark
                ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-300'
                : 'bg-emerald-600/10 border-emerald-600/20 text-emerald-800'
            }`}
            title="Already-visited stops are automatically filtered out on new Spins"
          >
            <Sparkles className="w-2.5 h-2.5 text-[#FF6B4A]" />
            {exploredStopsCount > 0
              ? `${exploredStopsCount} explored • ${freshStopCount} fresh`
              : `${freshStopCount} fresh spots`}
          </span>
        </div>

        {activeTab === 'discover' ? (
          isRouting ? (
            <div
              aria-label="Discovering real neighborhood stops"
              className="flex gap-2.5 overflow-x-auto pb-1 no-scrollbar"
            >
              {[0, 1, 2].map((skeletonIdx) => (
                <div
                  key={skeletonIdx}
                  className={`flex-shrink-0 w-64 rounded-2xl p-3.5 border animate-pulse ${
                    isDark
                      ? 'bg-[#202024] border-white/10'
                      : 'bg-[#FAF8F5] border-[#1C1C1E]/12'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-9 h-9 rounded-xl ${
                        isDark ? 'bg-white/10' : 'bg-[#EAE5DB]'
                      }`}
                    />
                    <div className="flex-1 space-y-1.5">
                      <div
                        className={`h-2.5 w-20 rounded ${
                          isDark ? 'bg-white/10' : 'bg-[#EAE5DB]'
                        }`}
                      />
                      <div
                        className={`h-3.5 w-32 rounded ${
                          isDark ? 'bg-white/15' : 'bg-[#1C1C1E]/15'
                        }`}
                      />
                    </div>
                  </div>
                  <div
                    className={`mt-2.5 h-2.5 w-40 rounded ${
                      isDark ? 'bg-white/10' : 'bg-[#EAE5DB]'
                    }`}
                  />
                  <div
                    className={`mt-2 h-2.5 w-48 rounded ${
                      isDark ? 'bg-white/5' : 'bg-[#EAE5DB]/70'
                    }`}
                  />
                  <div
                    className={`mt-3 pt-2 border-t flex justify-between ${
                      isDark ? 'border-white/10' : 'border-[#1C1C1E]/10'
                    }`}
                  >
                    <div
                      className={`h-2.5 w-16 rounded ${
                        isDark ? 'bg-white/10' : 'bg-[#EAE5DB]'
                      }`}
                    />
                    <div
                      className={`h-2.5 w-14 rounded ${
                        isDark ? 'bg-white/10' : 'bg-[#EAE5DB]'
                      }`}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex gap-2.5 overflow-x-auto pb-1 no-scrollbar">
              {route?.pois?.map((poi, idx) => (
                <POICard
                  key={poi.id}
                  poi={poi}
                  index={idx}
                  theme={theme}
                  isSelected={selectedPOI?.id === poi.id}
                  onSelect={onSelectPOI}
                />
              ))}
            </div>
          )
        ) : (
          <div className="flex gap-2.5 overflow-x-auto pb-1 no-scrollbar">
            {hallOfFameList.map((item) => {
              const isActiveRoute = route?.id === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (item.isUserSaved && item.waypoints?.length > 1 && onLoadSavedRoute) {
                      onLoadSavedRoute(item);
                    } else if (onLoadPreset) {
                      onLoadPreset({
                        activityMode: item.activityMode,
                        steps: item.steps,
                      });
                    }
                  }}
                  className={`cursor-pointer flex-shrink-0 w-64 rounded-2xl p-3.5 border transition ${
                    isActiveRoute
                      ? isDark
                        ? 'bg-[#242429] border-[#FF6B4A] ring-1 ring-[#FF6B4A]/35'
                        : 'bg-[#FAF8F5] border-[#FF6B4A] ring-1 ring-[#FF6B4A]/35'
                      : isDark
                      ? 'bg-[#202024] border-white/10 hover:border-amber-400/50'
                      : 'bg-[#FAF8F5] border-[#1C1C1E]/12 hover:border-[#FF6B4A] shadow-[0_2px_10px_rgba(28,28,30,0.04)]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
                    <span className="text-[#D97706] truncate flex items-center gap-1">
                      {item.completed && (
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                      )}
                      {item.curator}
                      {item.dateLabel ? ` • ${item.dateLabel}` : ''}
                    </span>

                    {item.isUserSaved ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavoriteRoute && onToggleFavoriteRoute(item.id);
                          }}
                          className="p-0.5 rounded hover:bg-black/5"
                          title={item.isFavorite ? 'Unfavorite route' : 'Favorite route'}
                        >
                          <Heart
                            className={`w-3.5 h-3.5 ${
                              item.isFavorite
                                ? 'fill-[#FF6B4A] text-[#FF6B4A]'
                                : 'text-stone-400'
                            }`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSavedRoute && onDeleteSavedRoute(item.id);
                          }}
                          className="p-0.5 rounded text-stone-400 hover:text-red-500"
                          title="Delete saved route"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[#D97706]">
                        <Heart className="w-3 h-3 fill-[#FF6B4A] text-[#FF6B4A]" />{' '}
                        {item.likes}
                      </span>
                    )}
                  </div>

                  <h4 className="font-editorial text-sm font-bold mt-0.5 truncate">
                    {item.title}
                  </h4>
                  <p
                    className={`text-[11px] mt-1 ${
                      isDark ? 'text-stone-400' : 'text-stone-600'
                    }`}
                  >
                    {item.distanceKm} km ({item.steps.toLocaleString()} steps) •{' '}
                    {item.trafficScore}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(item.tags || []).slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className={`text-[10px] px-2 py-0.5 rounded-full border font-medium truncate max-w-[115px] ${
                          isDark
                            ? 'bg-white/5 border-white/10 text-stone-300'
                            : 'bg-[#F4F1EA] border-[#1C1C1E]/10 text-stone-700'
                        }`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Primary Action Bar: Start Live Drift + Bookmark Route */}
      <div className="mt-3 pt-2.5 border-t border-black/10 dark:border-white/10 flex items-center gap-2">
        <button
          type="button"
          onClick={onStartDrift}
          disabled={isRouting}
          className={`flex-1 py-2.5 px-4 rounded-2xl font-semibold text-xs text-white flex items-center justify-center gap-2 shadow-lg transition active:scale-98 ${
            activityMode === 'run'
              ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/25'
              : 'bg-[#FF6B4A] hover:bg-[#e85d3d] shadow-[#FF6B4A]/30'
          } ${isRouting ? 'opacity-70 cursor-wait' : ''}`}
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>
            {activityMode === 'run' ? 'Start Run Flow' : 'Start Drift'}
          </span>
          <span className="text-[10px] opacity-85 font-normal">
            • {displayDistanceKm} km ({route?.pois?.length || 0} stops)
          </span>
        </button>

        <button
          type="button"
          onClick={onSaveRoute}
          className={`px-3.5 py-2.5 rounded-2xl border text-xs font-semibold inline-flex items-center gap-1.5 transition active:scale-95 ${
            isCurrentRouteSaved
              ? isDark
                ? 'bg-amber-400/20 border-amber-400/40 text-amber-300'
                : 'bg-amber-500/15 border-amber-600/35 text-amber-900'
              : isDark
              ? 'bg-[#202024] border-white/15 text-stone-200 hover:border-white/30'
              : 'bg-[#FAF8F5] border-[#1C1C1E]/15 text-[#1C1C1E] hover:border-[#1C1C1E]/35'
          }`}
          title={
            isCurrentRouteSaved
              ? 'Saved to Hall of Fame'
              : 'Save route & stops to Hall of Fame'
          }
        >
          <Bookmark
            className={`w-3.5 h-3.5 ${
              isCurrentRouteSaved ? 'fill-current text-[#D97706]' : ''
            }`}
          />
          <span>{isCurrentRouteSaved ? 'Saved' : 'Save'}</span>
        </button>
      </div>
      </section>
    </div>
  );
}

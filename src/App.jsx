// src/App.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LocateFixed, Sparkles, Moon, Sun, CheckCircle2 } from 'lucide-react';
import MapView from './components/MapView';
import ControlPanel from './components/ControlPanel';
import ActiveDriftHUD from './components/ActiveDriftHUD';
import {
  generateRouteAlternatives,
  generateFallbackRouteAlternatives,
  kmToSteps,
} from './utils/router';
import { distanceMeters } from './utils/pois';
import {
  loadDriftHistory,
  saveDriftRoute,
  toggleFavoriteRoute,
  deleteSavedRoute,
} from './utils/storage';

const DEFAULT_COORDS = [48.8638, 2.3615]; // Le Marais / Canal Saint-Martin, Paris
const DEFAULT_DESTINATION = [48.8566, 2.3522]; // Hôtel de Ville / Seine Quay, Paris

export default function App() {
  const [theme, setTheme] = useState('paper'); // 'paper' | 'dark'
  const [origin, setOrigin] = useState(DEFAULT_COORDS);
  const [routeType, setRouteType] = useState('loop'); // 'loop' | 'pointToPoint'
  const [destination, setDestination] = useState(DEFAULT_DESTINATION);
  const [destinationLabel, setDestinationLabel] = useState(
    'Seine Riverbanks, Paris'
  );
  const [planMode, setPlanMode] = useState('instant'); // 'instant' | 'planner'
  const [activityMode, setActivityMode] = useState('walk'); // 'walk' | 'run'
  const [stopVibe, setStopVibe] = useState('all'); // 'all' | 'eats' | 'culture'
  const [steps, setSteps] = useState(6000); // 6,000 steps ≈ 4.5 km
  const [scheduledTime, setScheduledTime] = useState('18:30');
  const [seed, setSeed] = useState(1);
  const [selectedPOI, setSelectedPOI] = useState(null);
  const [locating, setLocating] = useState(false);
  const [isRouting, setIsRouting] = useState(false);

  // Persistent Drift & POI Memory State
  const [driftHistory, setDriftHistory] = useState(() => loadDriftHistory());
  const [toastMessage, setToastMessage] = useState(null);
  const skipNextRouteFetchRef = useRef(false);

  // Live Active Drift State
  const [isDrifting, setIsDrifting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [livePosition, setLivePosition] = useState(DEFAULT_COORDS);
  const [simWaypointIndex, setSimWaypointIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [visitedStopIds, setVisitedStopIds] = useState([]);

  // Initialize with 3 synchronous fallback route alternatives so the map is populated immediately
  const [routeAlternatives, setRouteAlternatives] = useState(() =>
    generateFallbackRouteAlternatives({
      origin: DEFAULT_COORDS,
      destination: DEFAULT_DESTINATION,
      routeType: 'loop',
      steps: 6000,
      activityMode: 'walk',
      stopVibe: 'all',
      planMode: 'instant',
      seed: 1,
    })
  );
  const [selectedRouteId, setSelectedRouteId] = useState(null);

  const route =
    routeAlternatives.find((r) => r.id === selectedRouteId) ||
    routeAlternatives[0] ||
    null;

  const isDark = theme === 'dark';

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3400);
    return () => clearTimeout(t);
  }, [toastMessage]);

  const requestUserLocation = useCallback(() => {
    if (!('geolocation' in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userCoords = [pos.coords.latitude, pos.coords.longitude];
        setOrigin(userCoords);
        setLivePosition(userCoords);
        setDestination([
          Number((userCoords[0] + 0.0085).toFixed(6)),
          Number((userCoords[1] + 0.011).toFixed(6)),
        ]);
        setDestinationLabel('Dropped Pin • 1.2 km NE');
        setLocating(false);
      },
      () => {
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  }, []);

  useEffect(() => {
    requestUserLocation();
  }, [requestUserLocation]);

  // Fetch real pedestrian street-snapped geometry & fresh unvisited POIs from Mapbox
  useEffect(() => {
    if (skipNextRouteFetchRef.current) {
      skipNextRouteFetchRef.current = false;
      return;
    }

    const controller = new AbortController();
    setIsRouting(true);

    const timer = setTimeout(() => {
      generateRouteAlternatives({
        origin,
        destination,
        routeType,
        steps,
        activityMode,
        stopVibe,
        planMode,
        seed,
        visitedPoiNames: driftHistory.visitedPoiNames,
        visitedPoiIds: driftHistory.visitedPoiIds,
        exploredSectors: driftHistory.exploredSectors,
        signal: controller.signal,
      })
        .then((candidates) => {
          if (Array.isArray(candidates) && candidates.length > 0) {
            setRouteAlternatives(candidates);
            setSelectedRouteId(candidates[0].id);
          }
          setIsRouting(false);
        })
        .catch((err) => {
          if (err?.name !== 'AbortError') {
            setIsRouting(false);
          }
        });
    }, 120);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    origin,
    destination,
    routeType,
    steps,
    activityMode,
    stopVibe,
    planMode,
    seed,
    driftHistory.visitedPoiNames,
    driftHistory.visitedPoiIds,
    driftHistory.exploredSectors,
  ]);

  // Live Geolocation watchPosition during Active Drift (when not in Simulate mode)
  useEffect(() => {
    if (!isDrifting || isPaused || isSimulating) return;
    if (!('geolocation' in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLivePosition([
          Number(pos.coords.latitude.toFixed(6)),
          Number(pos.coords.longitude.toFixed(6)),
        ]);
      },
      () => {
        // Ignore geolocation watch errors when stationary/indoors
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 8000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isDrifting, isPaused, isSimulating]);

  // Simulated GPS movement along route.waypoints for desktop testing
  useEffect(() => {
    if (!isDrifting || isPaused || !isSimulating) return;
    const wps = route?.waypoints || [];
    if (wps.length < 2) return;

    const interval = setInterval(() => {
      setSimWaypointIndex((prev) => {
        const nextIdx = Math.min(wps.length - 1, prev + 1);
        setLivePosition(wps[nextIdx]);
        return nextIdx;
      });
    }, 750);

    return () => clearInterval(interval);
  }, [isDrifting, isPaused, isSimulating, route?.waypoints]);

  // Elapsed timer during Active Drift
  useEffect(() => {
    if (!isDrifting || isPaused) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isDrifting, isPaused]);

  // Auto-detect when livePosition passes within 55m of any Curated Stop
  useEffect(() => {
    if (!isDrifting || !livePosition || !route?.pois?.length) return;

    route.pois.forEach((poi) => {
      if (!poi?.coords) return;
      const dist = distanceMeters(livePosition, poi.coords);
      if (dist <= 55) {
        setVisitedStopIds((prev) =>
          prev.includes(poi.id) ? prev : [...prev, poi.id]
        );
      }
    });
  }, [isDrifting, livePosition, route?.pois]);

  // Compute Next Stop & Live Telemetry
  const nextStop =
    route?.pois?.find((p) => !visitedStopIds.includes(p.id)) || null;
  const distanceToNextStopMeters =
    nextStop && livePosition
      ? Math.round(distanceMeters(livePosition, nextStop.coords))
      : null;

  const totalWaypoints = route?.waypoints?.length || 1;
  const progressPct = isSimulating
    ? Math.round((simWaypointIndex / Math.max(1, totalWaypoints - 1)) * 100)
    : Math.min(
        100,
        Math.round(
          ((visitedStopIds.length / Math.max(1, route?.pois?.length || 3)) * 75) +
            Math.min(25, elapsedSeconds / 12)
        )
      );

  const totalDistanceKm = route?.distanceKm || 4.5;
  const coveredKm = Number(((totalDistanceKm * progressPct) / 100).toFixed(2));
  const coveredSteps = kmToSteps(coveredKm);

  const handleRegenerate = () => {
    setSelectedPOI(null);
    setSeed((prev) => prev + 1);
  };

  const handleLoadPreset = ({
    activityMode: presetActivity,
    steps: presetSteps,
  }) => {
    setSelectedPOI(null);
    setRouteType('loop');
    setActivityMode(presetActivity);
    setSteps(presetSteps);
    setSeed((prev) => prev + 1);
  };

  const handleSelectRoute = useCallback((routeId) => {
    setSelectedPOI(null);
    setSelectedRouteId(routeId);
  }, []);

  const handleLoadSavedRoute = (savedRoute) => {
    if (!savedRoute?.waypoints?.length) return;
    skipNextRouteFetchRef.current = true;
    setSelectedPOI(null);
    if (savedRoute.origin) setOrigin(savedRoute.origin);
    if (savedRoute.destination) setDestination(savedRoute.destination);
    setRouteType(savedRoute.routeType || 'loop');
    setActivityMode(savedRoute.activityMode || 'walk');
    if (savedRoute.stopVibe) setStopVibe(savedRoute.stopVibe);
    if (savedRoute.steps) setSteps(savedRoute.steps);
    const hydratedRoute = {
      ...savedRoute,
      variantLabel: savedRoute.variantLabel || 'Saved Drift',
      variantBadge: 'Hall of Fame',
      estimatedMinutes:
        savedRoute.durationMinutes || savedRoute.estimatedMinutes || 35,
    };
    setRouteAlternatives([hydratedRoute]);
    setSelectedRouteId(hydratedRoute.id);
    showToast(`Loaded "${savedRoute.title}" onto map`);
  };

  const handleSaveCurrentRoute = () => {
    if (!route) return;
    const updated = saveDriftRoute(route, {
      completed: false,
      isFavorite: true,
    });
    setDriftHistory(updated);
    showToast('✓ Saved to Hall of Fame • Stops added to discovery memory');
  };

  const handleStartDrift = () => {
    const startCoord = route?.waypoints?.[0] || origin;
    setSelectedPOI(null);
    setLivePosition(startCoord);
    setSimWaypointIndex(0);
    setElapsedSeconds(0);
    setVisitedStopIds([]);
    setIsPaused(false);
    setIsSimulating(false);
    setIsDrifting(true);
  };

  const handleFinishDrift = () => {
    const elapsedMins = Math.max(1, Math.round(elapsedSeconds / 60));
    const updated = saveDriftRoute(route, {
      completed: true,
      isFavorite: true,
      elapsedMinutes: elapsedMins,
    });
    setDriftHistory(updated);
    setIsDrifting(false);
    setIsSimulating(false);
    setIsPaused(false);
    showToast(
      '✓ Drift completed & saved! Next Spin will explore fresh stops.'
    );
  };

  const handleCancelDrift = () => {
    setIsDrifting(false);
    setIsSimulating(false);
    setIsPaused(false);
  };

  const handleMarkStopVisited = (stopId) => {
    if (!stopId) return;
    setVisitedStopIds((prev) =>
      prev.includes(stopId) ? prev : [...prev, stopId]
    );
  };

  const handleToggleFavoriteRoute = (routeId) => {
    const updated = toggleFavoriteRoute(routeId);
    setDriftHistory(updated);
  };

  const handleDeleteSavedRoute = (routeId) => {
    const updated = deleteSavedRoute(routeId);
    setDriftHistory(updated);
    showToast('Removed route from Hall of Fame');
  };

  const handleSelectDestination = (coords, label) => {
    setSelectedPOI(null);
    setDestination(coords);
    setDestinationLabel(
      label || `${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}`
    );
  };

  const handleMapSetDestination = (coords) => {
    setSelectedPOI(null);
    setDestination(coords);
    setDestinationLabel(
      `Dropped Pin (${coords[0].toFixed(4)}, ${coords[1].toFixed(4)})`
    );
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'paper' ? 'dark' : 'paper'));
  };

  return (
    <div
      className={`relative w-full h-[100dvh] overflow-hidden select-none transition-colors duration-300 ${
        isDark ? 'bg-[#18181B] text-[#F4F1EA]' : 'bg-[#F4F1EA] text-[#1C1C1E]'
      }`}
    >
      {/* Top Floating Editorial Masthead & Theme / GPS Controls */}
      <header className="pointer-events-none absolute top-3.5 inset-x-0 z-20 px-4 flex items-center justify-between max-w-md mx-auto">
        <div
          className={`pointer-events-auto flex items-center gap-2.5 px-4 py-2 rounded-full backdrop-blur-md border transition-colors ${
            isDark
              ? 'bg-[#18181B]/90 border-white/15 text-[#F4F1EA] shadow-lg shadow-black/30'
              : 'bg-[#FAF8F5]/95 border-[#1C1C1E]/15 text-[#1C1C1E] shadow-[0_4px_20px_rgba(28,28,30,0.08)]'
          }`}
        >
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isDrifting ? 'bg-emerald-500 animate-pulse' : 'bg-[#FF6B4A]'
            }`}
          />
          <span className="font-editorial italic font-bold tracking-tight text-base leading-none">
            Stray.
          </span>
          <span
            className={`text-[11px] font-medium pl-2 border-l flex items-center gap-1 ${
              isDark
                ? 'border-white/15 text-stone-300'
                : 'border-[#1C1C1E]/15 text-stone-600'
            }`}
          >
            <Sparkles className="w-3 h-3 text-[#D97706]" />
            {isDrifting
              ? 'Active Field Drift'
              : routeType === 'pointToPoint'
              ? 'Point A → B Drift'
              : planMode === 'instant'
              ? 'Issue Nº 01 • Live Loop'
              : 'Field Journal • Planner'}
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className={`p-2.5 rounded-full backdrop-blur-md border transition active:scale-95 ${
              isDark
                ? 'bg-[#18181B]/90 border-white/15 text-amber-300 hover:border-amber-400/50 shadow-lg'
                : 'bg-[#FAF8F5]/95 border-[#1C1C1E]/15 text-[#1C1C1E] hover:text-[#FF6B4A] shadow-[0_4px_20px_rgba(28,28,30,0.08)]'
            }`}
            title={
              isDark
                ? 'Switch to Warm Paper theme'
                : 'Switch to Warm Slate Dark theme'
            }
            aria-label="Toggle Paper and Dark theme"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={requestUserLocation}
            className={`p-2.5 rounded-full backdrop-blur-md border transition active:scale-95 ${
              isDark
                ? 'bg-[#18181B]/90 border-white/15 text-stone-200 hover:text-[#FF6B4A] shadow-lg'
                : 'bg-[#FAF8F5]/95 border-[#1C1C1E]/15 text-[#1C1C1E] hover:text-[#FF6B4A] shadow-[0_4px_20px_rgba(28,28,30,0.08)]'
            }`}
            title="Center on current GPS"
            aria-label="Center on current GPS"
          >
            <LocateFixed
              className={`w-4 h-4 ${
                locating ? 'animate-spin text-[#FF6B4A]' : ''
              }`}
            />
          </button>
        </div>
      </header>

      {/* Editorial Toast Notification */}
      {toastMessage && (
        <div className="pointer-events-none absolute top-16 left-1/2 -translate-x-1/2 z-30 w-max max-w-[90vw]">
          <div
            className={`px-3.5 py-2 rounded-full border text-xs font-semibold flex items-center gap-2 shadow-xl backdrop-blur-md ${
              isDark
                ? 'bg-[#202024]/95 border-emerald-400/35 text-[#F4F1EA]'
                : 'bg-[#1C1C1E]/95 border-[#1C1C1E] text-[#F4F1EA]'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Full-Viewport Interactive Mapbox Editorial Map Engine */}
      <MapView
        theme={theme}
        routeType={routeType}
        origin={origin}
        destination={destination}
        route={route}
        routes={routeAlternatives}
        selectedRouteId={route?.id}
        onSelectRoute={handleSelectRoute}
        selectedPOI={selectedPOI}
        onSelectPOI={setSelectedPOI}
        onMapSetDestination={handleMapSetDestination}
        isDrifting={isDrifting}
        livePosition={livePosition}
        nextStop={nextStop}
        visitedStopIds={visitedStopIds}
      />

      {/* Bottom Floating Sheet: Active Drift HUD vs Route Planner ControlPanel */}
      {isDrifting ? (
        <ActiveDriftHUD
          theme={theme}
          route={route}
          isPaused={isPaused}
          onTogglePause={() => setIsPaused((prev) => !prev)}
          isSimulating={isSimulating}
          onToggleSimulate={() => setIsSimulating((prev) => !prev)}
          elapsedSeconds={elapsedSeconds}
          progressPct={progressPct}
          coveredKm={coveredKm}
          coveredSteps={coveredSteps}
          nextStop={nextStop}
          distanceToNextStopMeters={distanceToNextStopMeters}
          visitedStopIds={visitedStopIds}
          onMarkStopVisited={handleMarkStopVisited}
          onSelectPOI={setSelectedPOI}
          onFinishDrift={handleFinishDrift}
          onCancelDrift={handleCancelDrift}
        />
      ) : (
        <ControlPanel
          theme={theme}
          origin={origin}
          routeType={routeType}
          setRouteType={setRouteType}
          destination={destination}
          destinationLabel={destinationLabel}
          onSelectDestination={handleSelectDestination}
          planMode={planMode}
          setPlanMode={setPlanMode}
          activityMode={activityMode}
          setActivityMode={setActivityMode}
          stopVibe={stopVibe}
          setStopVibe={setStopVibe}
          steps={steps}
          setSteps={setSteps}
          scheduledTime={scheduledTime}
          setScheduledTime={setScheduledTime}
          route={route}
          routes={routeAlternatives}
          selectedRouteId={route?.id}
          onSelectRoute={handleSelectRoute}
          isRouting={isRouting}
          selectedPOI={selectedPOI}
          onSelectPOI={setSelectedPOI}
          onRegenerate={handleRegenerate}
          onLoadPreset={handleLoadPreset}
          driftHistory={driftHistory}
          onStartDrift={handleStartDrift}
          onSaveRoute={handleSaveCurrentRoute}
          onLoadSavedRoute={handleLoadSavedRoute}
          onToggleFavoriteRoute={handleToggleFavoriteRoute}
          onDeleteSavedRoute={handleDeleteSavedRoute}
        />
      )}
    </div>
  );
}

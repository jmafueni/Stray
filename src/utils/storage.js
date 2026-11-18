// src/utils/storage.js
import { HALL_OF_FAME_ROUTES } from './pois.js';

export const STORAGE_KEY = 'stray_drift_history_v1';

const DEFAULT_HISTORY_STATE = {
  routes: [],
  visitedPoiIds: [],
  visitedPoiNames: [],
  exploredSectors: [],
};

/**
 * Computes which of the 8 compass octants (0..7) a route primarily explores
 * relative to `origin`, based on its midpoint centroid.
 */
export function computeRouteSector(origin, waypoints = []) {
  if (!origin || !waypoints || waypoints.length < 2) return 0;
  const [oLat, oLng] = origin;

  // Average the middle 50% of waypoints to find the primary drift vector
  const startIdx = Math.floor(waypoints.length * 0.25);
  const endIdx = Math.max(startIdx + 1, Math.floor(waypoints.length * 0.75));
  let sumLat = 0;
  let sumLng = 0;
  let count = 0;

  for (let i = startIdx; i < endIdx; i++) {
    const pt = waypoints[i];
    if (Array.isArray(pt) && pt.length === 2) {
      sumLat += pt[0];
      sumLng += pt[1];
      count++;
    }
  }

  if (count === 0) return 0;
  const dLat = sumLat / count - oLat;
  const dLng = sumLng / count - oLng;
  const angleRad = Math.atan2(dLng, dLat); // 0 = North, PI/2 = East
  const normalizedDeg = ((angleRad * 180) / Math.PI + 360) % 360;
  return Math.floor(normalizedDeg / 45) % 8;
}

/**
 * Generates an editorial title for a saved or completed drift based on its stops and mode.
 */
export function buildEditorialRouteTitle(route) {
  if (route?.title) return route.title;

  const pois = route?.pois || [];
  const modeLabel = route?.activityMode === 'run' ? 'Tempo Flow' : 'Drift';
  const shapeLabel = route?.routeType === 'pointToPoint' ? 'Corridor' : 'Loop';

  if (pois.length >= 2) {
    const first = pois[0].name.split(/[•\-–,]/)[0].trim();
    const second = pois[1].category || 'Pocket Park';
    return `${first} & ${second} ${shapeLabel}`;
  }
  if (pois.length === 1) {
    return `${pois[0].name} ${modeLabel}`;
  }

  return `${modeLabel} ${shapeLabel} • ${route?.distanceKm || 4.5} km`;
}

/**
 * Loads persistent drift history from localStorage.
 */
export function loadDriftHistory() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_HISTORY_STATE };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_HISTORY_STATE };
    }
    const parsed = JSON.parse(raw);
    return {
      routes: Array.isArray(parsed?.routes) ? parsed.routes : [],
      visitedPoiIds: Array.isArray(parsed?.visitedPoiIds)
        ? parsed.visitedPoiIds
        : [],
      visitedPoiNames: Array.isArray(parsed?.visitedPoiNames)
        ? parsed.visitedPoiNames
        : [],
      exploredSectors: Array.isArray(parsed?.exploredSectors)
        ? parsed.exploredSectors
        : [],
    };
  } catch {
    return { ...DEFAULT_HISTORY_STATE };
  }
}

/**
 * Persists the drift history object to localStorage.
 */
function writeDriftHistory(state) {
  if (typeof window === 'undefined' || !window.localStorage) return state;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota errors
  }
  return state;
}

/**
 * Saves a completed or bookmarked route into localStorage and logs its POIs
 * and directional sector so future routes prioritize fresh venues and streets.
 */
export function saveDriftRoute(route, options = {}) {
  if (!route) return loadDriftHistory();

  const {
    completed = false,
    isFavorite = true,
    elapsedMinutes = null,
    visitedStopIds = null,
  } = options;

  const current = loadDriftHistory();
  const sector = computeRouteSector(route.origin, route.waypoints);
  const nowIso = new Date().toISOString();
  const formattedDate = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  const poisToRecord = Array.isArray(route.pois) ? route.pois : [];
  const nextVisitedIds = new Set(current.visitedPoiIds);
  const nextVisitedNames = new Set(current.visitedPoiNames);

  poisToRecord.forEach((poi) => {
    if (visitedStopIds && visitedStopIds.length > 0 && !visitedStopIds.includes(poi.id)) {
      return;
    }
    if (poi?.id) nextVisitedIds.add(String(poi.id));
    if (poi?.name) nextVisitedNames.add(poi.name.toLowerCase().trim());
  });

  const nextSectors = [
    sector,
    ...current.exploredSectors.filter((s) => s !== sector),
  ].slice(0, 6);

  const entryId = route.id || `drift-${Date.now()}`;
  const existingIdx = current.routes.findIndex((r) => r.id === entryId);

  const stopTags = poisToRecord
    .slice(0, 3)
    .map((p) => p.name)
    .filter(Boolean);

  const savedEntry = {
    id: entryId,
    title: buildEditorialRouteTitle(route),
    curator: completed ? '@you • Completed Drift' : '@you • Saved Route',
    date: nowIso,
    dateLabel: formattedDate,
    completed,
    isFavorite,
    isUserSaved: true,
    activityMode: route.activityMode || 'walk',
    stopVibe: route.stopVibe || 'all',
    routeType: route.routeType || 'loop',
    origin: route.origin,
    destination: route.destination || null,
    steps: route.steps || 6000,
    distanceKm: route.distanceKm || 4.5,
    durationMinutes: elapsedMinutes || route.estimatedMinutes || 35,
    waypoints: route.waypoints || [],
    pois: poisToRecord,
    metrics: route.metrics || null,
    trafficScore: `${route.metrics?.lowTrafficPct || 95}% Quiet Streets`,
    tags:
      stopTags.length > 0
        ? stopTags
        : [
            route.activityMode === 'run' ? 'Run Flow' : 'Walk Drift',
            `${route.distanceKm || 4.5} km`,
          ],
    bearingSector: sector,
    likes: completed ? 1 : 0,
  };

  let nextRoutes = [...current.routes];
  if (existingIdx >= 0) {
    nextRoutes[existingIdx] = {
      ...nextRoutes[existingIdx],
      ...savedEntry,
      completed: nextRoutes[existingIdx].completed || completed,
      isFavorite:
        options.isFavorite !== undefined
          ? isFavorite
          : nextRoutes[existingIdx].isFavorite,
    };
  } else {
    nextRoutes = [savedEntry, ...nextRoutes].slice(0, 30);
  }

  return writeDriftHistory({
    routes: nextRoutes,
    visitedPoiIds: Array.from(nextVisitedIds),
    visitedPoiNames: Array.from(nextVisitedNames),
    exploredSectors: nextSectors,
  });
}

/**
 * Toggles favorite status on a saved route.
 */
export function toggleFavoriteRoute(routeId) {
  const current = loadDriftHistory();
  const nextRoutes = current.routes.map((r) =>
    r.id === routeId ? { ...r, isFavorite: !r.isFavorite } : r
  );
  return writeDriftHistory({
    ...current,
    routes: nextRoutes,
  });
}

/**
 * Deletes a saved route from history.
 */
export function deleteSavedRoute(routeId) {
  const current = loadDriftHistory();
  const nextRoutes = current.routes.filter((r) => r.id !== routeId);
  return writeDriftHistory({
    ...current,
    routes: nextRoutes,
  });
}

/**
 * Combines user-saved/completed routes with editorial Hall of Fame presets.
 */
export function getCombinedHallOfFameRoutes(historyState) {
  const userRoutes = historyState?.routes || [];
  return [...userRoutes, ...HALL_OF_FAME_ROUTES];
}

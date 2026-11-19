// src/utils/router.js
import {
  getPOIsForRoute,
  fetchRealPOIsAlongRoute,
  calculateDetourMeters,
  distanceMeters,
  distanceToPolylineMeters,
} from './pois.js';
import { loadDriftHistory } from './storage.js';

const MAPBOX_TOKEN = (
  import.meta.env?.VITE_MAPBOX_TOKEN ||
  (typeof process !== 'undefined' ? process.env?.VITE_MAPBOX_TOKEN : '') ||
  ''
).trim();

// Explicit, unified pace constants used across UI helpers, initial loop radius estimation,
// fallback estimation, and Mapbox Directions evaluation:
// - Walk mode: 4.8 km/h (80 m/min, ~115 steps/min -> 30 min = 2.40 km)
// - Run mode:  9.6 km/h (160 m/min, ~165 steps/min -> 30 min = 4.80 km)
export const PACE_CONFIG = {
  walk: {
    speedKmh: 4.8,
    metersPerMin: 80,
    stepsPerMin: 115,
  },
  run: {
    speedKmh: 9.6,
    metersPerMin: 160,
    stepsPerMin: 165,
  },
};

export const WALK_SPEED_KMH = PACE_CONFIG.walk.speedKmh;
export const RUN_SPEED_KMH = PACE_CONFIG.run.speedKmh;
export const WALK_METERS_PER_MIN = PACE_CONFIG.walk.metersPerMin; // 80 m/min
export const RUN_METERS_PER_MIN = PACE_CONFIG.run.metersPerMin; // 160 m/min
export const WALK_STEPS_PER_MIN = PACE_CONFIG.walk.stepsPerMin; // 115 steps/min
export const RUN_STEPS_PER_MIN = PACE_CONFIG.run.stepsPerMin; // 165 steps/min

// Derived stride lengths (km/step) consistent with speed & cadence constants
export const WALK_STEP_TO_KM_FACTOR =
  WALK_METERS_PER_MIN / 1000 / WALK_STEPS_PER_MIN;
export const RUN_STEP_TO_KM_FACTOR =
  RUN_METERS_PER_MIN / 1000 / RUN_STEPS_PER_MIN;
export const STEP_TO_KM_FACTOR = WALK_STEP_TO_KM_FACTOR;

export const MAX_POI_VERTEX_DISTANCE_METERS = 250;
export const LOOP_CALIBRATION_TOLERANCE = 0.12;
export const POI_DURATION_TOLERANCE = 0.15;

export function getPaceConfig(activityMode = 'walk') {
  return activityMode === 'run' ? PACE_CONFIG.run : PACE_CONFIG.walk;
}

/**
 * Computes exact floating-point duration in minutes from actual route distance in meters.
 */
export function distanceMetersToMinutesExact(
  routeDistanceMeters,
  activityMode = 'walk'
) {
  const { metersPerMin } = getPaceConfig(activityMode);
  return Math.max(0, Number(routeDistanceMeters) || 0) / metersPerMin;
}

/**
 * Computes rounded display duration in minutes from actual route distance in meters
 * (`Math.round(distanceMeters / metersPerMinute)`), so distance and minutes never contradict.
 */
export function distanceMetersToMinutes(
  routeDistanceMeters,
  activityMode = 'walk'
) {
  return Math.max(
    1,
    Math.round(distanceMetersToMinutesExact(routeDistanceMeters, activityMode))
  );
}

/**
 * Converts target duration in minutes to target distance in kilometers using unified pace.
 * (e.g. Walk: 30 min -> 2.40 km; Run: 30 min -> 4.80 km)
 */
export function minutesToDistanceKm(minutes, activityMode = 'walk') {
  const mins = Math.max(1, Number(minutes) || 30);
  const { metersPerMin } = getPaceConfig(activityMode);
  return Number(((mins * metersPerMin) / 1000).toFixed(2));
}

/**
 * Converts target step count and activityMode to target duration in minutes.
 * (e.g. Walk: 3,450 steps -> 30 min / 2.40 km; Run: 4,950 steps -> 30 min / 4.80 km)
 */
export function stepsToMinutes(steps, activityMode = 'walk') {
  if (!steps || steps <= 0) return 15;
  const { stepsPerMin } = getPaceConfig(activityMode);
  return Math.max(5, Math.round(steps / stepsPerMin));
}

/**
 * Converts target duration in minutes to step count aligned with unified cadence.
 * (e.g. Walk: 15m -> 1,725, 30m -> 3,450, 45m -> 5,175, 60m -> 6,900;
 *       Run:  15m -> 2,475, 30m -> 4,950, 45m -> 7,425, 60m -> 9,900)
 */
export function minutesToSteps(minutes, activityMode = 'walk') {
  const mins = Math.max(5, Number(minutes) || 30);
  const { stepsPerMin } = getPaceConfig(activityMode);
  const rawSteps = Math.round(mins * stepsPerMin);
  return Math.max(1500, Math.min(20000, rawSteps));
}

/**
 * Selects a compass bearing (in degrees) that prioritizes unexplored 45° sectors
 * from the user's drift history so new Spins venture into fresh streets.
 */
function selectUnexploredBearingDeg(seed = 0, exploredSectors = []) {
  const allSectors = [0, 1, 2, 3, 4, 5, 6, 7];
  const exploredSet = new Set(exploredSectors || []);
  const freshSectors = allSectors.filter((s) => !exploredSet.has(s));
  const pool = freshSectors.length > 0 ? freshSectors : allSectors;
  const chosenSector = pool[Math.abs(seed) % pool.length];
  // Add a slight deterministic intra-sector offset (10°..35°)
  const offsetDeg = 10 + ((Math.abs(seed) * 19) % 26);
  return (chosenSector * 45 + offsetDeg) % 360;
}

/**
 * Converts target step count to kilometers consistently with unified pace & cadence.
 */
export function stepsToKm(steps, activityMode = 'walk') {
  const { metersPerMin, stepsPerMin } = getPaceConfig(activityMode);
  const km = ((Number(steps) || 0) / stepsPerMin) * (metersPerMin / 1000);
  return Number(km.toFixed(2));
}

/**
 * Converts kilometers to estimated steps consistently with unified pace & cadence.
 */
export function kmToSteps(km, activityMode = 'walk') {
  const { metersPerMin, stepsPerMin } = getPaceConfig(activityMode);
  const minutes = ((Number(km) || 0) * 1000) / metersPerMin;
  return Math.round(minutes * stepsPerMin);
}

/**
 * Haversine distance in kilometers between two [lat, lng] coordinates.
 */
export function haversineKm([lat1, lng1], [lat2, lng2]) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Editorial route variant configurations for simultaneous multi-route generation (Primary + 2 Secondary).
 * All 3 variants keep `distanceScale` tightly anchored around 1.0 (0.96, 1.0, 1.04) so every proposed
 * route honors the user's chosen time/step budget within ±12% while differing by compass sector,
 * street geometry, and POI character.
 */
export const ROUTE_VARIANT_SPECS = [
  {
    variantIndex: 0,
    variantKey: 'primary',
    variantLabel: 'Curated Drift',
    variantBadge: 'Balanced',
    distanceScale: 1.0,
    bearingOffsetDeg: 0, // Primary unexplored compass sector
    sectorStep: 0,
    seedStep: 0,
    quietBonus: 0,
    corridorStyle: 'primary',
    poiCharacter: 'balanced',
  },
  {
    variantIndex: 1,
    variantKey: 'quiet',
    variantLabel: 'Quiet Alleys',
    variantBadge: 'Calm & Green',
    distanceScale: 0.96,
    bearingOffsetDeg: 120, // +120° rotated compass sector in Loop, left-flank corridor in Point A -> B
    sectorStep: 3,
    seedStep: 11,
    quietBonus: 4,
    corridorStyle: 'left_flank',
    poiCharacter: 'calm_green',
  },
  {
    variantIndex: 2,
    variantKey: 'hidden_gems',
    variantLabel: 'Hidden Gems',
    variantBadge: 'Local Discovery',
    distanceScale: 1.04,
    bearingOffsetDeg: 240, // +240° opposite compass sector in Loop, right-flank corridor in Point A -> B
    sectorStep: 5,
    seedStep: 29,
    quietBonus: 1,
    corridorStyle: 'right_flank',
    poiCharacter: 'local_discovery',
  },
];

/**
 * Resolves the deterministic compass bearing (degrees) for a loop variant.
 */
function resolveLoopBearingDeg(
  seed,
  exploredSectors = [],
  sectorStep = 0,
  bearingOffsetDeg = null
) {
  const baseBearingDeg = selectUnexploredBearingDeg(seed, exploredSectors);
  const rotationDeg =
    typeof bearingOffsetDeg === 'number' ? bearingOffsetDeg : sectorStep * 45;
  return (baseBearingDeg + rotationDeg) % 360;
}

/**
 * Generates 3 or 4 organic directional anchor waypoints around `origin`
 * along `bearingDeg` for a given loop span `radiusKm` (radial reach from origin to far apex,
 * where initial `radiusKm = (targetDistanceKm * variant.distanceScale) / 2.75`).
 */
function buildLoopAnchorsForRadius(
  origin,
  radiusKm,
  bearingDeg,
  activityMode = 'walk',
  seed = 0
) {
  const [originLat, originLng] = origin;
  const latPerKm = 1 / 111.32;
  const lngPerKm =
    1 / (111.32 * Math.max(0.2, Math.cos((originLat * Math.PI) / 180)));

  const clampedRadiusKm = Math.max(0.14, Math.min(10, Number(radiusKm) || 0.5));
  // Circle passing through `origin` with diameter = `clampedRadiusKm` (circle radius = span / 2)
  // gives a straight-line polygon perimeter of ~2.85 * clampedRadiusKm, matching street grid tortuosity
  const circleRadiusKm = clampedRadiusKm / 2;

  const bearingAngle = (bearingDeg * Math.PI) / 180;
  const centerLat =
    originLat + circleRadiusKm * Math.cos(bearingAngle) * latPerKm;
  const centerLng =
    originLng + circleRadiusKm * Math.sin(bearingAngle) * lngPerKm;

  // 4 anchors for Walk Drift (serendipitous pentagon), 3 for Run Flow
  const anchorFractions =
    activityMode === 'walk' ? [0.22, 0.48, 0.74, 0.9] : [0.25, 0.5, 0.75];

  return anchorFractions.map((progress, idx) => {
    const theta = bearingAngle + Math.PI + progress * 2 * Math.PI;
    const harmonic =
      activityMode === 'walk'
        ? 1 + 0.07 * Math.sin(idx * 2.1 + seed)
        : 1 + 0.04 * Math.cos(idx * 1.7 + seed);
    const r = circleRadiusKm * harmonic;
    const lat = centerLat + r * Math.cos(theta) * latPerKm;
    const lng = centerLng + r * Math.sin(theta) * lngPerKm;
    return [Number(lat.toFixed(6)), Number(lng.toFixed(6))];
  });
}

/**
 * Convenience wrapper for initial loop anchor generation using `targetDistanceKm / 2.75`.
 */
function buildLoopAnchors(
  origin,
  targetKm,
  activityMode,
  seed,
  exploredSectors = [],
  sectorStep = 0,
  bearingOffsetDeg = null
) {
  const bearingDeg = resolveLoopBearingDeg(
    seed,
    exploredSectors,
    sectorStep,
    bearingOffsetDeg
  );
  const initialRadiusKm = Math.max(0.14, targetKm / 2.75);
  return buildLoopAnchorsForRadius(
    origin,
    initialRadiusKm,
    bearingDeg,
    activityMode,
    seed
  );
}

/**
 * Generates 2 or 3 intermediate corridor waypoints between `origin` and `destination`
 * using metric-accurate perpendicular offsets (`detourAmplitudeKm`) so iterative
 * Point A -> B duration calibration scales predictably in kilometers.
 */
function buildCorridorAnchors(
  origin,
  destination,
  activityMode,
  seed,
  corridorStyle = 'primary',
  detourAmplitudeKm = null
) {
  const [lat1, lng1] = origin;
  const [lat2, lng2] = destination;
  const midLat = (lat1 + lat2) / 2;
  const cosLat = Math.max(0.2, Math.cos((midLat * Math.PI) / 180));
  const latPerKm = 1 / 111.32;
  const lngPerKm = 1 / (111.32 * cosLat);

  // Local metric vector (east = x, north = y) in km
  const dxKm = (lng2 - lng1) * 111.32 * cosLat;
  const dyKm = (lat2 - lat1) * 111.32;
  const directKm = Math.hypot(dxKm, dyKm);

  // Unit perpendicular vector in km
  let perpX = 0;
  let perpY = 1;
  if (directKm >= 0.02) {
    perpX = -dyKm / directKm;
    perpY = dxKm / directKm;
  } else {
    const fallbackAngle = ((seed * 53) % 360) * (Math.PI / 180);
    perpX = Math.cos(fallbackAngle);
    perpY = Math.sin(fallbackAngle);
  }

  const baseSign = seed % 2 === 0 ? 1 : -1;
  const isLeftFlank =
    corridorStyle === 'left_flank' || corridorStyle === 'opposite';
  const isRightFlank =
    corridorStyle === 'right_flank' || corridorStyle === 'wide';

  const sideSign = isLeftFlank ? -baseSign : baseSign;
  const defaultAmplitudeKm = Math.max(
    0.07,
    directKm * (activityMode === 'walk' ? 0.14 : 0.08)
  );
  const amplitudeKm = Math.max(
    0.03,
    typeof detourAmplitudeKm === 'number' && Number.isFinite(detourAmplitudeKm)
      ? detourAmplitudeKm
      : defaultAmplitudeKm
  );

  const offsetPoint = (t, lateralMult, sign = sideSign) => {
    const baseLat = lat1 + (lat2 - lat1) * t;
    const baseLng = lng1 + (lng2 - lng1) * t;
    const offsetKm = amplitudeKm * lateralMult * sign;
    return [
      Number((baseLat + perpY * offsetKm * latPerKm).toFixed(6)),
      Number((baseLng + perpX * offsetKm * lngPerKm).toFixed(6)),
    ];
  };

  if (directKm < 0.15 && amplitudeKm < 0.12) {
    return [offsetPoint(0.5, 1.0, sideSign)];
  }

  if (activityMode === 'run') {
    return [
      offsetPoint(0.32, isRightFlank ? 1.05 : 0.92, sideSign),
      offsetPoint(0.68, isLeftFlank ? 0.92 : 1.0, sideSign),
    ];
  }

  // Smooth single-sided arches for flanks & asymmetric drift for right_flank so
  // all 3 corridors explore distinct parallel streets without zigzag backtracking
  if (isLeftFlank) {
    return [
      offsetPoint(0.26, 0.85, sideSign),
      offsetPoint(0.52, 1.02, sideSign),
      offsetPoint(0.78, 0.82, sideSign),
    ];
  }

  if (isRightFlank) {
    return [
      offsetPoint(0.22, 0.95, sideSign),
      offsetPoint(0.54, 1.08, sideSign),
      offsetPoint(0.82, 0.76, sideSign),
    ];
  }

  // Primary corridor: gentle smooth bow
  return [
    offsetPoint(0.28, 0.82, sideSign),
    offsetPoint(0.54, 1.0, sideSign),
    offsetPoint(0.78, 0.8, sideSign),
  ];
}

/**
 * Orders POI coordinates progressively from `origin` toward `destination`
 * so Point A -> B routes never backtrack.
 */
function sortPOIsAlongCorridor(pois, origin, destination) {
  const [oLat, oLng] = origin;
  const [dLat, dLng] = destination;
  const vx = dLng - oLng;
  const vy = dLat - oLat;

  return [...pois].sort((a, b) => {
    const projA = (a.coords[1] - oLng) * vx + (a.coords[0] - oLat) * vy;
    const projB = (b.coords[1] - oLng) * vx + (b.coords[0] - oLat) * vy;
    return projA - projB;
  });
}

/**
 * Strictly filters POIs so every kept POI:
 * 1. Lies within `maxVertexDistanceMeters` (250m) of one of the calibrated loop/corridor vertices.
 * 2. Never sits near the start/end `origin` (or `destination` in Point A -> B mode).
 * 3. Maps cleanly to at most one calibrated vertex slot (`matchedAnchorIndex`) to prevent clustering.
 */
function filterPOIsNearCalibratedVertices(
  pois = [],
  calibratedVertices = [],
  {
    origin = null,
    destination = null,
    maxVertexDistanceMeters = MAX_POI_VERTEX_DISTANCE_METERS,
    minOriginDistanceMeters = 150,
    minDestinationDistanceMeters = 120,
  } = {}
) {
  if (!Array.isArray(pois) || pois.length === 0 || calibratedVertices.length === 0) {
    return [];
  }

  const slotBest = new Map();

  for (const poi of pois) {
    if (!Array.isArray(poi?.coords) || poi.coords.length < 2) continue;

    if (origin && minOriginDistanceMeters > 0) {
      if (distanceMeters(origin, poi.coords) < minOriginDistanceMeters) {
        continue;
      }
    }

    if (destination && minDestinationDistanceMeters > 0) {
      if (distanceMeters(destination, poi.coords) < minDestinationDistanceMeters) {
        continue;
      }
    }

    let nearestIdx = -1;
    let nearestDist = Infinity;
    for (let i = 0; i < calibratedVertices.length; i++) {
      const d = distanceMeters(calibratedVertices[i], poi.coords);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }

    if (nearestIdx < 0 || nearestDist > maxVertexDistanceMeters) {
      continue;
    }

    const enriched = {
      ...poi,
      matchedAnchorIndex: nearestIdx,
      distFromAnchorMeters: Math.round(nearestDist),
    };

    const existing = slotBest.get(nearestIdx);
    if (!existing || enriched.distFromAnchorMeters < existing.distFromAnchorMeters) {
      slotBest.set(nearestIdx, enriched);
    }
  }

  return Array.from(slotBest.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, poi]) => poi);
}

/**
 * Replaces calibrated anchor vertices with matched POIs in their exact loop/corridor slot order,
 * preserving the original calibrated anchor whenever a vertex has no matched POI so the loop
 * can never short-circuit or collapse.
 */
function mergePOIsIntoCalibratedAnchors(calibratedAnchors = [], matchedPOIs = []) {
  const poiBySlot = new Map();
  for (const poi of matchedPOIs) {
    if (typeof poi.matchedAnchorIndex === 'number') {
      poiBySlot.set(poi.matchedAnchorIndex, poi);
    }
  }
  return calibratedAnchors.map((anchorCoord, idx) =>
    poiBySlot.has(idx) ? poiBySlot.get(idx).coords : anchorCoord
  );
}

/**
 * Converts a Mapbox GeoJSON LineString `[lng, lat]` array to Leaflet `[lat, lng]` coordinates.
 */
function geoJsonToLatLngs(geoCoords = []) {
  return geoCoords.map(([lng, lat]) => [
    Number(lat.toFixed(6)),
    Number(lng.toFixed(6)),
  ]);
}

/**
 * Deterministic fallback route generator if offline or Mapbox request fails.
 */
export function generateFallbackRoute({
  origin = [48.8638, 2.3615],
  destination = null,
  routeType = 'loop',
  steps = minutesToSteps(30, 'walk'),
  targetMinutes = null,
  activityMode = 'walk',
  stopVibe = 'all',
  planMode = 'instant',
  seed = 0,
  variantIndex = 0,
  variantLabel = null,
  variantBadge = null,
  sectorStep = 0,
  corridorStyle = 'primary',
  preloadedPOIs = null,
  visitedPoiNames = null,
  visitedPoiIds = null,
  exploredSectors = null,
}) {
  const spec = ROUTE_VARIANT_SPECS[variantIndex] || ROUTE_VARIANT_SPECS[0];
  const resolvedLabel = variantLabel || spec.variantLabel;
  const resolvedBadge = variantBadge || spec.variantBadge;
  const resolvedCorridorStyle = corridorStyle || spec.corridorStyle;
  const resolvedSectorStep =
    typeof sectorStep === 'number' ? sectorStep : spec.sectorStep;

  const history =
    visitedPoiNames && exploredSectors
      ? { visitedPoiNames, visitedPoiIds: visitedPoiIds || [], exploredSectors }
      : loadDriftHistory();

  const pace = getPaceConfig(activityMode);
  const baseTargetMinutes =
    typeof targetMinutes === 'number' && targetMinutes > 0
      ? targetMinutes
      : stepsToMinutes(steps, activityMode);
  const variantScale = spec.distanceScale ?? 1.0;
  const targetVariantMinutes = baseTargetMinutes * variantScale;

  let waypoints = [];
  let distanceKm = minutesToDistanceKm(targetVariantMinutes, activityMode);
  let isDirectRoute = false;
  let durationBadge = null;

  if (routeType === 'pointToPoint' && destination) {
    const directStreetKm = Math.max(0.25, haversineKm(origin, destination) * 1.25);
    const directMinsExact = distanceMetersToMinutesExact(
      directStreetKm * 1000,
      activityMode
    );
    const targetDistKm = (targetVariantMinutes * pace.metersPerMin) / 1000;

    if (directMinsExact > baseTargetMinutes) {
      isDirectRoute = true;
      distanceKm = Number(directStreetKm.toFixed(2));
    } else {
      distanceKm = Number(Math.max(directStreetKm, targetDistKm).toFixed(2));
    }

    const extraKm = Math.max(0, distanceKm - directStreetKm);
    const detourAmplitudeKm = isDirectRoute
      ? Math.min(0.08, haversineKm(origin, destination) * 0.06)
      : Math.max(0.08, extraKm / 2.6);

    const anchors =
      preloadedPOIs && preloadedPOIs.length > 0
        ? sortPOIsAlongCorridor(preloadedPOIs, origin, destination).map(
            (p) => p.coords
          )
        : buildCorridorAnchors(
            origin,
            destination,
            activityMode,
            seed,
            resolvedCorridorStyle,
            detourAmplitudeKm
          );
    const controlPoints = [origin, ...anchors, destination];
    for (let i = 0; i < controlPoints.length - 1; i++) {
      const [sLat, sLng] = controlPoints[i];
      const [eLat, eLng] = controlPoints[i + 1];
      const segments = 8;
      for (let j = 0; j < segments; j++) {
        const t = j / segments;
        waypoints.push([
          Number((sLat + (eLat - sLat) * t).toFixed(6)),
          Number((sLng + (eLng - sLng) * t).toFixed(6)),
        ]);
      }
    }
    waypoints.push(destination);
  } else {
    const [originLat, originLng] = origin;
    const spanRadiusKm = Math.max(0.14, distanceKm / 2.75);
    const circleRadiusKm = spanRadiusKm / 2;
    const latPerKm = 1 / 111.32;
    const lngPerKm =
      1 / (111.32 * Math.max(0.2, Math.cos((originLat * Math.PI) / 180)));
    const bearingDeg = resolveLoopBearingDeg(
      seed,
      history.exploredSectors,
      resolvedSectorStep,
      spec.bearingOffsetDeg
    );
    const bearingAngle = (bearingDeg * Math.PI) / 180;
    const centerLat =
      originLat + circleRadiusKm * Math.cos(bearingAngle) * latPerKm;
    const centerLng =
      originLng + circleRadiusKm * Math.sin(bearingAngle) * lngPerKm;

    const numNodes = activityMode === 'walk' ? 28 : 20;
    for (let i = 0; i <= numNodes; i++) {
      const progress = i / numNodes;
      const theta = bearingAngle + Math.PI + progress * 2 * Math.PI;
      const harmonic =
        activityMode === 'walk'
          ? 1 +
            0.09 *
              Math.sin(progress * Math.PI * 6 + seed) *
              Math.sin(progress * Math.PI)
          : 1 +
            0.04 *
              Math.cos(progress * Math.PI * 4 + seed) *
              Math.sin(progress * Math.PI);
      const r = circleRadiusKm * harmonic;
      waypoints.push([
        Number((centerLat + r * Math.cos(theta) * latPerKm).toFixed(6)),
        Number((centerLng + r * Math.sin(theta) * lngPerKm).toFixed(6)),
      ]);
    }
    waypoints[0] = origin;
    waypoints[waypoints.length - 1] = origin;
  }

  const estimatedMinutes = distanceMetersToMinutes(
    distanceKm * 1000,
    activityMode
  );
  if (isDirectRoute) {
    durationBadge = `Direct route • ${estimatedMinutes} min`;
  }
  const effectiveSteps = kmToSteps(distanceKm, activityMode);

  const pois =
    preloadedPOIs && preloadedPOIs.length > 0
      ? preloadedPOIs.map((poi) => ({
          ...poi,
          detourMeters: calculateDetourMeters(poi.coords, waypoints),
        }))
      : getPOIsForRoute(waypoints, activityMode, seed, {
          stopVibe,
          variantKey: spec.variantKey,
          visitedPoiNames: history.visitedPoiNames,
          visitedPoiIds: history.visitedPoiIds,
        });

  const quietScore = Math.min(
    99,
    (activityMode === 'run' ? 97 : 94) + (spec.quietBonus || 0)
  );

  return {
    id: `route-fallback-${variantIndex}-${Date.now()}-${seed}`,
    variantIndex,
    variantKey: spec.variantKey,
    variantLabel: resolvedLabel,
    variantBadge: resolvedBadge,
    quietScore,
    routeType,
    origin,
    destination: routeType === 'pointToPoint' ? destination : null,
    waypoints,
    steps: effectiveSteps,
    targetSteps: steps,
    targetMinutes: baseTargetMinutes,
    distanceKm,
    estimatedMinutes,
    isDirectRoute,
    durationBadge,
    activityMode,
    stopVibe,
    planMode,
    isStreetSnapped: false,
    metrics: {
      lowTrafficPct: quietScore,
      elevationGainMeters: Math.max(
        4,
        Math.round(distanceKm * (activityMode === 'run' ? 2.2 : 4.5))
      ),
      trafficLightsAvoided: Math.max(
        2,
        Math.round(distanceKm * (activityMode === 'run' ? 3.4 : 2.1))
      ),
      serendipityScore: activityMode === 'walk' ? 96 : 84,
    },
    pois,
  };
}

/**
 * Asynchronous street-accurate urban route generator powered by Mapbox Walking Directions + Search Box APIs.
 * 1. Calibrates loop radius (up to 3 damped refinement passes) or Point A -> B detour amplitude (up to 2 passes)
 *    against Mapbox Directions distance evaluated with unified pace constants (80 m/min walk, 160 m/min run).
 * 2. Discovers real-world POIs strictly within 250m of the already-calibrated vertices (never near origin).
 * 3. Inserts matched POIs into the calibrated waypoint slots and re-verifies duration stays within tolerance
 *    (dropping outlier POIs or keeping the calibrated loop if POIs distort duration beyond ±15%).
 */
export async function generateUrbanRoute({
  origin = [48.8638, 2.3615],
  destination = null,
  routeType = 'loop', // 'loop' | 'pointToPoint'
  steps = minutesToSteps(30, 'walk'),
  targetMinutes = null,
  activityMode = 'walk',
  stopVibe = 'all',
  planMode = 'instant',
  seed = 0,
  variantIndex = 0,
  variantLabel = null,
  variantBadge = null,
  sectorStep = 0,
  corridorStyle = 'primary',
  visitedPoiNames = null,
  visitedPoiIds = null,
  exploredSectors = null,
  mapboxToken = null,
  signal,
}) {
  const activeToken = (mapboxToken || MAPBOX_TOKEN || '').trim();
  const spec = ROUTE_VARIANT_SPECS[variantIndex] || ROUTE_VARIANT_SPECS[0];
  const resolvedLabel = variantLabel || spec.variantLabel;
  const resolvedBadge = variantBadge || spec.variantBadge;
  const resolvedCorridorStyle = corridorStyle || spec.corridorStyle;
  const resolvedSectorStep =
    typeof sectorStep === 'number' ? sectorStep : spec.sectorStep;

  const history =
    visitedPoiNames && exploredSectors
      ? { visitedPoiNames, visitedPoiIds: visitedPoiIds || [], exploredSectors }
      : loadDriftHistory();

  if (!activeToken) {
    return generateFallbackRoute({
      origin,
      destination,
      routeType,
      steps,
      targetMinutes,
      activityMode,
      stopVibe,
      planMode,
      seed,
      variantIndex,
      variantLabel: resolvedLabel,
      variantBadge: resolvedBadge,
      sectorStep: resolvedSectorStep,
      corridorStyle: resolvedCorridorStyle,
      visitedPoiNames: history.visitedPoiNames,
      visitedPoiIds: history.visitedPoiIds,
      exploredSectors: history.exploredSectors,
    });
  }

  let discoveredPOIs = [];

  try {
    const pace = getPaceConfig(activityMode);
    const baseTargetMinutes =
      typeof targetMinutes === 'number' && targetMinutes > 0
        ? targetMinutes
        : stepsToMinutes(steps, activityMode);
    const targetDistanceKm = (baseTargetMinutes * pace.metersPerMin) / 1000;
    const variantScale = spec.distanceScale ?? 1.0;
    const targetVariantMinutes = baseTargetMinutes * variantScale;

    const fetchDirectionsForNodes = async (nodes) => {
      const coordsQuery = nodes
        .map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`)
        .join(';');
      const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coordsQuery}?geometries=geojson&overview=full&steps=false&access_token=${activeToken}`;
      const res = await fetch(url, { signal });
      if (!res.ok) {
        throw new Error(`Mapbox Directions HTTP ${res.status}`);
      }
      const json = await res.json();
      return json?.routes?.[0] || null;
    };

    const computeRouteMinutes = (mapboxRoute) =>
      distanceMetersToMinutesExact(mapboxRoute?.distance || 0, activityMode);

    const pickClosestCandidate = (candidates, goalMinutes, budgetMinutes) => {
      if (!candidates.length) return null;
      const withinBudget = candidates.filter(
        (c) =>
          Math.abs(c.actualMinutes - budgetMinutes) / budgetMinutes <=
          LOOP_CALIBRATION_TOLERANCE
      );
      const pool = withinBudget.length > 0 ? withinBudget : candidates;
      return pool.reduce((best, curr) => {
        const bestErr = Math.abs(best.actualMinutes - goalMinutes);
        const currErr = Math.abs(curr.actualMinutes - goalMinutes);
        return currErr < bestErr ? curr : best;
      });
    };

    let calibratedRoute = null;
    let calibratedAnchors = [];
    let isDirectRoute = false;
    let durationBadge = null;
    let minOriginDistanceMeters = 150;
    let minDestinationDistanceMeters = 0;
    let poiGoalMinutes = targetVariantMinutes;
    let poiBudgetMinutes = baseTargetMinutes;

    if (routeType === 'pointToPoint' && destination) {
      // Point A -> B Mode: first evaluate true direct street distance between A and B
      const directRoute = await fetchDirectionsForNodes([origin, destination]);
      if (!directRoute?.geometry?.coordinates || directRoute.geometry.coordinates.length < 2) {
        throw new Error('No direct street geometry returned from Mapbox Directions');
      }

      const directMinutesExact = computeRouteMinutes(directRoute);
      const directStreetKm = (directRoute.distance || 0) / 1000;
      const directHaversineKm = haversineKm(origin, destination);
      minOriginDistanceMeters = Math.max(
        100,
        Math.min(200, Math.round(directHaversineKm * 180))
      );
      minDestinationDistanceMeters = minOriginDistanceMeters;

      if (directMinutesExact > baseTargetMinutes) {
        // A and B are naturally further apart than the requested budget -> Direct route badge
        isDirectRoute = true;
        calibratedRoute = directRoute;
        poiGoalMinutes = directMinutesExact;
        poiBudgetMinutes = directMinutesExact;

        // Keep secondary variants subtly distinct on parallel streets without bloating duration
        if (resolvedCorridorStyle !== 'primary') {
          const gentleAmplitudeKm = Math.max(
            0.05,
            Math.min(0.14, directHaversineKm * 0.08)
          );
          const gentleAnchors = buildCorridorAnchors(
            origin,
            destination,
            activityMode,
            seed,
            resolvedCorridorStyle,
            gentleAmplitudeKm
          );
          const gentleRoute = await fetchDirectionsForNodes([
            origin,
            ...gentleAnchors,
            destination,
          ]);
          const gentleMins = computeRouteMinutes(gentleRoute);
          if (
            gentleRoute?.geometry?.coordinates?.length >= 2 &&
            gentleMins <= directMinutesExact * 1.1
          ) {
            calibratedRoute = gentleRoute;
            calibratedAnchors = gentleAnchors;
          }
        }

        if (calibratedAnchors.length === 0) {
          // Sample 3 interior vertices along the direct polyline for nearby POI discovery
          const directLatLngs = geoJsonToLatLngs(calibratedRoute.geometry.coordinates);
          const fracs = activityMode === 'walk' ? [0.25, 0.5, 0.75] : [0.3, 0.65];
          calibratedAnchors = fracs.map(
            (f) =>
              directLatLngs[
                Math.min(
                  directLatLngs.length - 1,
                  Math.max(1, Math.floor(directLatLngs.length * f))
                )
              ]
          );
        }
      } else {
        // Direct distance is shorter than targetMinutes -> iteratively calibrate lateral detour (up to 2 passes)
        const corridorTargetMinutes = Math.max(
          directMinutesExact,
          targetVariantMinutes
        );
        const corridorTargetDistKm =
          (corridorTargetMinutes * pace.metersPerMin) / 1000;
        const extraKmNeeded = Math.max(0, corridorTargetDistKm - directStreetKm);

        let detourAmplitudeKm =
          extraKmNeeded < 0.12
            ? Math.max(0.06, Math.min(0.16, directHaversineKm * 0.12))
            : Math.max(
                0.08,
                Math.min(corridorTargetDistKm * 0.45, extraKmNeeded / 2.6)
              );

        const candidates = [
          {
            route: directRoute,
            anchors: [],
            actualMinutes: directMinutesExact,
            detourAmplitudeKm: 0,
          },
        ];

        const MAX_CORRIDOR_REFINEMENTS = 2;
        for (let pass = 0; pass <= MAX_CORRIDOR_REFINEMENTS; pass++) {
          const anchors = buildCorridorAnchors(
            origin,
            destination,
            activityMode,
            seed,
            resolvedCorridorStyle,
            detourAmplitudeKm
          );
          const candidateRoute = await fetchDirectionsForNodes([
            origin,
            ...anchors,
            destination,
          ]);
          if (
            !candidateRoute?.geometry?.coordinates ||
            candidateRoute.geometry.coordinates.length < 2
          ) {
            break;
          }

          const actualMinutes = computeRouteMinutes(candidateRoute);
          candidates.push({
            route: candidateRoute,
            anchors,
            actualMinutes,
            detourAmplitudeKm,
          });

          if (actualMinutes <= 0) break;
          const ratio = corridorTargetMinutes / actualMinutes;
          const offVariant = Math.abs(1 - ratio) > LOOP_CALIBRATION_TOLERANCE;
          const offBudget =
            Math.abs(actualMinutes - baseTargetMinutes) / baseTargetMinutes >
            LOOP_CALIBRATION_TOLERANCE;

          if (!offVariant && !offBudget) {
            break;
          }

          if (pass < MAX_CORRIDOR_REFINEMENTS) {
            const actualDistKm = (candidateRoute.distance || 0) / 1000;
            const desiredExtraKm = Math.max(
              0.04,
              corridorTargetDistKm - directStreetKm
            );
            const currentExtraKm = Math.max(
              0.04,
              actualDistKm - directStreetKm
            );
            const extraRatio = Math.max(
              0.25,
              Math.min(3.0, desiredExtraKm / currentExtraKm)
            );
            detourAmplitudeKm = Math.max(
              0.04,
              Math.min(
                corridorTargetDistKm * 0.55,
                detourAmplitudeKm * Math.pow(extraRatio, 0.85)
              )
            );
          }
        }

        const bestCorridor = pickClosestCandidate(
          candidates,
          corridorTargetMinutes,
          baseTargetMinutes
        );
        calibratedRoute = bestCorridor.route;
        calibratedAnchors =
          bestCorridor.anchors.length > 0
            ? bestCorridor.anchors
            : buildCorridorAnchors(
                origin,
                destination,
                activityMode,
                seed,
                resolvedCorridorStyle,
                Math.max(0.06, directHaversineKm * 0.1)
              );
        poiGoalMinutes = corridorTargetMinutes;
        poiBudgetMinutes = baseTargetMinutes;
      }
    } else {
      // Loop Mode: Iterative Multi-Pass Radial Calibration (initial pass + up to 3 refinement iterations)
      const bearingDeg = resolveLoopBearingDeg(
        seed,
        history.exploredSectors,
        resolvedSectorStep,
        spec.bearingOffsetDeg
      );

      let radiusKm = Math.max(0.14, (targetDistanceKm * variantScale) / 2.75);
      const candidates = [];
      const MAX_REFINEMENT_ITERATIONS = 3;

      for (let iteration = 0; iteration <= MAX_REFINEMENT_ITERATIONS; iteration++) {
        const anchors = buildLoopAnchorsForRadius(
          origin,
          radiusKm,
          bearingDeg,
          activityMode,
          seed
        );
        const candidateRoute = await fetchDirectionsForNodes([
          origin,
          ...anchors,
          origin,
        ]);

        if (
          !candidateRoute?.geometry?.coordinates ||
          candidateRoute.geometry.coordinates.length < 2
        ) {
          if (candidates.length === 0) {
            throw new Error('No street geometry returned from Mapbox Directions');
          }
          break;
        }

        const actualMinutes = computeRouteMinutes(candidateRoute);
        candidates.push({
          route: candidateRoute,
          anchors,
          radiusKm,
          actualMinutes,
          iteration,
        });

        if (actualMinutes <= 0) break;

        const ratio = targetVariantMinutes / actualMinutes;
        const offVariant = Math.abs(1 - ratio) > LOOP_CALIBRATION_TOLERANCE;
        const offBaseBudget =
          Math.abs(actualMinutes - baseTargetMinutes) / baseTargetMinutes > 0.1;

        if (!offVariant && !offBaseBudget) {
          break;
        }

        if (iteration < MAX_REFINEMENT_ITERATIONS) {
          const safeRatio = Math.max(0.25, Math.min(3.0, ratio));
          // Damped proportional scaling to prevent overshooting across dense street grids
          radiusKm = Math.max(
            0.12,
            Math.min(10, radiusKm * Math.pow(safeRatio, 0.85))
          );
        }
      }

      const bestLoop = pickClosestCandidate(
        candidates,
        targetVariantMinutes,
        baseTargetMinutes
      );
      if (!bestLoop) {
        throw new Error('No calibrated loop candidate produced');
      }

      calibratedRoute = bestLoop.route;
      calibratedAnchors = bestLoop.anchors;
      // Keep POIs clearly away from start/end origin (scales cleanly for short & long loops)
      minOriginDistanceMeters = Math.max(
        110,
        Math.min(250, Math.round(bestLoop.radiusKm * 320))
      );
    }

    // Step 2: Discover real POIs strictly within 250m of the ALREADY-CALIBRATED loop/corridor vertices
    const rawPOIs = await fetchRealPOIsAlongRoute(
      calibratedAnchors,
      activityMode,
      activeToken,
      {
        seed,
        stopVibe,
        variantKey: spec.variantKey,
        signal,
        visitedPoiNames: history.visitedPoiNames,
        visitedPoiIds: history.visitedPoiIds,
        maxDistanceFromAnchorMeters: MAX_POI_VERTEX_DISTANCE_METERS,
        origin,
        destination: routeType === 'pointToPoint' ? destination : null,
        minDistanceFromOriginMeters: minOriginDistanceMeters,
        minDistanceFromDestinationMeters: minDestinationDistanceMeters,
        allowFallback: false,
      }
    );

    let filteredPOIs = filterPOIsNearCalibratedVertices(rawPOIs, calibratedAnchors, {
      origin,
      destination: routeType === 'pointToPoint' ? destination : null,
      maxVertexDistanceMeters: MAX_POI_VERTEX_DISTANCE_METERS,
      minOriginDistanceMeters: minOriginDistanceMeters,
      minDestinationDistanceMeters: minDestinationDistanceMeters,
    });

    if (routeType === 'pointToPoint' && destination && filteredPOIs.length > 1) {
      filteredPOIs = sortPOIsAlongCorridor(filteredPOIs, origin, destination);
    }

    // Step 3: Insert filtered POIs into the calibrated anchor slots & re-verify duration stays within tolerance
    // (dropping outlier POIs if they distort duration beyond ±15%, or keeping the calibrated loop)
    let primaryRoute = calibratedRoute;
    const calibratedLatLngs = geoJsonToLatLngs(
      calibratedRoute.geometry.coordinates
    );

    const isPOIInsertionWithinTolerance = (candidateMinutes) => {
      if (!Number.isFinite(candidateMinutes) || candidateMinutes <= 0) {
        return false;
      }
      if (isDirectRoute) {
        return candidateMinutes <= poiBudgetMinutes * 1.12;
      }
      const withinTargetBudget =
        Math.abs(candidateMinutes - poiBudgetMinutes) / poiBudgetMinutes <=
        LOOP_CALIBRATION_TOLERANCE;
      const withinVariantWindow =
        Math.abs(candidateMinutes - poiGoalMinutes) / poiGoalMinutes <=
        POI_DURATION_TOLERANCE;
      return withinTargetBudget && withinVariantWindow;
    };

    if (filteredPOIs.length > 0) {
      let activePOIs = [...filteredPOIs];
      let acceptedPOIRoute = null;
      const MAX_POI_PRUNE_ATTEMPTS = Math.min(3, activePOIs.length);

      for (let attempt = 0; attempt < MAX_POI_PRUNE_ATTEMPTS; attempt++) {
        if (activePOIs.length === 0) break;

        const mergedWaypoints = mergePOIsIntoCalibratedAnchors(
          calibratedAnchors,
          activePOIs
        );
        const queryNodes =
          routeType === 'pointToPoint' && destination
            ? [origin, ...mergedWaypoints, destination]
            : [origin, ...mergedWaypoints, origin];

        const poiRoute = await fetchDirectionsForNodes(queryNodes);
        const poiMinutes = computeRouteMinutes(poiRoute);

        if (
          poiRoute?.geometry?.coordinates?.length >= 2 &&
          isPOIInsertionWithinTolerance(poiMinutes)
        ) {
          acceptedPOIRoute = poiRoute;
          discoveredPOIs = activePOIs;
          break;
        }

        // Drop the single biggest outlier POI (furthest from calibrated polyline / anchor vertex)
        if (activePOIs.length <= 1) {
          break;
        }
        let worstIdx = 0;
        let worstScore = -1;
        activePOIs.forEach((poi, idx) => {
          const polyDist = distanceToPolylineMeters(poi.coords, calibratedLatLngs);
          const score =
            (Number.isFinite(polyDist) ? polyDist : 300) +
            (poi.distFromAnchorMeters || 0);
          if (score > worstScore) {
            worstScore = score;
            worstIdx = idx;
          }
        });
        activePOIs = activePOIs.filter((_, idx) => idx !== worstIdx);
      }

      if (acceptedPOIRoute) {
        primaryRoute = acceptedPOIRoute;
      } else {
        // Keep the cleanly calibrated loop/corridor geometry and retain only POIs right along the polyline
        primaryRoute = calibratedRoute;
        discoveredPOIs = filteredPOIs.filter(
          (poi) =>
            distanceToPolylineMeters(poi.coords, calibratedLatLngs) <=
            MAX_POI_VERTEX_DISTANCE_METERS
        );
      }
    }

    const geoCoords = primaryRoute?.geometry?.coordinates;
    if (!geoCoords || geoCoords.length < 2) {
      throw new Error('No street geometry returned from Mapbox Directions');
    }

    // Convert GeoJSON [lng, lat] to Leaflet [lat, lng]
    const waypoints = geoJsonToLatLngs(geoCoords);

    const routeDistanceMeters = primaryRoute.distance || 0;
    const realDistanceKm = Number((routeDistanceMeters / 1000).toFixed(2));
    const calculatedSteps = kmToSteps(realDistanceKm, activityMode);

    // Unified duration calculation: strictly derived from actual Mapbox distanceMeters / mode metersPerMin
    const estimatedMinutes = distanceMetersToMinutes(
      routeDistanceMeters,
      activityMode
    );

    if (isDirectRoute) {
      durationBadge = `Direct route • ${estimatedMinutes} min`;
    }

    // Recalculate exact detour distance from the street-snapped polyline to each real POI
    const pois = (
      discoveredPOIs.length > 0
        ? discoveredPOIs
        : getPOIsForRoute(waypoints, activityMode, seed, {
            stopVibe,
            variantKey: spec.variantKey,
            visitedPoiNames: history.visitedPoiNames,
            visitedPoiIds: history.visitedPoiIds,
          })
    ).map((poi) => ({
      ...poi,
      detourMeters: calculateDetourMeters(poi.coords, waypoints),
    }));

    const quietScore = Math.min(
      99,
      (activityMode === 'run' ? 98 : 94) + (spec.quietBonus || 0)
    );

    return {
      id: `route-mapbox-${variantIndex}-${Date.now()}-${seed}`,
      variantIndex,
      variantKey: spec.variantKey,
      variantLabel: resolvedLabel,
      variantBadge: resolvedBadge,
      quietScore,
      routeType,
      origin,
      destination: routeType === 'pointToPoint' ? destination : null,
      waypoints,
      steps: calculatedSteps,
      targetSteps: steps,
      targetMinutes: baseTargetMinutes,
      distanceKm: realDistanceKm,
      estimatedMinutes,
      isDirectRoute,
      durationBadge,
      activityMode,
      stopVibe,
      planMode,
      isStreetSnapped: true,
      metrics: {
        lowTrafficPct: quietScore,
        elevationGainMeters: Math.max(
          4,
          Math.round(realDistanceKm * (activityMode === 'run' ? 2.1 : 4.2))
        ),
        trafficLightsAvoided: Math.max(
          2,
          Math.round(realDistanceKm * (activityMode === 'run' ? 3.5 : 2.3))
        ),
        serendipityScore: activityMode === 'walk' ? 97 : 86,
      },
      pois,
    };
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    return generateFallbackRoute({
      origin,
      destination,
      routeType,
      steps,
      targetMinutes,
      activityMode,
      stopVibe,
      planMode,
      seed,
      variantIndex,
      variantLabel: resolvedLabel,
      variantBadge: resolvedBadge,
      sectorStep: resolvedSectorStep,
      corridorStyle: resolvedCorridorStyle,
      preloadedPOIs: discoveredPOIs,
      visitedPoiNames: history.visitedPoiNames,
      visitedPoiIds: history.visitedPoiIds,
      exploredSectors: history.exploredSectors,
    });
  }
}

/**
 * Synchronously generates 3 distinct fallback route candidates (Curated Drift, Quiet Alleys, Hidden Gems)
 * for immediate initial render or offline mode.
 */
export function generateFallbackRouteAlternatives(params = {}) {
  const {
    origin = [48.8638, 2.3615],
    destination = null,
    routeType = 'loop',
    steps = minutesToSteps(30, 'walk'),
    targetMinutes = null,
    activityMode = 'walk',
    stopVibe = 'all',
    planMode = 'instant',
    seed = 1,
    visitedPoiNames = null,
    visitedPoiIds = null,
    exploredSectors = null,
  } = params;

  const history =
    visitedPoiNames && exploredSectors
      ? { visitedPoiNames, visitedPoiIds: visitedPoiIds || [], exploredSectors }
      : loadDriftHistory();

  const usedPoiNamesAcrossVariants = new Set(
    (history.visitedPoiNames || []).map((n) => String(n).toLowerCase())
  );

  return ROUTE_VARIANT_SPECS.map((spec) => {
    const variantSeed = seed + spec.seedStep;

    const candidate = generateFallbackRoute({
      origin,
      destination,
      routeType,
      steps,
      targetMinutes,
      activityMode,
      stopVibe,
      planMode,
      seed: variantSeed,
      variantIndex: spec.variantIndex,
      variantLabel: spec.variantLabel,
      variantBadge: spec.variantBadge,
      sectorStep: spec.sectorStep,
      corridorStyle: spec.corridorStyle,
      visitedPoiNames: Array.from(usedPoiNamesAcrossVariants),
      visitedPoiIds: history.visitedPoiIds,
      exploredSectors: history.exploredSectors,
    });

    (candidate.pois || []).forEach((p) => {
      if (p?.name) usedPoiNamesAcrossVariants.add(p.name.toLowerCase());
    });

    return candidate;
  });
}

/**
 * Generates 3 distinct urban route candidates simultaneously in parallel (`Promise.all`),
 * all strictly calibrated to the user's chosen duration/step budget (within ±12%):
 * - Route 1 ("Curated Drift" — Balanced): Primary unexplored compass sector, balanced mix of lively side streets & curated stops
 * - Route 2 ("Quiet Alleys" — Calm & Green): Rotated compass sector (+120° in Loop, left-flank corridor in Point A -> B) prioritizing parks & quiet lanes
 * - Route 3 ("Hidden Gems" — Local Discovery): Opposite compass sector (+240° in Loop, right-flank corridor in Point A -> B) routed toward distinct culinary/cultural POIs
 */
export async function generateRouteAlternatives(params = {}) {
  const {
    origin = [48.8638, 2.3615],
    destination = null,
    routeType = 'loop',
    steps = minutesToSteps(30, 'walk'),
    targetMinutes = null,
    activityMode = 'walk',
    stopVibe = 'all',
    planMode = 'instant',
    seed = 1,
    visitedPoiNames = null,
    visitedPoiIds = null,
    exploredSectors = null,
    mapboxToken = null,
    signal,
  } = params;

  const activeToken = (mapboxToken || MAPBOX_TOKEN || '').trim();

  const history =
    visitedPoiNames && exploredSectors
      ? { visitedPoiNames, visitedPoiIds: visitedPoiIds || [], exploredSectors }
      : loadDriftHistory();

  if (!activeToken) {
    return generateFallbackRouteAlternatives({
      ...params,
      visitedPoiNames: history.visitedPoiNames,
      visitedPoiIds: history.visitedPoiIds,
      exploredSectors: history.exploredSectors,
    });
  }

  const results = await Promise.all(
    ROUTE_VARIANT_SPECS.map((spec) => {
      const variantSeed = seed + spec.seedStep;

      return generateUrbanRoute({
        origin,
        destination,
        routeType,
        steps,
        targetMinutes,
        activityMode,
        stopVibe,
        planMode,
        seed: variantSeed,
        variantIndex: spec.variantIndex,
        variantLabel: spec.variantLabel,
        variantBadge: spec.variantBadge,
        sectorStep: spec.sectorStep,
        corridorStyle: spec.corridorStyle,
        visitedPoiNames: history.visitedPoiNames,
        visitedPoiIds: history.visitedPoiIds,
        exploredSectors: history.exploredSectors,
        mapboxToken: activeToken,
        signal,
      });
    })
  );

  return results;
}

// Keep named alias for backward compatibility
export const generateUrbanLoop = generateUrbanRoute;

/**
 * Normalizes a string for accent-insensitive matching (e.g. "République" -> "republique").
 */
function normalizeSearchText(str = '') {
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Formats a distance in km into a compact human-readable badge (e.g., "650 m" or "2.4 km").
 */
export function formatSuggestionDistance(distanceKm) {
  if (typeof distanceKm !== 'number' || Number.isNaN(distanceKm)) return '';
  if (distanceKm < 1) {
    const meters = Math.max(50, Math.round((distanceKm * 1000) / 10) * 10);
    return `${meters} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}

/**
 * Normalizes a single feature from either Mapbox Search Box API v1 or Mapbox Geocoding API v5
 * into a unified candidate with exact [lat, lng], name, context, and category label.
 */
function parseSearchFeature(feat) {
  if (!feat) return null;

  // Coordinates: Search Box v1 uses geometry.coordinates, Geocoding v5 uses center or geometry.coordinates
  const rawCoords = feat.center || feat.geometry?.coordinates;
  if (!Array.isArray(rawCoords) || rawCoords.length < 2) return null;
  const [lng, lat] = rawCoords;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  const props = feat.properties || {};
  const ctx = props.context || {};

  const name = (props.name || feat.text || '').trim();
  if (!name) return null;

  const street = ctx.street?.name || props.address || '';
  const neighborhood =
    ctx.neighborhood?.name ||
    ctx.locality?.name ||
    '';
  const postcode = ctx.postcode?.name || '';
  const place = ctx.place?.name || '';

  const contextParts = [
    street && street !== name ? street : '',
    neighborhood && neighborhood !== name ? neighborhood : '',
    [postcode, place].filter(Boolean).join(' '),
  ].filter(Boolean);

  const fullName =
    props.full_address ||
    (contextParts.length > 0 ? `${name}, ${contextParts.join(', ')}` : '') ||
    feat.place_name ||
    props.place_formatted ||
    name;

  // Determine a clean editorial category badge
  const rawCat =
    (Array.isArray(props.poi_category) && props.poi_category[0]) ||
    props.category ||
    (Array.isArray(feat.place_type) && feat.place_type[0]) ||
    props.feature_type ||
    '';

  const normName = normalizeSearchText(name);
  let categoryLabel = 'Urban Spot';
  if (normName.startsWith('place ') || normName.includes('square ')) {
    categoryLabel = 'Public Square';
  } else if (
    normName.startsWith('jardin ') ||
    normName.startsWith('parc ') ||
    rawCat.includes('park') ||
    rawCat.includes('garden')
  ) {
    categoryLabel = 'Park & Garden';
  } else if (
    normName.includes('metro') ||
    normName.includes('station') ||
    normName.startsWith('gare ')
  ) {
    categoryLabel = 'Transit Hub';
  } else if (normName.startsWith('quai ') || normName.startsWith('canal ') || normName.startsWith('pont ')) {
    categoryLabel = 'Waterfront';
  } else if (rawCat === 'neighborhood' || rawCat === 'locality') {
    categoryLabel = 'Quarter';
  } else if (rawCat === 'address' || rawCat === 'street') {
    categoryLabel = 'Street';
  } else if (rawCat) {
    categoryLabel = String(rawCat).replace(/_/g, ' ');
  }

  return {
    id:
      props.mapbox_id ||
      feat.id ||
      `dest-${lat.toFixed(5)}-${lng.toFixed(5)}`,
    name,
    fullName,
    category: categoryLabel,
    coords: [Number(lat.toFixed(6)), Number(lng.toFixed(6))],
    mapboxRelevance: typeof feat.relevance === 'number' ? feat.relevance : 0.85,
  };
}

/**
 * Proximity-bounded, relevance-ranked destination search for Point B.
 * Queries within a local bounding box (~25 km around `origin`), calculates true Haversine
 * distance from `origin`, filters out distant towns (>30 km), and ranks nearby iconic
 * walkable destinations first.
 */
export async function geocodeDestination(
  query,
  origin = [48.8638, 2.3615],
  tokenOrSignal = null,
  maybeSignal = undefined
) {
  const trimmed = (query || '').trim();
  const activeToken =
    typeof tokenOrSignal === 'string' && tokenOrSignal.trim()
      ? tokenOrSignal.trim()
      : MAPBOX_TOKEN;
  const signal =
    tokenOrSignal && typeof tokenOrSignal === 'object' && 'aborted' in tokenOrSignal
      ? tokenOrSignal
      : maybeSignal;

  if (!trimmed || trimmed.length < 2 || !activeToken) return [];

  const anchor =
    Array.isArray(origin) && origin.length === 2 ? origin : [48.8638, 2.3615];
  const [originLat, originLng] = anchor;
  const proximity = `${originLng.toFixed(5)},${originLat.toFixed(5)}`;

  // Local metropolitan bounding box (±0.25° lat/lng ≈ 25 km radius around origin)
  const delta = 0.25;
  const bbox = [
    (originLng - delta).toFixed(5),
    (originLat - delta).toFixed(5),
    (originLng + delta).toFixed(5),
    (originLat + delta).toFixed(5),
  ].join(',');

  const MAX_URBAN_RADIUS_KM = 30;

  async function runQueries(useBbox = true) {
    const bboxParam = useBbox ? `&bbox=${bbox}` : '';

    const searchBoxUrl = `https://api.mapbox.com/search/searchbox/v1/forward?q=${encodeURIComponent(
      trimmed
    )}&proximity=${proximity}${bboxParam}&language=fr,en&limit=8&types=poi,place,locality,neighborhood,address,street&access_token=${activeToken}`;

    const geocodingUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      trimmed
    )}.json?access_token=${activeToken}&autocomplete=true&proximity=${proximity}${bboxParam}&language=fr,en&limit=8&types=poi,place,locality,neighborhood,address`;

    const responses = await Promise.allSettled([
      fetch(searchBoxUrl, { signal }).then((r) => (r.ok ? r.json() : null)),
      fetch(geocodingUrl, { signal }).then((r) => (r.ok ? r.json() : null)),
    ]);

    const combinedFeatures = [];
    for (const res of responses) {
      if (res.status === 'fulfilled' && Array.isArray(res.value?.features)) {
        combinedFeatures.push(...res.value.features);
      }
    }
    return combinedFeatures;
  }

  try {
    let rawFeatures = await runQueries(true);

    // Fallback without bbox ONLY if bounded search returned 0 results
    if (rawFeatures.length === 0) {
      rawFeatures = await runQueries(false);
    }

    const normQuery = normalizeSearchText(trimmed);
    const queryTokens = normQuery.split(/\s+/).filter(Boolean);

    const scoredCandidates = rawFeatures
      .map((feat) => parseSearchFeature(feat))
      .filter(Boolean)
      .map((item) => {
        const distanceKm = Number(haversineKm(anchor, item.coords).toFixed(2));
        if (distanceKm > MAX_URBAN_RADIUS_KM) return null;

        const normName = normalizeSearchText(item.name);
        const normFull = normalizeSearchText(item.fullName);

        // 1. Text relevance score
        let textScore = item.mapboxRelevance * 25;
        if (normName === normQuery) {
          textScore += 65;
        } else if (normName.startsWith(normQuery)) {
          textScore += 52;
        } else if (
          normName.includes(` ${normQuery}`) ||
          normName.includes(`-${normQuery}`) ||
          normName.includes(`'${normQuery}`)
        ) {
          textScore += 46;
        } else if (normName.includes(normQuery)) {
          textScore += 34;
        } else if (
          queryTokens.every((t) => normName.includes(t))
        ) {
          textScore += 30;
        } else if (normFull.includes(normQuery)) {
          textScore += 14;
        }

        // 2. Iconic pedestrian landmark bonus (squares, parks, bridges, stations)
        if (
          normName.startsWith('place ') ||
          normName.startsWith('square ') ||
          normName.startsWith('jardin ') ||
          normName.startsWith('parc ') ||
          normName.startsWith('quai ') ||
          normName.startsWith('canal ') ||
          normName.startsWith('pont ')
        ) {
          textScore += 20;
        }

        // 3. Proximity score: strongly favor walkable distances (0.3 km – 8 km)
        const proximityScore = 95 / (1 + distanceKm * 0.55);

        return {
          ...item,
          distanceKm,
          distanceLabel: formatSuggestionDistance(distanceKm),
          score: textScore + proximityScore,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    // Deduplicate near-identical entries within 100m (0.1 km) of each other
    const deduped = [];
    for (const candidate of scoredCandidates) {
      const normCand = normalizeSearchText(candidate.name);
      const isDuplicate = deduped.some((existing) => {
        const distBetweenKm = haversineKm(existing.coords, candidate.coords);
        if (distBetweenKm <= 0.1) {
          return true;
        }
        const normExist = normalizeSearchText(existing.name);
        return normExist === normCand && distBetweenKm <= 0.35;
      });

      if (!isDuplicate) {
        deduped.push(candidate);
      }
      if (deduped.length >= 6) break;
    }

    return deduped;
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    return [];
  }
}

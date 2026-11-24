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

export const MAX_POI_POLYLINE_DISTANCE_METERS = 140;
export const MAX_POI_VERTEX_DISTANCE_METERS = MAX_POI_POLYLINE_DISTANCE_METERS;
export const LOOP_CALIBRATION_TOLERANCE = 0.12;
export const POI_DURATION_TOLERANCE = 0.15;

// Ordered 4-waypoint smooth teardrop/petal loop geometry around `bearingDeg`
export const PETAL_WAYPOINT_SPECS = [
  { angleOffsetDeg: -38, radiusFactor: 0.65 }, // Waypoint 1 (outbound leg)
  { angleOffsetDeg: -14, radiusFactor: 1.05 }, // Waypoint 2 (far apex left)
  { angleOffsetDeg: 16, radiusFactor: 1.05 }, // Waypoint 3 (far apex right)
  { angleOffsetDeg: 40, radiusFactor: 0.62 }, // Waypoint 4 (return leg)
];

// Out-and-back / U-turn spur detector thresholds
const SPUR_RESAMPLE_STEP_METERS = 5;
const SPUR_WINDOW_METERS = 35;
const SPUR_REVERSAL_ANGLE_DEG = 155;
const SPUR_PROXIMITY_METERS = 18;
const SPUR_MIN_TRACEBACK_METERS = 45;

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
 * When `baseBearingDeg` is supplied (as in multi-variant generation), all 3 variants
 * strictly rotate from that shared base (`baseBearing`, `baseBearing + 120°`, `baseBearing + 240°`)
 * so they radiate into 3 completely distinct compass sectors.
 */
export function resolveLoopBearingDeg(
  seed,
  exploredSectors = [],
  sectorStep = 0,
  bearingOffsetDeg = null,
  baseBearingDeg = null
) {
  const resolvedBase =
    typeof baseBearingDeg === 'number' && Number.isFinite(baseBearingDeg)
      ? ((baseBearingDeg % 360) + 360) % 360
      : selectUnexploredBearingDeg(seed, exploredSectors);
  const rotationDeg =
    typeof bearingOffsetDeg === 'number' ? bearingOffsetDeg : sectorStep * 45;
  return (((resolvedBase + rotationDeg) % 360) + 360) % 360;
}

/**
 * Generates 4 ordered perimeter waypoints forming a smooth, wide teardrop/petal loop
 * starting and ending at `origin` along `bearingDeg` for radial reach `radiusKm`:
 * - Waypoint 1 (outbound leg):   `bearingDeg - 38°` at `0.65 * radiusKm`
 * - Waypoint 2 (far apex left):  `bearingDeg - 14°` at `1.05 * radiusKm`
 * - Waypoint 3 (far apex right): `bearingDeg + 16°` at `1.05 * radiusKm`
 * - Waypoint 4 (return leg):     `bearingDeg + 40°` at `0.62 * radiusKm`
 *
 * Optional `waypointAdjustments` allows targeted spur-avoidance nudges per slot:
 * `[{ angleDeltaDeg, radiusScale }, ...]`.
 */
export function buildLoopAnchorsForRadius(
  origin,
  radiusKm,
  bearingDeg,
  activityMode = 'walk',
  seed = 0,
  waypointAdjustments = null
) {
  const [originLat, originLng] = origin;
  const latPerKm = 1 / 111.32;
  const lngPerKm =
    1 / (111.32 * Math.max(0.2, Math.cos((originLat * Math.PI) / 180)));

  const clampedRadiusKm = Math.max(0.14, Math.min(10, Number(radiusKm) || 0.5));

  return PETAL_WAYPOINT_SPECS.map((spec, idx) => {
    const adj = Array.isArray(waypointAdjustments)
      ? waypointAdjustments[idx]
      : null;
    const angleDeg =
      bearingDeg + spec.angleOffsetDeg + (adj?.angleDeltaDeg || 0);
    const rad = (angleDeg * Math.PI) / 180;
    const distKm =
      clampedRadiusKm * spec.radiusFactor * (adj?.radiusScale || 1);
    const lat = originLat + distKm * Math.cos(rad) * latPerKm;
    const lng = originLng + distKm * Math.sin(rad) * lngPerKm;
    return [Number(lat.toFixed(6)), Number(lng.toFixed(6))];
  });
}

/**
 * Convenience wrapper for initial petal loop anchor generation.
 * Straight-line petal perimeter is ~2.89 * radiusKm; with ~1.22–1.30x urban street tortuosity,
 * `targetKm / 3.45` starts close to the final calibrated radius.
 */
function buildLoopAnchors(
  origin,
  targetKm,
  activityMode,
  seed,
  exploredSectors = [],
  sectorStep = 0,
  bearingOffsetDeg = null,
  baseBearingDeg = null
) {
  const bearingDeg = resolveLoopBearingDeg(
    seed,
    exploredSectors,
    sectorStep,
    bearingOffsetDeg,
    baseBearingDeg
  );
  const initialRadiusKm = Math.max(0.14, targetKm / 3.45);
  return buildLoopAnchorsForRadius(
    origin,
    initialRadiusKm,
    bearingDeg,
    activityMode,
    seed
  );
}

/**
 * Computes shortest Euclidean distance from point `(px, py)` to segment `(ax, ay)-(bx, by)`.
 */
function pointToSegmentDist2D(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = 0;
  if (lenSq > 0) {
    t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  }
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Computes shortest Euclidean distance from point `(px, py)` to a range of polyline points
 * `pts[startIdx..endIdx]` (inclusive).
 */
function minDistToPlanarSubpolyline(px, py, pts, startIdx, endIdx) {
  let minDist = Infinity;
  if (startIdx >= endIdx) {
    const p = pts[startIdx];
    return p ? Math.hypot(px - p.x, py - p.y) : Infinity;
  }
  for (let m = startIdx; m < endIdx; m++) {
    const d = pointToSegmentDist2D(
      px,
      py,
      pts[m].x,
      pts[m].y,
      pts[m + 1].x,
      pts[m + 1].y
    );
    if (d < minDist) {
      minDist = d;
      if (minDist <= 0.5) return minDist;
    }
  }
  return minDist;
}

/**
 * Inspects a polyline (default: Mapbox Directions GeoJSON `geometry.coordinates` in `[lng, lat]` order)
 * for unnatural out-and-back / U-turn spurs.
 *
 * Uses subdivided arc-length samples (~5m) and sliding ~35m incoming/outgoing windows:
 * if the path reverses direction by `> 155°` AND traces back within `18 meters` of the incoming
 * path for more than `45 meters`, flags `hasSpur = true` and records the spur apex coordinates.
 */
export function analyzeOutAndBackSpurs(
  coordinates = [],
  {
    coordOrder = 'geojson', // 'geojson' ([lng, lat]) | 'latlng' ([lat, lng])
    windowMeters = SPUR_WINDOW_METERS,
    reversalAngleDeg = SPUR_REVERSAL_ANGLE_DEG,
    proximityMeters = SPUR_PROXIMITY_METERS,
    minTracebackMeters = SPUR_MIN_TRACEBACK_METERS,
    maxTurnaroundGapMeters = SPUR_PROXIMITY_METERS,
    checkClosedLoopSeam = true,
  } = {}
) {
  if (!Array.isArray(coordinates) || coordinates.length < 3) {
    return { hasSpur: false, spurs: [] };
  }

  const getLatLng = (coord) =>
    coordOrder === 'latlng'
      ? [Number(coord[0]), Number(coord[1])]
      : [Number(coord[1]), Number(coord[0])];

  const [refLat, refLng] = getLatLng(coordinates[0]);
  if (!Number.isFinite(refLat) || !Number.isFinite(refLng)) {
    return { hasSpur: false, spurs: [] };
  }
  const cosLat = Math.max(0.2, Math.cos((refLat * Math.PI) / 180));
  const metersPerLat = 111320;
  const metersPerLng = 111320 * cosLat;

  const toPlanar = (coord) => {
    const [lat, lng] = getLatLng(coord);
    return {
      x: (lng - refLng) * metersPerLng,
      y: (lat - refLat) * metersPerLat,
      lat,
      lng,
    };
  };

  // Build vertex-preserving subdivided polyline (max segment <= 5m) with cumulative arc-length
  const pts = [];
  const cumDist = [];
  const first = toPlanar(coordinates[0]);
  pts.push(first);
  cumDist.push(0);

  for (let i = 1; i < coordinates.length; i++) {
    const curr = toPlanar(coordinates[i]);
    if (!Number.isFinite(curr.x) || !Number.isFinite(curr.y)) continue;
    const prev = pts[pts.length - 1];
    const segLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    if (segLen < 0.05) continue;

    const steps = Math.max(1, Math.ceil(segLen / SPUR_RESAMPLE_STEP_METERS));
    const baseDist = cumDist[cumDist.length - 1];
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      pts.push({
        x: prev.x + (curr.x - prev.x) * t,
        y: prev.y + (curr.y - prev.y) * t,
        lat: prev.lat + (curr.lat - prev.lat) * t,
        lng: prev.lng + (curr.lng - prev.lng) * t,
      });
      cumDist.push(baseDist + segLen * t);
    }
  }

  const totalLen = cumDist[cumDist.length - 1] || 0;
  if (pts.length < 4 || totalLen < windowMeters * 2) {
    return { hasSpur: false, spurs: [] };
  }

  const findIndexAtDistanceBack = (idx, targetDelta) => {
    const targetDist = cumDist[idx] - targetDelta;
    if (targetDist <= 0) return 0;
    let lo = 0;
    let hi = idx;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumDist[mid] < targetDist) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const findIndexAtDistanceForward = (idx, targetDelta) => {
    const targetDist = cumDist[idx] + targetDelta;
    if (targetDist >= totalLen) return -1;
    let lo = idx;
    let hi = pts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumDist[mid] < targetDist) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const computeAngleDeg = (vx1, vy1, vx2, vy2) => {
    const m1 = Math.hypot(vx1, vy1);
    const m2 = Math.hypot(vx2, vy2);
    if (m1 < 10 || m2 < 10) return 0;
    const cosTheta = Math.max(-1, Math.min(1, (vx1 * vx2 + vy1 * vy2) / (m1 * m2)));
    return (Math.acos(cosTheta) * 180) / Math.PI;
  };

  const spurs = [];
  let lastSpurDist = -Infinity;

  // 1. Scan interior polyline for out-and-back / U-turn spurs
  for (let i = 1; i < pts.length - 1; i++) {
    if (cumDist[i] < windowMeters) continue;
    if (totalLen - cumDist[i] < minTracebackMeters) break;
    if (cumDist[i] - lastSpurDist < 30) continue;

    const inStart = findIndexAtDistanceBack(i, windowMeters);
    const inVx = pts[i].x - pts[inStart].x;
    const inVy = pts[i].y - pts[inStart].y;

    let detectedSpur = null;

    for (let j = i; j < pts.length - 1; j++) {
      if (cumDist[j] - cumDist[i] > maxTurnaroundGapMeters) break;

      const outEnd = findIndexAtDistanceForward(j, windowMeters);
      if (outEnd < 0) break;

      const outVx = pts[outEnd].x - pts[j].x;
      const outVy = pts[outEnd].y - pts[j].y;
      const angleDeg = computeAngleDeg(inVx, inVy, outVx, outVy);

      if (angleDeg <= reversalAngleDeg) continue;

      // Reversal > 155° detected: verify outgoing path traces back within 18m of incoming path for > 45m
      const lookbackStart = findIndexAtDistanceBack(i, 450);
      let tracedMeters = 0;
      let maxDisplacementFromApex = 0;

      for (let k = j + 1; k < pts.length; k++) {
        const dToIncoming = minDistToPlanarSubpolyline(
          pts[k].x,
          pts[k].y,
          pts,
          lookbackStart,
          i
        );
        if (dToIncoming <= proximityMeters) {
          tracedMeters = cumDist[k] - cumDist[j];
          const disp = Math.hypot(pts[k].x - pts[i].x, pts[k].y - pts[i].y);
          if (disp > maxDisplacementFromApex) {
            maxDisplacementFromApex = disp;
          }
          if (tracedMeters > minTracebackMeters && maxDisplacementFromApex > 35) {
            detectedSpur = {
              apexCoord: [
                Number(pts[i].lat.toFixed(6)),
                Number(pts[i].lng.toFixed(6)),
              ],
              reversalAngleDeg: Number(angleDeg.toFixed(1)),
              tracebackMeters: Math.round(tracedMeters),
              progressFraction: Number((cumDist[i] / totalLen).toFixed(3)),
              isOriginSeam: false,
            };
            break;
          }
        } else {
          break;
        }
      }

      if (detectedSpur) break;
    }

    if (detectedSpur) {
      spurs.push(detectedSpur);
      lastSpurDist = cumDist[i];
    }
  }

  // 2. For closed loops (start ≈ end), also check for an egregious out-and-back "lollipop" stem at origin
  //    (threshold 110m so normal 40-50m park-gate or mid-block exits from the user's starting pin aren't flagged)
  const seamMinTracebackMeters = Math.max(110, minTracebackMeters * 2.4);
  if (checkClosedLoopSeam && totalLen >= 300) {
    const startPt = pts[0];
    const endPt = pts[pts.length - 1];
    const seamDist = Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y);

    if (seamDist <= proximityMeters) {
      const endInStart = findIndexAtDistanceBack(pts.length - 1, windowMeters);
      const startOutEnd = findIndexAtDistanceForward(0, windowMeters);

      if (startOutEnd > 0 && endInStart < pts.length - 1) {
        const inVx = endPt.x - pts[endInStart].x;
        const inVy = endPt.y - pts[endInStart].y;
        const outVx = pts[startOutEnd].x - startPt.x;
        const outVy = pts[startOutEnd].y - startPt.y;
        const seamAngleDeg = computeAngleDeg(inVx, inVy, outVx, outVy);

        if (seamAngleDeg > reversalAngleDeg) {
          const endLookbackStart = findIndexAtDistanceBack(
            pts.length - 1,
            Math.min(400, totalLen * 0.4)
          );
          let tracedMeters = 0;
          let maxDisp = 0;

          for (let k = 1; k < pts.length && cumDist[k] < totalLen * 0.4; k++) {
            const dToReturn = minDistToPlanarSubpolyline(
              pts[k].x,
              pts[k].y,
              pts,
              endLookbackStart,
              pts.length - 1
            );
            if (dToReturn <= proximityMeters) {
              tracedMeters = cumDist[k];
              const disp = Math.hypot(pts[k].x - startPt.x, pts[k].y - startPt.y);
              if (disp > maxDisp) maxDisp = disp;
              if (tracedMeters > seamMinTracebackMeters && maxDisp > seamMinTracebackMeters * 0.8) {
                spurs.push({
                  apexCoord: [
                    Number(startPt.lat.toFixed(6)),
                    Number(startPt.lng.toFixed(6)),
                  ],
                  reversalAngleDeg: Number(seamAngleDeg.toFixed(1)),
                  tracebackMeters: Math.round(tracedMeters),
                  progressFraction: 0,
                  isOriginSeam: true,
                });
                break;
              }
            } else {
              break;
            }
          }
        }
      }
    }
  }

  return {
    hasSpur: spurs.length > 0,
    spurs,
  };
}

/**
 * Returns `true` if the Mapbox Directions `geometry.coordinates` polyline contains
 * any unnatural out-and-back / U-turn spur (>155° reversal tracing back within 18m for >45m).
 */
export function hasOutAndBackSpur(coordinates = [], options = {}) {
  return analyzeOutAndBackSpurs(coordinates, options).hasSpur;
}

/**
 * Computes the geometric centroid `[lat, lng]` of a loop defined by `origin` and its ordered anchors.
 */
export function computeLoopCentroid(origin, anchors = []) {
  const allPoints = [origin, ...anchors].filter(
    (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])
  );
  if (allPoints.length === 0) return origin || [0, 0];
  let sumLat = 0;
  let sumLng = 0;
  for (const [lat, lng] of allPoints) {
    sumLat += lat;
    sumLng += lng;
  }
  return [sumLat / allPoints.length, sumLng / allPoints.length];
}

/**
 * Computes clockwise compass angle in degrees `[0, 360)` from `centroid` to `point`.
 */
function centroidCompassAngleDeg(centroid, point) {
  const [cLat, cLng] = centroid;
  const [pLat, pLng] = point;
  const cosLat = Math.max(0.2, Math.cos((cLat * Math.PI) / 180));
  const dx = (pLng - cLng) * cosLat;
  const dy = pLat - cLat;
  return (((Math.atan2(dx, dy) * 180) / Math.PI) % 360 + 360) % 360;
}

/**
 * Determines the winding direction (`+1` clockwise, `-1` counter-clockwise) of a loop around its centroid.
 */
function detectLoopWindingSign(origin, anchors = [], centroid = null) {
  const c = centroid || computeLoopCentroid(origin, anchors);
  const ring = [origin, ...anchors, origin];
  let signedDelta = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a1 = centroidCompassAngleDeg(c, ring[i]);
    const a2 = centroidCompassAngleDeg(c, ring[i + 1]);
    let diff = a2 - a1;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    signedDelta += diff;
  }
  return signedDelta >= 0 ? 1 : -1;
}

/**
 * Verifies that `waypoints` preserve strict monotonic forward angular progression around the
 * loop `centroid` from `origin` (0°) back to `origin` (360°), never pulling the route backward.
 */
export function preservesLoopAngularProgression(
  origin,
  waypoints = [],
  centroid = null,
  windingSign = null,
  minAngleGapDeg = 10
) {
  if (!origin || !Array.isArray(waypoints) || waypoints.length === 0) {
    return true;
  }
  const c = centroid || computeLoopCentroid(origin, waypoints);
  const sign =
    typeof windingSign === 'number' && windingSign !== 0
      ? windingSign
      : detectLoopWindingSign(origin, waypoints, c);

  const originAngle = centroidCompassAngleDeg(c, origin);
  let prevForward = 0;

  for (const wp of waypoints) {
    if (!Array.isArray(wp) || wp.length < 2) return false;
    // Reject points collapsed right on top of the centroid where angle is ill-defined
    if (distanceMeters(c, wp) < 30) return false;

    const rawAngle = centroidCompassAngleDeg(c, wp);
    const forward =
      sign > 0
        ? (((rawAngle - originAngle) % 360) + 360) % 360
        : (((originAngle - rawAngle) % 360) + 360) % 360;

    if (forward <= prevForward + minAngleGapDeg) {
      return false;
    }
    if (forward >= 360 - minAngleGapDeg) {
      return false;
    }
    prevForward = forward;
  }

  return true;
}

/**
 * Finds the nearest `[lat, lng]` point on `polyline` to `targetCoord` so POI probes
 * anchor directly on actual walkable streets of the calibrated loop.
 */
function findClosestPointOnPolyline(targetCoord, polyline = []) {
  if (!Array.isArray(polyline) || polyline.length === 0) return targetCoord;
  let bestPt = polyline[0];
  let bestDist = Infinity;
  for (let i = 0; i < polyline.length; i++) {
    const d = distanceMeters(targetCoord, polyline[i]);
    if (d < bestDist) {
      bestDist = d;
      bestPt = polyline[i];
    }
  }
  return bestPt;
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
 * 1. Lies within `maxPolylineDistanceMeters` (140m) of the clean calibrated loop/corridor polyline
 *    (or within `maxVertexDistanceMeters` of a calibrated vertex when no polyline is provided).
 * 2. Never sits near the start/end `origin` (or `destination` in Point A -> B mode).
 * 3. Maps cleanly to at most one calibrated vertex slot (`matchedAnchorIndex`) to prevent clustering.
 */
function filterPOIsNearCalibratedVertices(
  pois = [],
  calibratedVertices = [],
  {
    origin = null,
    destination = null,
    cleanPolyline = null,
    maxPolylineDistanceMeters = MAX_POI_POLYLINE_DISTANCE_METERS,
    maxVertexDistanceMeters = MAX_POI_VERTEX_DISTANCE_METERS,
    minOriginDistanceMeters = 150,
    minDestinationDistanceMeters = 120,
  } = {}
) {
  if (!Array.isArray(pois) || pois.length === 0 || calibratedVertices.length === 0) {
    return [];
  }

  const hasPolyline = Array.isArray(cleanPolyline) && cleanPolyline.length >= 2;
  const slotAnchors = hasPolyline
    ? calibratedVertices.map((v) => findClosestPointOnPolyline(v, cleanPolyline))
    : calibratedVertices;
  const maxSlotDistance = hasPolyline
    ? Math.max(maxVertexDistanceMeters, 260)
    : maxVertexDistanceMeters;

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

    const polyDist = hasPolyline
      ? distanceToPolylineMeters(poi.coords, cleanPolyline)
      : Infinity;
    if (hasPolyline && polyDist > maxPolylineDistanceMeters) {
      continue;
    }

    let nearestIdx = -1;
    let nearestDist = Infinity;
    for (let i = 0; i < slotAnchors.length; i++) {
      const d = distanceMeters(slotAnchors[i], poi.coords);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }

    if (nearestIdx < 0 || nearestDist > maxSlotDistance) {
      continue;
    }

    const enriched = {
      ...poi,
      matchedAnchorIndex: nearestIdx,
      distFromAnchorMeters: Math.round(nearestDist),
      distFromPolylineMeters: hasPolyline
        ? Math.round(polyDist)
        : Math.round(nearestDist),
    };

    const existing = slotBest.get(nearestIdx);
    const rankDist = hasPolyline
      ? enriched.distFromPolylineMeters
      : enriched.distFromAnchorMeters;
    const existingRankDist = existing
      ? hasPolyline
        ? existing.distFromPolylineMeters
        : existing.distFromAnchorMeters
      : Infinity;
    if (!existing || rankDist < existingRankDist) {
      slotBest.set(nearestIdx, enriched);
    }
  }

  return Array.from(slotBest.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, poi]) => poi);
}

/**
 * Replaces calibrated anchor vertices with matched POIs in their exact loop/corridor slot order,
 * preserving the original calibrated anchor whenever a vertex has no qualifying POI so the loop
 * can never short-circuit, backtrack, or collapse.
 *
 * When `cleanPolyline` and/or `origin` (with `isLoop: true`) are supplied, only keeps a POI if:
 * 1. It lies within `maxPolylineDistanceMeters` (140m) of the clean loop polyline.
 * 2. It preserves strict monotonic forward angular progression around the loop centroid
 *    from start to finish (never pulling the route backward).
 */
export function mergePOIsIntoCalibratedAnchors(
  calibratedAnchors = [],
  matchedPOIs = [],
  {
    cleanPolyline = null,
    maxPolylineDistanceMeters = MAX_POI_POLYLINE_DISTANCE_METERS,
    origin = null,
    isLoop = false,
    minAngleGapDeg = 10,
    keptPOIsOut = null,
  } = {}
) {
  const poiBySlot = new Map();
  for (const poi of matchedPOIs) {
    if (typeof poi?.matchedAnchorIndex === 'number' && Array.isArray(poi?.coords)) {
      poiBySlot.set(poi.matchedAnchorIndex, poi);
    }
  }

  const hasPolyline = Array.isArray(cleanPolyline) && cleanPolyline.length >= 2;
  const checkLoopAngles = Boolean(isLoop && origin && calibratedAnchors.length > 0);
  const centroid = checkLoopAngles
    ? computeLoopCentroid(origin, calibratedAnchors)
    : null;
  const windingSign = checkLoopAngles
    ? detectLoopWindingSign(origin, calibratedAnchors, centroid)
    : 1;

  const merged = [...calibratedAnchors];

  for (let idx = 0; idx < calibratedAnchors.length; idx++) {
    const poi = poiBySlot.get(idx);
    if (!poi) continue;

    // 1. Strict distance check: within 140m of the clean loop polyline
    if (hasPolyline) {
      const polyDist = distanceToPolylineMeters(poi.coords, cleanPolyline);
      if (!Number.isFinite(polyDist) || polyDist > maxPolylineDistanceMeters) {
        continue;
      }
    }

    // 2. Forward angular progression check around the loop centroid
    if (checkLoopAngles) {
      const candidateMerged = [...merged];
      candidateMerged[idx] = poi.coords;
      if (
        !preservesLoopAngularProgression(
          origin,
          candidateMerged,
          centroid,
          windingSign,
          minAngleGapDeg
        )
      ) {
        continue;
      }
    }

    merged[idx] = poi.coords;
    if (Array.isArray(keptPOIsOut)) {
      keptPOIsOut.push(poi);
    }
  }

  return merged;
}

/**
 * Generates a smooth closed Catmull-Rom spline polyline passing through `[origin, ...anchors]`
 * and returning cleanly to `origin` (used for offline/initial-render petal loops).
 */
function interpolateSmoothClosedPetal(origin, anchors = [], subdivisionsPerLeg = 7) {
  const ring = [origin, ...anchors];
  const n = ring.length;
  if (n < 3) return [origin, ...anchors, origin];

  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = ring[(i - 1 + n) % n];
    const p1 = ring[i];
    const p2 = ring[(i + 1) % n];
    const p3 = ring[(i + 2) % n];

    for (let s = 0; s < subdivisionsPerLeg; s++) {
      const t = s / subdivisionsPerLeg;
      const t2 = t * t;
      const t3 = t2 * t;
      const lat =
        0.5 *
        (2 * p1[0] +
          (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const lng =
        0.5 *
        (2 * p1[1] +
          (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push([Number(lat.toFixed(6)), Number(lng.toFixed(6))]);
    }
  }
  out[0] = origin;
  out.push(origin);
  return out;
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
  baseBearingDeg = null,
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
  let resolvedBearingDeg = null;

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
    const spanRadiusKm = Math.max(0.14, distanceKm / 3.45);
    resolvedBearingDeg = resolveLoopBearingDeg(
      seed,
      history.exploredSectors,
      resolvedSectorStep,
      spec.bearingOffsetDeg,
      baseBearingDeg
    );
    const petalAnchors = buildLoopAnchorsForRadius(
      origin,
      spanRadiusKm,
      resolvedBearingDeg,
      activityMode,
      seed
    );
    waypoints = interpolateSmoothClosedPetal(
      origin,
      petalAnchors,
      activityMode === 'walk' ? 7 : 5
    );
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
    bearingDeg: resolvedBearingDeg,
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
  baseBearingDeg = null,
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
      baseBearingDeg,
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

    const fetchDirectionsForNodes = async (nodes, { continueStraight = false } = {}) => {
      const coordsQuery = nodes
        .map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`)
        .join(';');
      const continueParam = continueStraight ? '&continue_straight=true' : '';
      const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coordsQuery}?geometries=geojson&overview=full&steps=false${continueParam}&access_token=${activeToken}`;
      const res = await fetch(url, { signal });
      if (!res.ok) {
        throw new Error(`Mapbox Directions HTTP ${res.status}`);
      }
      const json = await res.json();
      return json?.routes?.[0] || null;
    };

    const computeRouteMinutes = (mapboxRoute) =>
      distanceMetersToMinutesExact(mapboxRoute?.distance || 0, activityMode);

    const isWithinBudget = (actualMinutes, budgetMinutes, tol = LOOP_CALIBRATION_TOLERANCE) =>
      Math.abs(actualMinutes - budgetMinutes) / budgetMinutes <= tol;

    const pickClosestCandidate = (candidates, goalMinutes, budgetMinutes) => {
      if (!candidates.length) return null;
      const cleanWithinBudget = candidates.filter(
        (c) => !c.hasSpur && isWithinBudget(c.actualMinutes, budgetMinutes)
      );
      const withinBudget = candidates.filter((c) =>
        isWithinBudget(c.actualMinutes, budgetMinutes)
      );
      const cleanClose = candidates.filter(
        (c) => !c.hasSpur && isWithinBudget(c.actualMinutes, budgetMinutes, 0.16)
      );
      const pool =
        cleanWithinBudget.length > 0
          ? cleanWithinBudget
          : cleanClose.length > 0
          ? cleanClose
          : withinBudget.length > 0
          ? withinBudget
          : candidates;
      return pool.reduce((best, curr) => {
        const bestSpurs = best.spurCount ?? (best.hasSpur ? 1 : 0);
        const currSpurs = curr.spurCount ?? (curr.hasSpur ? 1 : 0);
        if (currSpurs !== bestSpurs && pool === withinBudget) {
          return currSpurs < bestSpurs ? curr : best;
        }
        const bestErr = Math.abs(best.actualMinutes - goalMinutes);
        const currErr = Math.abs(curr.actualMinutes - goalMinutes);
        return currErr < bestErr ? curr : best;
      });
    };

    let calibratedRoute = null;
    let calibratedAnchors = [];
    let calibratedContinueStraight = false;
    let isDirectRoute = false;
    let durationBadge = null;
    let resolvedBearingDeg = null;
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
            gentleMins <= directMinutesExact * 1.1 &&
            !hasOutAndBackSpur(gentleRoute.geometry.coordinates)
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

        const directSpurs = analyzeOutAndBackSpurs(directRoute.geometry.coordinates);
        const candidates = [
          {
            route: directRoute,
            anchors: [],
            actualMinutes: directMinutesExact,
            detourAmplitudeKm: 0,
            hasSpur: directSpurs.hasSpur,
            spurCount: directSpurs.spurs.length,
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
          const spurAnalysis = analyzeOutAndBackSpurs(
            candidateRoute.geometry.coordinates
          );
          candidates.push({
            route: candidateRoute,
            anchors,
            actualMinutes,
            detourAmplitudeKm,
            hasSpur: spurAnalysis.hasSpur,
            spurCount: spurAnalysis.spurs.length,
          });

          if (actualMinutes <= 0) break;
          const ratio = corridorTargetMinutes / actualMinutes;
          const offVariant = Math.abs(1 - ratio) > LOOP_CALIBRATION_TOLERANCE;
          const offBudget =
            Math.abs(actualMinutes - baseTargetMinutes) / baseTargetMinutes >
            LOOP_CALIBRATION_TOLERANCE;

          if (!offVariant && !offBudget && !spurAnalysis.hasSpur) {
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
      // Loop Mode: Smooth 4-Waypoint Petal Geometry + Iterative Radial Calibration + Spur Repair
      resolvedBearingDeg = resolveLoopBearingDeg(
        seed,
        history.exploredSectors,
        resolvedSectorStep,
        spec.bearingOffsetDeg,
        baseBearingDeg
      );

      let radiusKm = Math.max(0.14, (targetDistanceKm * variantScale) / 3.45);
      const candidates = [];
      const MAX_REFINEMENT_ITERATIONS = 4;

      const evaluateLoopCandidate = async (
        candRadiusKm,
        candBearingDeg,
        waypointAdjustments = null,
        omitSlotIndices = null,
        continueStraight = false
      ) => {
        const allAnchors = buildLoopAnchorsForRadius(
          origin,
          candRadiusKm,
          candBearingDeg,
          activityMode,
          seed,
          waypointAdjustments
        );
        const anchors = [];
        const slotIndices = [];
        allAnchors.forEach((coord, idx) => {
          if (!omitSlotIndices || !omitSlotIndices.has(idx)) {
            anchors.push(coord);
            slotIndices.push(idx);
          }
        });
        if (anchors.length < 2) return null;

        const route = await fetchDirectionsForNodes(
          [origin, ...anchors, origin],
          { continueStraight }
        );
        if (!route?.geometry?.coordinates || route.geometry.coordinates.length < 2) {
          return null;
        }
        const actualMinutes = computeRouteMinutes(route);
        const spurAnalysis = analyzeOutAndBackSpurs(route.geometry.coordinates);
        return {
          route,
          anchors,
          slotIndices,
          radiusKm: candRadiusKm,
          bearingDeg: candBearingDeg,
          waypointAdjustments,
          omitSlotIndices,
          continueStraight,
          actualMinutes,
          hasSpur: spurAnalysis.hasSpur,
          spurCount: spurAnalysis.spurs.length,
          spurAnalysis,
        };
      };

      for (let iteration = 0; iteration <= MAX_REFINEMENT_ITERATIONS; iteration++) {
        const cand = await evaluateLoopCandidate(radiusKm, resolvedBearingDeg);
        if (!cand) {
          if (candidates.length === 0) {
            throw new Error('No street geometry returned from Mapbox Directions');
          }
          break;
        }

        candidates.push(cand);
        if (cand.actualMinutes <= 0) break;

        const ratio = targetVariantMinutes / cand.actualMinutes;
        const offVariant = Math.abs(1 - ratio) > LOOP_CALIBRATION_TOLERANCE;
        const offBaseBudget =
          Math.abs(cand.actualMinutes - baseTargetMinutes) / baseTargetMinutes > 0.1;

        if (!offVariant && !offBaseBudget && !cand.hasSpur) {
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

      let bestLoop = pickClosestCandidate(
        candidates,
        targetVariantMinutes,
        baseTargetMinutes
      );
      if (!bestLoop) {
        throw new Error('No calibrated loop candidate produced');
      }

      // If the best calibrated loop still has an out-and-back / U-turn spur (e.g. near
      // railway tracks, cemeteries, or cul-de-sacs), enforce continue_straight, nudge or omit
      // the offending anchor(s), or gently rotate within this variant's 120° compass sector.
      if (bestLoop.hasSpur) {
        const findBadSlots = (loopCand) => {
          const slots = new Set();
          const slotMap =
            loopCand.slotIndices || loopCand.anchors.map((_, idx) => idx);
          for (const spur of loopCand.spurAnalysis?.spurs || []) {
            if (spur.isOriginSeam) {
              slots.add(slotMap[0]);
              slots.add(slotMap[slotMap.length - 1]);
              continue;
            }
            let nearestIdx = 0;
            let nearestDist = Infinity;
            loopCand.anchors.forEach((anchor, idx) => {
              const d = distanceMeters(anchor, spur.apexCoord);
              if (d < nearestDist) {
                nearestDist = d;
                nearestIdx = idx;
              }
            });
            slots.add(slotMap[nearestIdx]);
          }
          return slots;
        };

        const evaluateAndRescalePlan = async (
          baseRadius,
          planBearing,
          planAdj,
          planOmit,
          planContinueStraight = false
        ) => {
          let currRadius = baseRadius;
          let repaired = await evaluateLoopCandidate(
            currRadius,
            planBearing,
            planAdj,
            planOmit,
            planContinueStraight
          );
          if (!repaired) return false;
          candidates.push(repaired);

          if (!repaired.hasSpur) {
            for (let rescalePass = 0; rescalePass < 2; rescalePass++) {
              if (isWithinBudget(repaired.actualMinutes, baseTargetMinutes)) {
                break;
              }
              const fixRatio = Math.max(
                0.4,
                Math.min(2.2, targetVariantMinutes / repaired.actualMinutes)
              );
              currRadius = Math.max(
                0.12,
                Math.min(10, currRadius * Math.pow(fixRatio, 0.85))
              );
              const rescaled = await evaluateLoopCandidate(
                currRadius,
                planBearing,
                planAdj,
                planOmit,
                planContinueStraight
              );
              if (!rescaled) break;
              candidates.push(rescaled);
              repaired = rescaled;
              if (rescaled.hasSpur) break;
            }

            const refreshedBest = pickClosestCandidate(
              candidates,
              targetVariantMinutes,
              baseTargetMinutes
            );
            if (
              refreshedBest &&
              !refreshedBest.hasSpur &&
              isWithinBudget(refreshedBest.actualMinutes, baseTargetMinutes)
            ) {
              bestLoop = refreshedBest;
              return true;
            }
          }
          return false;
        };

        const badSlotSet = findBadSlots(bestLoop);
        const buildSlotAdjustment = (fn) =>
          PETAL_WAYPOINT_SPECS.map((_, idx) => (badSlotSet.has(idx) ? fn(idx) : null));
        const primaryBadSlot = Array.from(badSlotSet)[0];

        const hasOriginSeamSpur = (bestLoop.spurAnalysis?.spurs || []).some(
          (s) => s.isOriginSeam
        );

        const repairPlans = [
          // 1. Disallow U-turns at intermediate anchors with Mapbox continue_straight=true
          {
            bearingDeg: bestLoop.bearingDeg,
            adjustments: null,
            omit: null,
            continueStraight: true,
          },
          // 1b. If an origin lollipop stem was detected, widen the outbound/return opening
          ...(hasOriginSeamSpur
            ? [
                {
                  bearingDeg: bestLoop.bearingDeg,
                  adjustments: [
                    { angleDeltaDeg: -14, radiusScale: 0.9 },
                    null,
                    null,
                    { angleDeltaDeg: 14, radiusScale: 0.9 },
                  ],
                  omit: null,
                  continueStraight: true,
                },
              ]
            : []),
          // 2. Pull offending anchor(s) radially inward onto interior through-streets
          {
            bearingDeg: bestLoop.bearingDeg,
            adjustments: buildSlotAdjustment((idx) => ({
              radiusScale: 0.78,
              angleDeltaDeg: idx <= 1 ? 8 : -8,
            })),
            omit: null,
            continueStraight: true,
          },
          // 3. Omit the primary blocked anchor so the loop smoothly bypasses the dead-end/barrier
          ...(typeof primaryBadSlot === 'number'
            ? [
                {
                  bearingDeg: bestLoop.bearingDeg,
                  adjustments: null,
                  omit: new Set([primaryBadSlot]),
                  continueStraight: true,
                },
              ]
            : []),
          // 4. Gently rotate entire petal -12° / +12° with continue_straight=true (strictly inside 120° sector)
          {
            bearingDeg: (bestLoop.bearingDeg + 348) % 360,
            adjustments: null,
            omit: null,
            continueStraight: true,
          },
          {
            bearingDeg: (bestLoop.bearingDeg + 12) % 360,
            adjustments: null,
            omit: null,
            continueStraight: true,
          },
          // 5. Clear major urban barriers (e.g. walled cemeteries / railway trenches) with ±20° shift
          //    (still maintains ~100° separation from neighboring 120° sectors)
          {
            bearingDeg: (bestLoop.bearingDeg + 340) % 360,
            adjustments: null,
            omit: null,
            continueStraight: true,
          },
          {
            bearingDeg: (bestLoop.bearingDeg + 20) % 360,
            adjustments: null,
            omit: null,
            continueStraight: true,
          },
          // 6. Push offending anchor(s) tangentially around a barrier
          {
            bearingDeg: bestLoop.bearingDeg,
            adjustments: buildSlotAdjustment((idx) => ({
              radiusScale: 1.08,
              angleDeltaDeg: idx <= 1 ? -16 : 16,
            })),
            omit: null,
            continueStraight: true,
          },
        ];

        let repairedCleanly = false;
        for (const plan of repairPlans) {
          repairedCleanly = await evaluateAndRescalePlan(
            bestLoop.radiusKm,
            plan.bearingDeg,
            plan.adjustments,
            plan.omit,
            plan.continueStraight
          );
          if (repairedCleanly) break;
        }

        // Stage 2: If a repair candidate reduced spurs to 1, directly omit/nudge THAT candidate's
        // true remaining offending anchor slot (with continue_straight) until spur-free within ±12%.
        if (!repairedCleanly) {
          const fewestSpurCand = candidates.reduce((best, curr) => {
            if (curr.spurCount !== best.spurCount) {
              return curr.spurCount < best.spurCount ? curr : best;
            }
            return Math.abs(curr.actualMinutes - targetVariantMinutes) <
              Math.abs(best.actualMinutes - targetVariantMinutes)
              ? curr
              : best;
          });

          if (fewestSpurCand && fewestSpurCand.hasSpur && fewestSpurCand.anchors.length >= 3) {
            const stage2HasOriginSeam = (fewestSpurCand.spurAnalysis?.spurs || []).some(
              (s) => s.isOriginSeam
            );
            if (stage2HasOriginSeam) {
              repairedCleanly = await evaluateAndRescalePlan(
                fewestSpurCand.radiusKm,
                fewestSpurCand.bearingDeg,
                [
                  { angleDeltaDeg: -16, radiusScale: 0.9 },
                  null,
                  null,
                  { angleDeltaDeg: 16, radiusScale: 0.9 },
                ],
                null,
                true
              );
            }
            const stage2BadSlots = findBadSlots(fewestSpurCand);
            const stage2Slot = Array.from(stage2BadSlots)[0];
            if (!repairedCleanly && typeof stage2Slot === 'number') {
              const combinedOmit = new Set([
                ...(fewestSpurCand.omitSlotIndices || []),
                stage2Slot,
              ]);
              if (combinedOmit.size <= 2) {
                repairedCleanly = await evaluateAndRescalePlan(
                  fewestSpurCand.radiusKm,
                  fewestSpurCand.bearingDeg,
                  fewestSpurCand.waypointAdjustments,
                  combinedOmit,
                  true
                );
              }
              if (!repairedCleanly) {
                const inwardAdj = PETAL_WAYPOINT_SPECS.map((_, idx) =>
                  idx === stage2Slot
                    ? { radiusScale: 0.72, angleDeltaDeg: idx <= 1 ? 10 : -10 }
                    : fewestSpurCand.waypointAdjustments?.[idx] || null
                );
                await evaluateAndRescalePlan(
                  fewestSpurCand.radiusKm,
                  fewestSpurCand.bearingDeg,
                  inwardAdj,
                  fewestSpurCand.omitSlotIndices,
                  true
                );
              }
            }
          }
        }

        bestLoop = pickClosestCandidate(
          candidates,
          targetVariantMinutes,
          baseTargetMinutes
        );
      }

      // Final precision pass: if the selected spur-free loop is still outside ±12% of target
      // (e.g. due to a nonlinear street-grid jump), run up to 2 damped radial scale passes.
      if (
        bestLoop &&
        !isWithinBudget(bestLoop.actualMinutes, baseTargetMinutes)
      ) {
        let fineRadius = bestLoop.radiusKm;
        let lastCand = bestLoop;
        for (let finePass = 0; finePass < 2; finePass++) {
          if (isWithinBudget(lastCand.actualMinutes, baseTargetMinutes)) break;
          const fineRatio = Math.max(
            0.45,
            Math.min(2.0, targetVariantMinutes / lastCand.actualMinutes)
          );
          fineRadius = Math.max(
            0.12,
            Math.min(10, fineRadius * Math.pow(fineRatio, 0.85))
          );
          const fineCand = await evaluateLoopCandidate(
            fineRadius,
            bestLoop.bearingDeg,
            bestLoop.waypointAdjustments,
            bestLoop.omitSlotIndices,
            bestLoop.continueStraight
          );
          if (!fineCand) break;
          candidates.push(fineCand);
          lastCand = fineCand;
        }
        bestLoop = pickClosestCandidate(
          candidates,
          targetVariantMinutes,
          baseTargetMinutes
        );
      }

      calibratedRoute = bestLoop.route;
      calibratedAnchors = bestLoop.anchors;
      calibratedContinueStraight = Boolean(bestLoop.continueStraight);
      resolvedBearingDeg = bestLoop.bearingDeg;
      // Keep POIs clearly away from start/end origin (scales cleanly for short & long loops)
      minOriginDistanceMeters = Math.max(
        110,
        Math.min(250, Math.round(bestLoop.radiusKm * 320))
      );
    }

    const calibratedLatLngs = geoJsonToLatLngs(
      calibratedRoute.geometry.coordinates
    );
    const baseSpurAnalysis = analyzeOutAndBackSpurs(
      calibratedRoute.geometry.coordinates
    );

    // Step 2: Discover real POIs strictly within 140m of the ALREADY-CALIBRATED clean loop polyline
    const snappedPOIProbes = calibratedAnchors.map((anchor) =>
      findClosestPointOnPolyline(anchor, calibratedLatLngs)
    );
    const rawPOIs = await fetchRealPOIsAlongRoute(
      snappedPOIProbes,
      activityMode,
      activeToken,
      {
        seed,
        stopVibe,
        variantKey: spec.variantKey,
        signal,
        visitedPoiNames: history.visitedPoiNames,
        visitedPoiIds: history.visitedPoiIds,
        routePolyline: calibratedLatLngs,
        maxPolylineDistanceMeters: MAX_POI_POLYLINE_DISTANCE_METERS,
        maxDistanceFromAnchorMeters: 220,
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
      cleanPolyline: calibratedLatLngs,
      maxPolylineDistanceMeters: MAX_POI_POLYLINE_DISTANCE_METERS,
      maxVertexDistanceMeters: MAX_POI_VERTEX_DISTANCE_METERS,
      minOriginDistanceMeters: minOriginDistanceMeters,
      minDestinationDistanceMeters: minDestinationDistanceMeters,
    });

    if (routeType === 'pointToPoint' && destination && filteredPOIs.length > 1) {
      filteredPOIs = sortPOIsAlongCorridor(filteredPOIs, origin, destination);
    }

    // Step 3: Insert filtered POIs into calibrated anchor slots ONLY when each POI:
    //   1. Lies within 140m of the clean loop polyline.
    //   2. Preserves monotonic forward angular progression around the loop centroid.
    //   3. Does NOT introduce an out-and-back / U-turn spur (`hasOutAndBackSpur === false`)
    //      and keeps duration within tolerance.
    // Otherwise skip offending POI(s) and fall back gracefully to the smooth circular loop.
    let primaryRoute = calibratedRoute;

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

    const getPoiKey = (poi) =>
      String(poi?.id || `${poi?.name || ''}-${poi?.coords?.[0]}-${poi?.coords?.[1]}`);

    if (filteredPOIs.length > 0) {
      let activePOIs = [...filteredPOIs];
      let acceptedPOIRoute = null;
      const spurRejectedKeys = new Set();
      const MAX_POI_PRUNE_ATTEMPTS = Math.min(4, activePOIs.length);

      for (let attempt = 0; attempt < MAX_POI_PRUNE_ATTEMPTS; attempt++) {
        if (activePOIs.length === 0) break;

        const keptPOIs = [];
        const mergedWaypoints = mergePOIsIntoCalibratedAnchors(
          calibratedAnchors,
          activePOIs,
          {
            cleanPolyline: calibratedLatLngs,
            maxPolylineDistanceMeters: MAX_POI_POLYLINE_DISTANCE_METERS,
            origin,
            isLoop: routeType !== 'pointToPoint',
            keptPOIsOut: keptPOIs,
          }
        );

        if (keptPOIs.length === 0) {
          break;
        }

        const queryNodes =
          routeType === 'pointToPoint' && destination
            ? [origin, ...mergedWaypoints, destination]
            : [origin, ...mergedWaypoints, origin];

        const poiRoute = await fetchDirectionsForNodes(queryNodes, {
          continueStraight: calibratedContinueStraight,
        });
        const poiMinutes = computeRouteMinutes(poiRoute);
        const poiCoords = poiRoute?.geometry?.coordinates || [];
        const poiSpurAnalysis = analyzeOutAndBackSpurs(poiCoords);

        const introducedSpur =
          poiSpurAnalysis.hasSpur &&
          (!baseSpurAnalysis.hasSpur ||
            poiSpurAnalysis.spurs.some((s) => !s.isOriginSeam) ||
            poiSpurAnalysis.spurs.length > baseSpurAnalysis.spurs.length);

        if (
          poiCoords.length >= 2 &&
          !introducedSpur &&
          isPOIInsertionWithinTolerance(poiMinutes)
        ) {
          acceptedPOIRoute = poiRoute;
          discoveredPOIs = keptPOIs;
          break;
        }

        if (introducedSpur) {
          // Identify the exact POI closest to the detected U-turn spur apex and skip it
          const targetSpur =
            poiSpurAnalysis.spurs.find((s) => !s.isOriginSeam) ||
            poiSpurAnalysis.spurs[0];
          let culpritPoi = keptPOIs[0];
          let minSpurDist = Infinity;
          for (const poi of keptPOIs) {
            const d = targetSpur?.apexCoord
              ? distanceMeters(poi.coords, targetSpur.apexCoord)
              : Infinity;
            if (d < minSpurDist) {
              minSpurDist = d;
              culpritPoi = poi;
            }
          }
          const culpritKey = getPoiKey(culpritPoi);
          spurRejectedKeys.add(culpritKey);
          activePOIs = activePOIs.filter((p) => getPoiKey(p) !== culpritKey);
          continue;
        }

        // Duration drifted without a spur: drop the single POI furthest from the clean polyline
        if (keptPOIs.length <= 1) {
          break;
        }
        let worstPoi = keptPOIs[0];
        let worstScore = -1;
        for (const poi of keptPOIs) {
          const polyDist = distanceToPolylineMeters(poi.coords, calibratedLatLngs);
          const score =
            (Number.isFinite(polyDist) ? polyDist : 300) * 2 +
            (poi.distFromAnchorMeters || 0);
          if (score > worstScore) {
            worstScore = score;
            worstPoi = poi;
          }
        }
        const worstKey = getPoiKey(worstPoi);
        activePOIs = activePOIs.filter((p) => getPoiKey(p) !== worstKey);
      }

      if (acceptedPOIRoute) {
        primaryRoute = acceptedPOIRoute;
      } else {
        // Fallback gracefully to the smooth circular loop geometry without forcing any U-turn detour
        primaryRoute = calibratedRoute;
        discoveredPOIs = filteredPOIs.filter(
          (poi) =>
            !spurRejectedKeys.has(getPoiKey(poi)) &&
            distanceToPolylineMeters(poi.coords, calibratedLatLngs) <=
              MAX_POI_POLYLINE_DISTANCE_METERS
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
      bearingDeg: resolvedBearingDeg,
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
      baseBearingDeg,
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
 * for immediate initial render or offline mode, radiating into 3 strictly separated 120° compass sectors.
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

  // Compute ONE shared base bearing from `seed` so all 3 variants strictly occupy
  // `baseBearing`, `baseBearing + 120°`, and `baseBearing + 240°`.
  const baseBearingDeg = selectUnexploredBearingDeg(seed, history.exploredSectors);

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
      baseBearingDeg,
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
 * - Route 1 ("Curated Drift" — Balanced): Primary unexplored compass sector (`baseBearing`), balanced mix of lively side streets & curated stops
 * - Route 2 ("Quiet Alleys" — Calm & Green): Rotated compass sector (`baseBearing + 120°` in Loop, left-flank corridor in Point A -> B) prioritizing parks & quiet lanes
 * - Route 3 ("Hidden Gems" — Local Discovery): Opposite compass sector (`baseBearing + 240°` in Loop, right-flank corridor in Point A -> B) routed toward distinct culinary/cultural POIs
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

  // Compute ONE shared base bearing from `seed` so all 3 variants strictly occupy
  // `baseBearing`, `baseBearing + 120°`, and `baseBearing + 240°`.
  const baseBearingDeg = selectUnexploredBearingDeg(seed, history.exploredSectors);

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
        baseBearingDeg,
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

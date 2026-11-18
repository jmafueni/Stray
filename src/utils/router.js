// src/utils/router.js
import {
  getPOIsForRoute,
  fetchRealPOIsAlongRoute,
  calculateDetourMeters,
  isGenericChain,
} from './pois.js';
import { loadDriftHistory } from './storage.js';

const MAPBOX_TOKEN = (import.meta.env?.VITE_MAPBOX_TOKEN || '').trim();

export const STEP_TO_KM_FACTOR = 0.00075; // 1,000 steps ≈ 0.75 km

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
 * Converts target step count to kilometers (1,000 steps ≈ 0.75 km).
 */
export function stepsToKm(steps) {
  return Number((steps * STEP_TO_KM_FACTOR).toFixed(2));
}

/**
 * Converts kilometers to estimated steps.
 */
export function kmToSteps(km) {
  return Math.round(km / STEP_TO_KM_FACTOR);
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
 */
export const ROUTE_VARIANT_SPECS = [
  {
    variantIndex: 0,
    variantKey: 'primary',
    variantLabel: 'Curated Drift',
    variantBadge: 'Primary',
    distanceScale: 1.0,
    sectorStep: 0,
    seedStep: 0,
    quietBonus: 0,
    corridorStyle: 'primary',
  },
  {
    variantIndex: 1,
    variantKey: 'quiet',
    variantLabel: 'Quiet Alleys',
    variantBadge: '98% Calm',
    distanceScale: 0.86,
    sectorStep: 3, // ~135° shifted compass bearing
    seedStep: 11,
    quietBonus: 3,
    corridorStyle: 'opposite',
  },
  {
    variantIndex: 2,
    variantKey: 'scenic',
    variantLabel: 'Scenic Arc',
    variantBadge: 'Deep Explorer',
    distanceScale: 1.2,
    sectorStep: 5, // ~225° shifted compass bearing
    seedStep: 29,
    quietBonus: 1,
    corridorStyle: 'wide',
  },
];

/**
 * Generates 3 or 4 organic directional anchor waypoints around `origin`
 * scaled so the resulting street-routed loop matches the target step/distance budget.
 */
function buildLoopAnchors(
  origin,
  targetKm,
  activityMode,
  seed,
  exploredSectors = [],
  sectorStep = 0
) {
  const [originLat, originLng] = origin;
  const latPerKm = 1 / 111.32;
  const lngPerKm = 1 / (111.32 * Math.cos((originLat * Math.PI) / 180));

  // Urban street networks add ~1.38x distance over straight-line polygon perimeter
  const roadNetworkFactor = activityMode === 'walk' ? 1.42 : 1.32;
  const effectiveCircumferenceKm = targetKm / roadNetworkFactor;
  const radiusKm = Math.max(0.18, effectiveCircumferenceKm / (2 * Math.PI));

  const baseBearingDeg = selectUnexploredBearingDeg(seed, exploredSectors);
  const bearingDeg = (baseBearingDeg + sectorStep * 45) % 360;
  const bearingAngle = bearingDeg * (Math.PI / 180);
  const centerLat = originLat + radiusKm * Math.cos(bearingAngle) * latPerKm;
  const centerLng = originLng + radiusKm * Math.sin(bearingAngle) * lngPerKm;

  // 4 anchors for Walk Drift (serendipitous square/pentagon), 3 for Run Flow
  const anchorFractions =
    activityMode === 'walk' ? [0.22, 0.48, 0.74, 0.9] : [0.25, 0.5, 0.75];

  return anchorFractions.map((progress, idx) => {
    const theta = bearingAngle + Math.PI + progress * 2 * Math.PI;
    const harmonic =
      activityMode === 'walk'
        ? 1 + 0.1 * Math.sin(idx * 2.1 + seed)
        : 1 + 0.04 * Math.cos(idx * 1.7 + seed);
    const r = radiusKm * harmonic;
    const lat = centerLat + r * Math.cos(theta) * latPerKm;
    const lng = centerLng + r * Math.sin(theta) * lngPerKm;
    return [Number(lat.toFixed(6)), Number(lng.toFixed(6))];
  });
}

/**
 * Generates 2 or 3 intermediate micro-POI corridor waypoints between `origin` and `destination`
 * for serendipitous Point A -> Point B discovery.
 */
function buildCorridorAnchors(
  origin,
  destination,
  activityMode,
  seed,
  corridorStyle = 'primary'
) {
  const [lat1, lng1] = origin;
  const [lat2, lng2] = destination;
  const directKm = haversineKm(origin, destination);

  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  // Perpendicular vector for gentle side-street drift
  const perpLat = -dLng;
  const perpLng = dLat;

  const baseSign = seed % 2 === 0 ? 1 : -1;
  const sideSign = corridorStyle === 'opposite' ? -baseSign : baseSign;
  const baseLateral = activityMode === 'walk' ? 0.14 : 0.07;
  const lateralScale =
    corridorStyle === 'wide'
      ? baseLateral * 1.65
      : corridorStyle === 'opposite'
      ? baseLateral * 1.15
      : baseLateral;

  if (directKm < 0.2) {
    return [
      [
        Number(((lat1 + lat2) / 2 + perpLat * lateralScale * sideSign).toFixed(6)),
        Number(((lng1 + lng2) / 2 + perpLng * lateralScale * sideSign).toFixed(6)),
      ],
    ];
  }

  const wp1 = [
    Number((lat1 + dLat * 0.28 + perpLat * lateralScale * sideSign).toFixed(6)),
    Number((lng1 + dLng * 0.28 + perpLng * lateralScale * sideSign).toFixed(6)),
  ];

  const midSign =
    corridorStyle === 'wide'
      ? sideSign
      : ((seed + 1) % 2 === 0 ? -1 : 1) * sideSign;
  const wp2 = [
    Number((lat1 + dLat * 0.55 + perpLat * (lateralScale * 0.85) * midSign).toFixed(6)),
    Number((lng1 + dLng * 0.55 + perpLng * (lateralScale * 0.85) * midSign).toFixed(6)),
  ];

  if (activityMode === 'run' || directKm < 0.9) {
    return [wp1, wp2];
  }

  const AlternatingSign = ((seed + 2) % 3 === 0 ? -1 : 1) * sideSign;
  const wp3 = [
    Number((lat1 + dLat * 0.8 + perpLat * (lateralScale * 0.85) * AlternatingSign).toFixed(6)),
    Number((lng1 + dLng * 0.8 + perpLng * (lateralScale * 0.85) * AlternatingSign).toFixed(6)),
  ];

  return [wp1, wp2, wp3];
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
 * Deterministic fallback route generator if offline or Mapbox request fails.
 */
export function generateFallbackRoute({
  origin = [48.8638, 2.3615],
  destination = null,
  routeType = 'loop',
  steps = 6000,
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
  const spec =
    ROUTE_VARIANT_SPECS[variantIndex] || ROUTE_VARIANT_SPECS[0];
  const resolvedLabel = variantLabel || spec.variantLabel;
  const resolvedBadge = variantBadge || spec.variantBadge;
  const resolvedCorridorStyle = corridorStyle || spec.corridorStyle;
  const resolvedSectorStep =
    typeof sectorStep === 'number' ? sectorStep : spec.sectorStep;

  const history =
    visitedPoiNames && exploredSectors
      ? { visitedPoiNames, visitedPoiIds: visitedPoiIds || [], exploredSectors }
      : loadDriftHistory();

  let waypoints = [];
  let distanceKm = stepsToKm(steps);

  if (routeType === 'pointToPoint' && destination) {
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
            resolvedCorridorStyle
          );
    const controlPoints = [origin, ...anchors, destination];
    // Interpolate smooth segments between control points
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
    const corridorFactor =
      resolvedCorridorStyle === 'wide'
        ? 1.44
        : resolvedCorridorStyle === 'opposite'
        ? 1.22
        : 1.3;
    distanceKm = Number(
      Math.max(0.25, haversineKm(origin, destination) * corridorFactor).toFixed(2)
    );
  } else {
    const [originLat, originLng] = origin;
    const streetFactor = activityMode === 'walk' ? 1.32 : 1.18;
    const radiusKm = Math.max(0.2, distanceKm / streetFactor / (2 * Math.PI));
    const latPerKm = 1 / 111.32;
    const lngPerKm = 1 / (111.32 * Math.cos((originLat * Math.PI) / 180));
    const baseBearingDeg = selectUnexploredBearingDeg(
      seed,
      history.exploredSectors
    );
    const bearingDeg = (baseBearingDeg + resolvedSectorStep * 45) % 360;
    const bearingAngle = bearingDeg * (Math.PI / 180);
    const centerLat = originLat + radiusKm * Math.cos(bearingAngle) * latPerKm;
    const centerLng = originLng + radiusKm * Math.sin(bearingAngle) * lngPerKm;

    const numNodes = activityMode === 'walk' ? 28 : 20;
    for (let i = 0; i <= numNodes; i++) {
      const progress = i / numNodes;
      const theta = bearingAngle + Math.PI + progress * 2 * Math.PI;
      const harmonic =
        activityMode === 'walk'
          ? 1 + 0.12 * Math.sin(progress * Math.PI * 6 + seed) * Math.sin(progress * Math.PI)
          : 1 + 0.04 * Math.cos(progress * Math.PI * 4 + seed) * Math.sin(progress * Math.PI);
      const r = radiusKm * harmonic;
      waypoints.push([
        Number((centerLat + r * Math.cos(theta) * latPerKm).toFixed(6)),
        Number((centerLng + r * Math.sin(theta) * lngPerKm).toFixed(6)),
      ]);
    }
    waypoints[0] = origin;
    waypoints[waypoints.length - 1] = origin;
  }

  const effectiveSteps = routeType === 'pointToPoint' ? kmToSteps(distanceKm) : steps;
  const paceMinPerKm = activityMode === 'walk' ? 11.5 : 5.6;
  const estimatedMinutes = Math.max(3, Math.round(distanceKm * paceMinPerKm));
  const pois =
    preloadedPOIs && preloadedPOIs.length > 0
      ? preloadedPOIs.map((poi) => ({
          ...poi,
          detourMeters: calculateDetourMeters(poi.coords, waypoints),
        }))
      : getPOIsForRoute(waypoints, activityMode, seed, {
          stopVibe,
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
    distanceKm,
    estimatedMinutes,
    activityMode,
    stopVibe,
    planMode,
    isStreetSnapped: false,
    metrics: {
      lowTrafficPct: quietScore,
      elevationGainMeters: Math.max(4, Math.round(distanceKm * (activityMode === 'run' ? 2.2 : 4.5))),
      trafficLightsAvoided: Math.max(2, Math.round(distanceKm * (activityMode === 'run' ? 3.4 : 2.1))),
      serendipityScore: activityMode === 'walk' ? 96 : 84,
    },
    pois,
  };
}

/**
 * Asynchronous street-accurate urban route generator powered by Mapbox Search Box + Walking Directions APIs.
 * 1. Discovers real-world micro-POIs along the target loop or Point A -> B corridor first.
 * 2. Filters out previously visited POIs & explored sectors so every Spin yields fresh discoveries.
 * 3. Snaps the pedestrian route through those real POI coordinates so the dotted path passes right in front of them.
 */
export async function generateUrbanRoute({
  origin = [48.8638, 2.3615],
  destination = null,
  routeType = 'loop', // 'loop' | 'pointToPoint'
  steps = 6000,
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
  signal,
}) {
  const spec =
    ROUTE_VARIANT_SPECS[variantIndex] || ROUTE_VARIANT_SPECS[0];
  const resolvedLabel = variantLabel || spec.variantLabel;
  const resolvedBadge = variantBadge || spec.variantBadge;
  const resolvedCorridorStyle = corridorStyle || spec.corridorStyle;
  const resolvedSectorStep =
    typeof sectorStep === 'number' ? sectorStep : spec.sectorStep;

  const history =
    visitedPoiNames && exploredSectors
      ? { visitedPoiNames, visitedPoiIds: visitedPoiIds || [], exploredSectors }
      : loadDriftHistory();

  if (!MAPBOX_TOKEN) {
    return generateFallbackRoute({
      origin,
      destination,
      routeType,
      steps,
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
    let targetAnchors = [];

    if (routeType === 'pointToPoint' && destination) {
      targetAnchors = buildCorridorAnchors(
        origin,
        destination,
        activityMode,
        seed,
        resolvedCorridorStyle
      );
    } else {
      const targetKm = stepsToKm(steps);
      targetAnchors = buildLoopAnchors(
        origin,
        targetKm,
        activityMode,
        seed,
        history.exploredSectors,
        resolvedSectorStep
      );
    }

    // Step 1: Discover real neighborhood POIs around the target anchors/corridor
    discoveredPOIs = await fetchRealPOIsAlongRoute(
      targetAnchors,
      activityMode,
      MAPBOX_TOKEN,
      {
        seed,
        stopVibe,
        signal,
        visitedPoiNames: history.visitedPoiNames,
        visitedPoiIds: history.visitedPoiIds,
      }
    );

    // Step 2: Build the Mapbox Walking Directions waypoint sequence passing directly by the real POIs
    let routeNodes = [];
    if (routeType === 'pointToPoint' && destination) {
      const orderedPOIs =
        discoveredPOIs.length > 0
          ? sortPOIsAlongCorridor(discoveredPOIs, origin, destination)
          : [];
      const waypointCoords =
        orderedPOIs.length > 0
          ? orderedPOIs.map((poi) => poi.coords)
          : targetAnchors;
      routeNodes = [origin, ...waypointCoords, destination];
      discoveredPOIs = orderedPOIs.length > 0 ? orderedPOIs : discoveredPOIs;
    } else {
      const waypointCoords =
        discoveredPOIs.length > 0
          ? discoveredPOIs.map((poi) => poi.coords)
          : targetAnchors;
      routeNodes = [origin, ...waypointCoords, origin];
    }

    // Mapbox Directions API expects `lng,lat;lng,lat;...`
    const coordsQuery = routeNodes
      .map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`)
      .join(';');

    const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coordsQuery}?geometries=geojson&overview=full&steps=false&access_token=${MAPBOX_TOKEN}`;

    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`Mapbox Directions HTTP ${response.status}`);
    }

    const data = await response.json();
    const primaryRoute = data?.routes?.[0];
    const geoCoords = primaryRoute?.geometry?.coordinates;

    if (!geoCoords || geoCoords.length < 2) {
      throw new Error('No street geometry returned from Mapbox Directions');
    }

    // Convert GeoJSON [lng, lat] to Leaflet [lat, lng]
    const waypoints = geoCoords.map(([lng, lat]) => [
      Number(lat.toFixed(6)),
      Number(lng.toFixed(6)),
    ]);

    const realDistanceKm = Number((primaryRoute.distance / 1000).toFixed(2));
    const calculatedSteps = kmToSteps(realDistanceKm);

    // Mapbox walking duration (seconds) adjusted if user selected Run Flow
    const walkingMinutes = primaryRoute.duration / 60;
    const estimatedMinutes = Math.max(
      2,
      Math.round(activityMode === 'run' ? walkingMinutes * 0.52 : walkingMinutes)
    );

    // Recalculate exact detour distance from the street-snapped polyline to each real POI
    const pois = (
      discoveredPOIs.length > 0
        ? discoveredPOIs
        : getPOIsForRoute(waypoints, activityMode, seed, {
            stopVibe,
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
      distanceKm: realDistanceKm,
      estimatedMinutes,
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
 * Synchronously generates 3 distinct fallback route candidates (Curated Drift, Quiet Alleys, Scenic Arc)
 * for immediate initial render or offline mode.
 */
export function generateFallbackRouteAlternatives(params = {}) {
  const {
    origin = [48.8638, 2.3615],
    destination = null,
    routeType = 'loop',
    steps = 6000,
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
    const variantSteps =
      routeType === 'loop'
        ? Math.max(1500, Math.round((steps * spec.distanceScale) / 100) * 100)
        : steps;
    const variantSeed = seed + spec.seedStep;

    const candidate = generateFallbackRoute({
      origin,
      destination,
      routeType,
      steps: variantSteps,
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
 * Generates 3 distinct urban route candidates simultaneously in parallel (`Promise.all`):
 * - Route 1 ("Curated Drift" — Primary): Balanced target loop or corridor
 * - Route 2 ("Quiet Alleys" — 98% Calm): Shifted compass sector / opposite side-street corridor
 * - Route 3 ("Scenic Arc" — Deep Explorer): Wider exploration arc (~20% longer) with fresh POIs
 */
export async function generateRouteAlternatives(params = {}) {
  const {
    origin = [48.8638, 2.3615],
    destination = null,
    routeType = 'loop',
    steps = 6000,
    activityMode = 'walk',
    stopVibe = 'all',
    planMode = 'instant',
    seed = 1,
    visitedPoiNames = null,
    visitedPoiIds = null,
    exploredSectors = null,
    signal,
  } = params;

  const history =
    visitedPoiNames && exploredSectors
      ? { visitedPoiNames, visitedPoiIds: visitedPoiIds || [], exploredSectors }
      : loadDriftHistory();

  if (!MAPBOX_TOKEN) {
    return generateFallbackRouteAlternatives({
      ...params,
      visitedPoiNames: history.visitedPoiNames,
      visitedPoiIds: history.visitedPoiIds,
      exploredSectors: history.exploredSectors,
    });
  }

  const results = await Promise.all(
    ROUTE_VARIANT_SPECS.map((spec) => {
      const variantSteps =
        routeType === 'loop'
          ? Math.max(1500, Math.round((steps * spec.distanceScale) / 100) * 100)
          : steps;
      const variantSeed = seed + spec.seedStep;

      return generateUrbanRoute({
        origin,
        destination,
        routeType,
        steps: variantSteps,
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

// src/components/MapView.jsx
import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import L from 'leaflet';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  CircleMarker,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { Maximize2, LocateFixed, Plus, Minus } from 'lucide-react';

const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN || '').trim();

// Upgraded editorial Mapbox styles reveal parks, water bodies, pedestrian plazas, and building footprints
const MAPBOX_PAPER_TILES = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`;
const MAPBOX_DARK_TILES = `https://api.mapbox.com/styles/v1/mapbox/navigation-night-v1/tiles/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`;

// Fallback public tiles if VITE_MAPBOX_TOKEN is not configured
const FALLBACK_PAPER_TILES =
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const FALLBACK_DARK_TILES =
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

const MAPBOX_ATTRIBUTION =
  '&copy; <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noreferrer">Mapbox</a> &middot; &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

/**
 * Escapes HTML entities for safe insertion into Leaflet divIcon templates.
 */
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Builds a high-contrast editorial typography badge for Start ('A') and Destination ('B') pins.
 */
function createTerminalBadgeIcon({
  letter = 'A',
  subtitle = '',
  isDark = false,
  isDestination = false,
}) {
  const bg = isDestination
    ? isDark
      ? '#F4F1EA'
      : '#1C1C1E'
    : '#FF6B4A';
  const fg = isDestination
    ? isDark
      ? '#18181B'
      : '#F4F1EA'
    : '#FAF8F5';
  const ringBorder = isDark ? '#18181B' : '#FAF8F5';
  const outerRing = isDestination
    ? 'rgba(217, 119, 6, 0.28)'
    : 'rgba(255, 107, 74, 0.28)';

  const pillBg = isDark ? 'rgba(24, 24, 27, 0.92)' : 'rgba(244, 241, 234, 0.94)';
  const pillText = isDark ? '#F4F1EA' : '#1C1C1E';
  const pillBorder = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(28,28,30,0.16)';

  const html = `
    <div style="position:relative;display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);">
      ${
        subtitle
          ? `<div style="position:absolute;bottom:22px;white-space:nowrap;padding:2px 7px;border-radius:9999px;font-family:'Plus Jakarta Sans',sans-serif;font-size:9px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;background:${pillBg};color:${pillText};border:1px solid ${pillBorder};box-shadow:0 4px 12px rgba(0,0,0,0.15);">
              ${escapeHtml(subtitle)}
            </div>`
          : ''
      }
      <div style="width:32px;height:32px;border-radius:9999px;background:${outerRing};display:flex;align-items:center;justify-content:center;">
        <div style="width:24px;height:24px;border-radius:9999px;background:${bg};color:${fg};border:2.5px solid ${ringBorder};box-shadow:0 4px 12px rgba(28,28,30,0.32);display:flex;align-items:center;justify-content:center;font-family:'Fraunces',Georgia,serif;font-weight:700;font-size:12px;line-height:1;">
          ${escapeHtml(letter)}
        </div>
      </div>
    </div>
  `;

  return L.divIcon({
    className: 'stray-editorial-marker',
    html,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -18],
  });
}

/**
 * Builds an editorial numbered POI marker ('1', '2', '3', '4') with category color,
 * active ring highlight, and a floating label pill showing the venue name when selected.
 */
function createNumberedPOIIcon({
  number = 1,
  poi,
  isDark = false,
  isSelected = false,
  isNextStop = false,
  isVisited = false,
}) {
  const isActive = isSelected || isNextStop;
  const badgeColor = isVisited ? '#10B981' : poi?.color || '#FF6B4A';
  const innerBorder = isActive
    ? '#FAF8F5'
    : isDark
    ? '#18181B'
    : '#FAF8F5';
  const size = isActive ? 30 : 25;
  const fontSize = isActive ? 13 : 11.5;

  const pillBg = isDark ? 'rgba(24, 24, 27, 0.95)' : 'rgba(244, 241, 234, 0.96)';
  const pillText = isDark ? '#F4F1EA' : '#1C1C1E';
  const pillBorder = isActive
    ? '#FF6B4A'
    : isDark
    ? 'rgba(255,255,255,0.18)'
    : 'rgba(28,28,30,0.16)';

  const html = `
    <div style="position:relative;display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);">
      ${
        isActive && poi?.name
          ? `<div style="position:absolute;bottom:${size / 2 + 8}px;white-space:nowrap;max-width:190px;overflow:hidden;text-overflow:ellipsis;padding:3px 9px;border-radius:9999px;background:${pillBg};color:${pillText};border:1.5px solid ${pillBorder};box-shadow:0 6px 18px rgba(28,28,30,0.22);display:flex;align-items:center;gap:4px;font-family:'Fraunces',Georgia,serif;font-size:11px;font-weight:700;z-index:30;">
              <span>${escapeHtml(poi.icon || '')}</span>
              <span style="overflow:hidden;text-overflow:ellipsis;">${escapeHtml(poi.name)}</span>
            </div>`
          : ''
      }
      <div style="position:relative;display:flex;align-items:center;justify-content:center;width:${
        isActive ? 42 : 31
      }px;height:${isActive ? 42 : 31}px;border-radius:9999px;background:${
    isActive ? `${badgeColor}33` : 'transparent'
  };border:${isActive ? `2px solid ${badgeColor}` : 'none'};transition:all 0.2s ease;">
        <div style="width:${size}px;height:${size}px;border-radius:9999px;background:${badgeColor};color:#FAF8F5;border:2.5px solid ${innerBorder};box-shadow:0 4px 14px rgba(28,28,30,0.28);display:flex;align-items:center;justify-content:center;font-family:'Fraunces',Georgia,serif;font-weight:700;font-size:${fontSize}px;line-height:1;">
          ${isVisited ? '✓' : number}
        </div>
      </div>
    </div>
  `;

  return L.divIcon({
    className: 'stray-editorial-marker',
    html,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -20],
  });
}

/**
 * Builds a compact floating midpoint callout pill for an unselected alternative route
 * (e.g. "28 min • 2.3 km") so tapping the pill on the map immediately selects that route.
 */
function createAlternativeCalloutIcon({ altRoute, isDark = false }) {
  const mins = altRoute?.estimatedMinutes || 30;
  const km = altRoute?.distanceKm || 3.5;
  const label = altRoute?.variantLabel || 'Alt Route';

  const bg = isDark ? 'rgba(24, 24, 27, 0.92)' : 'rgba(244, 241, 234, 0.94)';
  const text = isDark ? '#D4D4D8' : '#3F3F46';
  const accent = isDark ? '#F4F1EA' : '#1C1C1E';
  const border = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(28,28,30,0.18)';

  const html = `
    <div style="transform:translate(-50%,-50%);cursor:pointer;white-space:nowrap;padding:3px 9px;border-radius:9999px;background:${bg};color:${text};border:1px solid ${border};box-shadow:0 4px 14px rgba(0,0,0,0.16);backdrop-filter:blur(8px);display:inline-flex;align-items:center;gap:5px;font-family:'Plus Jakarta Sans',sans-serif;font-size:10px;font-weight:700;transition:transform 0.15s ease;">
      <span style="font-family:'Fraunces',Georgia,serif;color:${accent};font-weight:700;">${escapeHtml(
        String(mins)
      )} min</span>
      <span style="opacity:0.45;">•</span>
      <span>${escapeHtml(String(km))} km</span>
      <span style="font-size:9px;opacity:0.7;padding-left:2px;border-left:1px solid ${border};">${escapeHtml(
        label
      )}</span>
    </div>
  `;

  return L.divIcon({
    className: 'stray-editorial-marker',
    html,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function getRouteCalloutCoord(waypoints = [], variantIndex = 1) {
  if (!waypoints || waypoints.length === 0) return null;
  const frac = variantIndex === 1 ? 0.44 : variantIndex === 2 ? 0.56 : 0.5;
  const idx = Math.min(
    waypoints.length - 1,
    Math.max(0, Math.floor(waypoints.length * frac))
  );
  return waypoints[idx];
}

/**
 * Computes responsive Leaflet `fitBounds` padding options so all route alternatives
 * and numbered POI markers frame cleanly in the unobstructed map canvas beside the
 * desktop left-docked panel or above the mobile floating bottom bar/sheet.
 */
export function getRouteFitPadding(
  isDriftActive = false,
  isPanelExpanded = true
) {
  const width = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const height = typeof window !== 'undefined' ? window.innerHeight : 768;

  if (isDriftActive) {
    return {
      paddingTopLeft: [48, 88],
      paddingBottomRight: [48, Math.min(240, Math.round(height * 0.28))],
      maxZoom: 16,
      animate: true,
      duration: 0.65,
    };
  }

  // Desktop (>= 768px): asymmetric left padding for the left-docked ControlPanel (w-[410px] + left-6)
  if (width >= 768) {
    return {
      paddingTopLeft: [450, 84],
      paddingBottomRight: [56, 56],
      maxZoom: 16,
      animate: true,
      duration: 0.65,
    };
  }

  // Mobile (< 768px): minimal bottom padding (190px) when collapsed, 380px when expanded
  const mobileBottomPadding = isPanelExpanded
    ? Math.min(380, Math.max(190, height - 180))
    : Math.min(190, Math.max(120, height - 180));

  return {
    paddingTopLeft: [32, 80],
    paddingBottomRight: [32, mobileBottomPadding],
    maxZoom: 16,
    animate: true,
    duration: 0.65,
  };
}

function isValidLatLng(coord) {
  return (
    Array.isArray(coord) &&
    coord.length >= 2 &&
    Number.isFinite(coord[0]) &&
    Number.isFinite(coord[1])
  );
}

/**
 * Collects coordinates across all visible route alternatives (all 3 petals when browsing,
 * or the active route when drifting), plus numbered POI markers and start/finish anchors,
 * so Leaflet `fitBounds` frames every route petal without requiring manual panning.
 */
function getRouteBoundsPoints({
  activeRoute,
  routes = [],
  origin,
  destination,
  routeType,
  isDrifting = false,
}) {
  const points = [];

  const routesToFrame =
    !isDrifting && Array.isArray(routes) && routes.length > 0
      ? routes
      : activeRoute
      ? [activeRoute]
      : [];

  for (const r of routesToFrame) {
    if (Array.isArray(r?.waypoints)) {
      for (const wp of r.waypoints) {
        if (isValidLatLng(wp)) points.push(wp);
      }
    }
  }

  if (Array.isArray(activeRoute?.pois)) {
    for (const poi of activeRoute.pois) {
      if (isValidLatLng(poi?.coords)) points.push(poi.coords);
    }
  }

  if (isValidLatLng(origin)) {
    points.push(origin);
  }

  if (routeType === 'pointToPoint' && isValidLatLng(destination)) {
    points.push(destination);
  }

  return points;
}

function MapViewportUpdater({
  origin,
  destination,
  routeType,
  activeRoute,
  candidateRoutes,
  selectedPOI,
  markerRefs,
  isDrifting,
  isPanelExpanded,
  livePosition,
  mapInstanceRef,
}) {
  const map = useMap();

  useEffect(() => {
    if (mapInstanceRef) {
      mapInstanceRef.current = map;
    }
  }, [map, mapInstanceRef]);

  // Ensure Leaflet recalculates container dimensions on mount and viewport resize
  useEffect(() => {
    const handleResize = () => {
      map.invalidateSize({ animate: false });
    };

    const initTimer = setTimeout(handleResize, 60);
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(initTimer);
      window.removeEventListener('resize', handleResize);
    };
  }, [map]);

  // Fit bounds with responsive asymmetric padding so all 3 route petals & POIs sit cleanly in the unobstructed map canvas
  useEffect(() => {
    if (selectedPOI?.coords || isDrifting) return;
    map.invalidateSize({ animate: false });

    const fitOptions = getRouteFitPadding(isDrifting, isPanelExpanded);
    const boundsPoints = getRouteBoundsPoints({
      activeRoute,
      routes: candidateRoutes,
      origin,
      destination,
      routeType,
      isDrifting,
    });

    if (boundsPoints.length > 1) {
      map.fitBounds(L.latLngBounds(boundsPoints), fitOptions);
    } else if (routeType === 'pointToPoint' && isValidLatLng(origin) && isValidLatLng(destination)) {
      map.fitBounds(L.latLngBounds([origin, destination]), fitOptions);
    } else if (isValidLatLng(origin)) {
      map.setView(origin, 15);
    }
  }, [
    map,
    origin,
    destination,
    routeType,
    activeRoute,
    candidateRoutes,
    selectedPOI,
    isDrifting,
    isPanelExpanded,
  ]);

  // Follow live user GPS beacon during Active Drift
  useEffect(() => {
    if (!isDrifting || !livePosition || selectedPOI?.coords) return;
    const [lat, lng] = livePosition;
    // Frame the user beacon slightly above the floating ActiveDriftHUD
    map.panTo([lat - 0.0014, lng], { animate: true, duration: 0.45 });
  }, [map, isDrifting, livePosition, selectedPOI]);

  // Smooth flyTo + automatic Leaflet Popup opening when a POI card or marker is selected
  useEffect(() => {
    if (!selectedPOI?.coords) return;

    const [lat, lng] = selectedPOI.coords;
    // Offset slightly south at zoom 16 so the POI marker & popup sit in the upper visible area above the floating sheet
    const visualTarget = [lat - 0.0022, lng];
    map.flyTo(visualTarget, 16, { duration: 0.7 });

    const marker = markerRefs?.current?.[selectedPOI.id];
    if (marker && typeof marker.openPopup === 'function') {
      const timer = setTimeout(() => {
        marker.openPopup();
      }, 220);
      return () => clearTimeout(timer);
    }
  }, [map, selectedPOI, markerRefs]);

  return null;
}

function MapDestinationClickHandler({ routeType, onMapSetDestination }) {
  useMapEvents({
    click(e) {
      if (routeType === 'pointToPoint' && onMapSetDestination) {
        const coords = [
          Number(e.latlng.lat.toFixed(6)),
          Number(e.latlng.lng.toFixed(6)),
        ];
        onMapSetDestination(coords);
      }
    },
  });
  return null;
}

export default function MapView({
  theme = 'paper',
  routeType = 'loop',
  origin,
  destination,
  route,
  routes = [],
  selectedRouteId = null,
  onSelectRoute,
  selectedPOI,
  onSelectPOI,
  onMapSetDestination,
  isDrifting = false,
  isPanelExpanded = true,
  livePosition = null,
  nextStop = null,
  visitedStopIds = [],
}) {
  const markerRefs = useRef({});
  const mapInstanceRef = useRef(null);
  const isDark = theme === 'dark';
  const hasMapbox = Boolean(MAPBOX_TOKEN);

  const candidateRoutes = useMemo(
    () =>
      Array.isArray(routes) && routes.length > 0
        ? routes
        : route
        ? [route]
        : [],
    [routes, route]
  );
  const activeRouteId = selectedRouteId || route?.id;
  const activeRoute =
    route ||
    candidateRoutes.find((r) => r && r.id === activeRouteId) ||
    candidateRoutes[0] ||
    null;
  const secondaryRoutes = isDrifting
    ? []
    : candidateRoutes.filter((r) => r && r.id !== activeRouteId);

  const tileUrl = hasMapbox
    ? isDark
      ? MAPBOX_DARK_TILES
      : MAPBOX_PAPER_TILES
    : isDark
    ? FALLBACK_DARK_TILES
    : FALLBACK_PAPER_TILES;

  const loopColor =
    activeRoute?.activityMode === 'run'
      ? isDark
        ? '#34D399'
        : '#059669'
      : '#FF6B4A';

  const handleFitRoute = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (onSelectPOI) onSelectPOI(null);
    map.closePopup();
    map.invalidateSize({ animate: false });

    const fitOptions = getRouteFitPadding(isDrifting, isPanelExpanded);
    const boundsPoints = getRouteBoundsPoints({
      activeRoute,
      routes: candidateRoutes,
      origin,
      destination,
      routeType,
      isDrifting,
    });

    if (boundsPoints.length > 1) {
      map.fitBounds(L.latLngBounds(boundsPoints), fitOptions);
    } else if (
      routeType === 'pointToPoint' &&
      isValidLatLng(origin) &&
      isValidLatLng(destination)
    ) {
      map.fitBounds(L.latLngBounds([origin, destination]), fitOptions);
    } else if (isValidLatLng(origin)) {
      map.flyTo(origin, 15, { duration: 0.65 });
    }
  }, [
    activeRoute,
    candidateRoutes,
    isDrifting,
    isPanelExpanded,
    routeType,
    origin,
    destination,
    onSelectPOI,
  ]);

  const handleCenterOnMe = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const target = isDrifting && livePosition ? livePosition : origin;
    if (!target) return;
    const [lat, lng] = target;
    map.flyTo([lat - 0.0016, lng], 16, { duration: 0.65 });
  }, [isDrifting, livePosition, origin]);

  const handleZoomIn = useCallback(() => {
    const map = mapInstanceRef.current;
    if (map) map.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    const map = mapInstanceRef.current;
    if (map) map.zoomOut();
  }, []);

  const startBadgeIcon = createTerminalBadgeIcon({
    letter: 'A',
    subtitle: routeType === 'pointToPoint' ? 'Start' : 'Loop Start',
    isDark,
    isDestination: false,
  });

  const destinationBadgeIcon = createTerminalBadgeIcon({
    letter: 'B',
    subtitle: 'Finish',
    isDark,
    isDestination: true,
  });

  return (
    <div
      className={`absolute inset-0 w-full h-full z-0 transition-colors duration-300 ${
        isDark ? 'bg-[#18181B] map-tiles-dark' : 'bg-[#F4F1EA] map-tiles-paper'
      } ${routeType === 'pointToPoint' && !isDrifting ? 'cursor-crosshair' : ''}`}
    >
      <MapContainer
        center={origin}
        zoom={15}
        zoomControl={false}
        className="w-full h-full z-0"
      >
        <TileLayer
          key={`${theme}-${hasMapbox ? 'mapbox-v12' : 'fallback'}`}
          url={tileUrl}
          attribution={MAPBOX_ATTRIBUTION}
          tileSize={hasMapbox ? 512 : 256}
          zoomOffset={hasMapbox ? -1 : 0}
          maxZoom={20}
        />

        <MapViewportUpdater
          origin={origin}
          destination={destination}
          routeType={routeType}
          activeRoute={activeRoute}
          candidateRoutes={candidateRoutes}
          selectedPOI={selectedPOI}
          markerRefs={markerRefs}
          isDrifting={isDrifting}
          isPanelExpanded={isPanelExpanded}
          livePosition={livePosition}
          mapInstanceRef={mapInstanceRef}
        />

        {!isDrifting && (
          <MapDestinationClickHandler
            routeType={routeType}
            onMapSetDestination={onMapSetDestination}
          />
        )}

        {/* Secondary Alternative Routes (Muted Interactive Paths + Midpoint Duration/Distance Pills) */}
        {secondaryRoutes.map((altRoute) => {
          if (!altRoute?.waypoints || altRoute.waypoints.length < 2) return null;
          const calloutCoord = getRouteCalloutCoord(
            altRoute.waypoints,
            altRoute.variantIndex
          );
          const calloutIcon = createAlternativeCalloutIcon({
            altRoute,
            isDark,
          });

          const handleSelectAlt = (e) => {
            if (e?.originalEvent) {
              L.DomEvent.stopPropagation(e.originalEvent);
            }
            if (onSelectRoute) {
              onSelectRoute(altRoute.id);
            }
          };

          return (
            <React.Fragment key={altRoute.id}>
              {/* Visible Muted Alternative Track */}
              <Polyline
                positions={altRoute.waypoints}
                interactive={false}
                pathOptions={{
                  color: isDark ? '#71717A' : '#8E8E93',
                  weight: 4,
                  opacity: isDark ? 0.5 : 0.45,
                  dashArray: '4, 6',
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />

              {/* Wide Invisible Hit-Target Polyline for Effortless Tap/Click Selection */}
              <Polyline
                positions={altRoute.waypoints}
                pathOptions={{
                  color: '#000000',
                  weight: 16,
                  opacity: 0,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
                eventHandlers={{
                  click: handleSelectAlt,
                }}
              />

              {/* Midpoint Floating Duration & Distance Callout Pill */}
              {calloutCoord && (
                <Marker
                  position={calloutCoord}
                  icon={calloutIcon}
                  zIndexOffset={120}
                  eventHandlers={{
                    click: handleSelectAlt,
                  }}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* Layer 1: Soft Translucent Underglow / Halo along the Active Street Route */}
        {route?.waypoints && (
          <Polyline
            positions={route.waypoints}
            pathOptions={{
              color: loopColor,
              weight: 10,
              opacity: 0.22,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )}

        {/* Layer 2: Crisp Dashed Primary Editorial Route Stroke */}
        {route?.waypoints && (
          <Polyline
            positions={route.waypoints}
            pathOptions={{
              color: loopColor,
              weight: 4,
              opacity: 0.98,
              dashArray: '6, 8',
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )}

        {/* Point A — High-Contrast Editorial Start Pin ('A') */}
        {origin && (
          <Marker position={origin} icon={startBadgeIcon} zIndexOffset={200}>
            <Popup>
              <div className="text-xs min-w-[140px]">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#FF6B4A]">
                  Point A • Origin
                </div>
                <div className="font-editorial font-bold text-sm mt-0.5">
                  {routeType === 'pointToPoint'
                    ? 'Departure Point'
                    : 'Start & Finish Anchor'}
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Point B — High-Contrast Editorial Destination Pin ('B') */}
        {routeType === 'pointToPoint' && destination && (
          <Marker
            position={destination}
            icon={destinationBadgeIcon}
            zIndexOffset={220}
          >
            <Popup>
              <div className="text-xs min-w-[155px]">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#D97706]">
                  Point B • Destination
                </div>
                <div className="font-editorial font-bold text-sm mt-0.5">
                  🏁 Arrival Pin
                </div>
                <div className="text-[11px] opacity-75 mt-0.5">
                  Tap anywhere on the map to relocate
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Real-World Curated Micro-POI Numbered Editorial Badges ('1', '2', '3', '4') */}
        {route?.pois?.map((poi, idx) => {
          const isSelected = selectedPOI?.id === poi.id;
          const isNextStop = isDrifting && nextStop?.id === poi.id;
          const isVisited = isDrifting && visitedStopIds.includes(poi.id);
          const number = idx + 1;

          const badgeIcon = createNumberedPOIIcon({
            number,
            poi,
            isDark,
            isSelected,
            isNextStop,
            isVisited,
          });

          return (
            <Marker
              key={poi.id}
              ref={(el) => {
                if (el) {
                  markerRefs.current[poi.id] = el;
                }
              }}
              position={poi.coords}
              icon={badgeIcon}
              zIndexOffset={isSelected || isNextStop ? 500 : 300 + idx}
              eventHandlers={{
                click: () => onSelectPOI && onSelectPOI(poi),
              }}
            >
              <Popup>
                <div className="text-xs min-w-[190px] max-w-[235px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF6B4A]">
                      Stop 0{number} • {poi.category}
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#FF6B4A]/15 text-[#FF6B4A]">
                      {poi.vibeScore}% Vibe
                    </span>
                  </div>
                  <div className="font-editorial font-bold text-sm mt-1">
                    {poi.icon} {poi.name}
                    {isVisited ? ' ✓' : ''}
                  </div>
                  {poi.address && (
                    <div className="text-[11px] font-medium opacity-80 mt-0.5">
                      📍 {poi.address}
                    </div>
                  )}
                  {poi.note && (
                    <div className="text-[11px] italic opacity-75 mt-1.5 border-t border-current/10 pt-1.5">
                      “{poi.note}”
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Live Pulsing User GPS Beacon (during Active Drift mode) */}
        {isDrifting && livePosition && (
          <>
            <CircleMarker
              center={livePosition}
              radius={18}
              pathOptions={{
                color: loopColor,
                weight: 1.5,
                fillColor: loopColor,
                fillOpacity: 0.22,
              }}
            />
            <CircleMarker
              center={livePosition}
              radius={7.5}
              pathOptions={{
                color: '#FAF8F5',
                weight: 3,
                fillColor: '#1C1C1E',
                fillOpacity: 1,
              }}
            >
              <Popup>
                <div className="text-xs font-bold">
                  🧭 Live Position • Active Drift
                </div>
              </Popup>
            </CircleMarker>
          </>
        )}
      </MapContainer>

      {/* Tactile Editorial Edge Vignette Overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[5]"
        style={{
          background: isDark
            ? 'radial-gradient(circle at 50% 42%, rgba(24, 24, 27, 0) 56%, rgba(24, 24, 27, 0.52) 100%)'
            : 'radial-gradient(circle at 50% 42%, rgba(244, 241, 234, 0) 58%, rgba(28, 28, 30, 0.14) 100%)',
        }}
      />

      {/* Minimalist Floating Map Utility Controls (Top-Right Editorial Pill) */}
      <aside
        aria-label="Map Viewport Controls"
        className={`pointer-events-auto absolute top-16 right-4 md:right-6 z-10 flex flex-col items-center rounded-full border backdrop-blur-md overflow-hidden transition-colors ${
          isDark
            ? 'bg-[#18181B]/90 border-white/15 text-[#F4F1EA] shadow-lg shadow-black/40'
            : 'bg-[#FAF8F5]/95 border-[#1C1C1E]/15 text-[#1C1C1E] shadow-[0_6px_24px_rgba(28,28,30,0.1)]'
        }`}
      >
        <button
          type="button"
          onClick={handleFitRoute}
          title="Fit entire route in view"
          aria-label="Fit entire route in view"
          className={`p-2.5 transition active:scale-95 hover:text-[#FF6B4A] border-b ${
            isDark ? 'border-white/10' : 'border-[#1C1C1E]/10'
          }`}
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={handleCenterOnMe}
          title="Center on my location"
          aria-label="Center on my location"
          className={`p-2.5 transition active:scale-95 hover:text-[#FF6B4A] border-b ${
            isDark ? 'border-white/10' : 'border-[#1C1C1E]/10'
          }`}
        >
          <LocateFixed className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={handleZoomIn}
          title="Zoom in"
          aria-label="Zoom in"
          className={`p-2.5 transition active:scale-95 hover:text-[#FF6B4A] border-b ${
            isDark ? 'border-white/10' : 'border-[#1C1C1E]/10'
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={handleZoomOut}
          title="Zoom out"
          aria-label="Zoom out"
          className="p-2.5 transition active:scale-95 hover:text-[#FF6B4A]"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
      </aside>
    </div>
  );
}

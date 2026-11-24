// src/utils/pois.js

export const STOP_VIBE_MODES = [
  {
    id: 'all',
    label: 'All Gems',
    shortDesc: 'Balanced mix of cafés, culture & niche tables',
  },
  {
    id: 'eats',
    label: 'Niche Eats',
    shortDesc: 'Hidden bistros, wine bars & artisanal kitchens',
  },
  {
    id: 'culture',
    label: 'Coffee & Culture',
    shortDesc: 'Specialty roasters, indie books, galleries & parks',
  },
];

export const POI_CATEGORIES = {
  walk: [
    // Niche Culinary & Artisanal Dining Gems ('eats')
    {
      mapboxCategory: 'bistro',
      forwardQuery: 'bistro bistrot cave a manger table de quartier',
      type: 'bistro',
      vibeGroup: 'eats',
      label: 'Hidden Bistro',
      icon: '🍽️',
      color: '#E0533C',
    },
    {
      mapboxCategory: 'wine_bar',
      forwardQuery: 'wine bar bar a vin cave a manger natural wine',
      type: 'wine_bar',
      vibeGroup: 'eats',
      label: 'Natural Wine & Bites',
      icon: '🍷',
      color: '#C2410C',
    },
    {
      mapboxCategory: 'restaurant',
      forwardQuery: 'independent restaurant bistrot cuisine de saison local table',
      type: 'restaurant',
      vibeGroup: 'eats',
      label: 'Local Table',
      icon: '🥘',
      color: '#FF6B4A',
    },
    {
      mapboxCategory: 'tapas',
      forwardQuery: 'tapas cantina cantine small plates assiettes a partager',
      type: 'cantina',
      vibeGroup: 'eats',
      label: 'Neighborhood Cantina',
      icon: '🫒',
      color: '#D97706',
    },
    {
      mapboxCategory: 'ramen',
      forwardQuery: 'ramen noodle bar izakaya cantine japonaise',
      type: 'artisanal_kitchen',
      vibeGroup: 'eats',
      label: 'Artisanal Kitchen',
      icon: '🍜',
      color: '#EA580C',
    },
    {
      mapboxCategory: 'creperie',
      forwardQuery: 'creperie galette artisanale cidrerie',
      type: 'creperie',
      vibeGroup: 'eats',
      label: 'Hidden Bistro',
      icon: '🥞',
      color: '#D97706',
    },
    {
      mapboxCategory: 'organic_food',
      forwardQuery: 'organic restaurant cantine bio cuisine locale fermiere',
      type: 'organic_kitchen',
      vibeGroup: 'eats',
      label: 'Artisanal Kitchen',
      icon: '🥗',
      color: '#B45309',
    },
    {
      mapboxCategory: 'deli',
      forwardQuery: 'deli epicerie fine traiteur comptoir artisanal',
      type: 'deli',
      vibeGroup: 'eats',
      label: 'Artisanal Kitchen',
      icon: '🧀',
      color: '#D97706',
    },
    {
      mapboxCategory: 'bakery',
      forwardQuery: 'bakery boulangerie levain patisserie artisanale',
      type: 'bakery',
      vibeGroup: 'eats',
      label: 'Artisanal Bakery',
      icon: '🥐',
      color: '#F59E0B',
    },
    // Coffee & Cultural Gems ('culture')
    {
      mapboxCategory: 'coffee',
      forwardQuery: 'specialty coffee cafe espresso roaster torrefacteur',
      type: 'coffee',
      vibeGroup: 'culture',
      label: 'Specialty Coffee',
      icon: '☕',
      color: '#EC4899',
    },
    {
      mapboxCategory: 'book_store',
      forwardQuery: 'bookstore librairie independent books',
      type: 'bookstore',
      vibeGroup: 'culture',
      label: 'Indie Bookstore',
      icon: '📚',
      color: '#FF6B4A',
    },
    {
      mapboxCategory: 'art_gallery',
      forwardQuery: 'art gallery galerie exposition',
      type: 'gallery',
      vibeGroup: 'culture',
      label: 'Art Gallery',
      icon: '🎨',
      color: '#A855F7',
    },
    {
      mapboxCategory: 'park',
      forwardQuery: 'park square garden jardin',
      type: 'park',
      vibeGroup: 'culture',
      label: 'Pocket Park',
      icon: '🌿',
      color: '#10B981',
    },
  ],
  run: [
    {
      mapboxCategory: 'park',
      forwardQuery: 'park parc greenway promenade',
      type: 'park',
      label: 'Green Corridor',
      icon: '🌲',
      color: '#10B981',
    },
    {
      mapboxCategory: 'fountain',
      forwardQuery: 'fountain drinking water fontaine',
      type: 'water',
      label: 'Fountain / Hydration',
      icon: '💧',
      color: '#38BDF8',
    },
    {
      mapboxCategory: 'viewpoint',
      forwardQuery: 'viewpoint belvedere overlook bridge',
      type: 'viewpoint',
      label: 'Scenic Viewpoint',
      icon: '🌅',
      color: '#F59E0B',
    },
    {
      mapboxCategory: 'garden',
      forwardQuery: 'botanical garden jardin square',
      type: 'garden',
      label: 'Botanic Garden',
      icon: '🌿',
      color: '#A3E635',
    },
  ],
};

// Strictly filter out fast-food chains, delivery-only dark kitchens, tourist traps, and generic franchises
export const CHAIN_BLOCKLIST = [
  'starbucks',
  'mcdonald',
  'mcdo',
  'burger king',
  'kfc',
  'kentucky fried',
  'subway',
  'dunkin',
  'costa coffee',
  'tim hortons',
  'pret a manger',
  'pret-a-manger',
  'domino',
  'pizza hut',
  'papa john',
  'little caesars',
  'taco bell',
  'wendy',
  'five guys',
  'popeyes',
  'chipotle',
  'shake shack',
  'carl\'s jr',
  'steak n shake',
  'quick ',
  'o\'tacos',
  'otacos',
  'chamas tacos',
  'brioche doree',
  'brioche dorée',
  'pomme de pain',
  'columbus cafe',
  'columbus café',
  'sushi shop',
  'planet sushi',
  'eat sushi',
  'sushi daily',
  'matsuri',
  'poke house',
  'pokawa',
  'cojean',
  'exki',
  'bagelstein',
  'bagel corner',
  'hippopotamus',
  'buffalo grill',
  'flunch',
  'courtepaille',
  'del arte',
  'vapiano',
  'indiana cafe',
  'au bureau',
  'paradis du fruit',
  'pitaya',
  'street bangkok',
  'big fernand',
  'hard rock cafe',
  'rainforest cafe',
  'planet hollywood',
  'amorino',
  'haagen-dazs',
  'häagen-dazs',
  'ben & jerry',
  'baskin robbins',
  'krispy kreme',
  'cinnabon',
  'carrefour',
  'franprix',
  'monoprix',
  'auchan',
  'lidl',
  'aldi',
  'intermarche',
  'intermarché',
  'picard',
  'biocoop',
  'naturalia',
  '7-eleven',
  'circle k',
  'totalenergies',
  'shell',
  'esso',
  'bp ',
  'relais h',
  'fnac',
  'ikea',
  'dark kitchen',
  'cloud kitchen',
  'deliveroo editions',
  'uber eats',
  'drive-thru',
  'souvenir',
  'tourist information',
];

// Regex heuristics for chains with short names (e.g., "Paul") or generic fast-food/tourist-trap patterns
const CHAIN_REGEX_PATTERNS = [
  /^paul$/i,
  /^boulangerie paul\b/i,
  /^paul\s+(boulangerie|express|cafe|café)/i,
  /^pret$/i,
  /\b(fast[\s-]?food|snack[\s-]?bar|kebab\s+express|pizza\s+express|tacos\s+express)\b/i,
  /\b(delivery\s+only|dark\s+kitchen|click\s*&\s*collect\s+only)\b/i,
  /#\d{2,}/, // Franchise store number e.g. "Store #402"
];

const CURATED_FALLBACK_SPOTS = {
  bistro: [
    { name: 'Le Petit Keller', street: 'Rue Keller' },
    { name: 'Bistrot des Tournelles', street: 'Rue des Tournelles' },
    { name: 'Parcelles', street: 'Rue Chapon' },
    { name: 'Chez Janou', street: 'Rue Roger Verlomme' },
  ],
  wine_bar: [
    { name: 'Septime La Cave', street: 'Rue de Charonne' },
    { name: 'Folderol Wine & Ice Cream', street: 'Rue du Grand Prieuré' },
    { name: 'La Buvette', street: 'Rue Saint-Maur' },
    { name: 'Le Baron Rouge', street: 'Rue Théophile Roussel' },
  ],
  restaurant: [
    { name: 'Clamato', street: 'Rue de Charonne' },
    { name: 'Les Enfants du Marché', street: 'Rue de Bretagne' },
    { name: 'Mokochaya', street: 'Rue Léon Frot' },
    { name: 'Bouillon Julien', street: 'Rue du Faubourg Saint-Denis' },
  ],
  cantina: [
    { name: 'Candelaria Cantina', street: 'Rue de Saintonge' },
    { name: 'Early June Seasonal Table', street: 'Rue Jean Poulmarch' },
    { name: 'Double Dragon', street: 'Rue Saint-Maur' },
    { name: 'Le Dauphin', street: 'Avenue Parmentier' },
  ],
  artisanal_kitchen: [
    { name: 'Hakata Choten Artisanal Ramen', street: 'Rue Gomboust' },
    { name: 'Sanjo Ramen Counter', street: 'Rue d’Argenteuil' },
    { name: 'Trois Fois Plus de Piment', street: 'Rue Saint-Martin' },
    { name: 'Miznon Marais', street: 'Rue des Ecouffes' },
  ],
  creperie: [
    { name: 'Breizh Café Le Marais', street: 'Rue Vieille du Temple' },
    { name: 'Krügen Galettes & Cidre', street: 'Rue de la Fontaine au Roi' },
    { name: 'Tanguy Crêperie Artisanale', street: 'Rue de l’Échiquier' },
  ],
  organic_kitchen: [
    { name: 'Wild & The Moon Charlot', street: 'Rue Charlot' },
    { name: 'Supernature Cantine', street: 'Rue de Trévise' },
    { name: 'L’Abattoir Végétal', street: 'Rue Ramey' },
  ],
  deli: [
    { name: 'Caractère de Cochon', street: 'Rue Charlot' },
    { name: 'Maison Plisson Comptoir', street: 'Boulevard Beaumarchais' },
    { name: 'L’Épicerie du Verre Volé', street: 'Rue de la Folie-Méricourt' },
  ],
  coffee: [
    { name: 'Substance Café', street: 'Rue Dussoubs' },
    { name: 'Motors Coffee', street: 'Rue des Halles' },
    { name: 'Dreamin Man', street: 'Rue Amelot' },
    { name: 'Ten Belles', street: 'Rue de la Grange aux Belles' },
  ],
  bookstore: [
    { name: 'OFR. Paris Bookshop', street: 'Rue Dupetit-Thouars' },
    { name: 'Yvon Lambert Bookshop', street: 'Rue des Filles du Calvaire' },
    { name: 'Librairie Sans Titre', street: 'Rue de Turenne' },
    { name: 'The Red Wheelbarrow', street: 'Rue de Médicis' },
  ],
  gallery: [
    { name: 'Galerie Perrotin', street: 'Rue de Turenne' },
    { name: 'Atelier Brancusi Studio', street: 'Place Georges-Pompidou' },
    { name: 'Lafayette Anticipations', street: 'Rue du Plâtre' },
    { name: 'Galerie Thaddaeus Ropac', street: 'Rue Debelleyme' },
  ],
  bakery: [
    { name: 'Du Pain et des Idées', street: 'Rue Yves Toudic' },
    { name: 'Mamiche Artisanal', street: 'Rue du Château d’Eau' },
    { name: 'Sain Boulangerie', street: 'Rue des Gravilliers' },
    { name: 'Ten Belles Bread', street: 'Rue Bichat' },
  ],
  park: [
    { name: 'Square du Temple – Elie Wiesel', street: 'Rue de Bretagne' },
    { name: 'Jardin Anne-Frank', street: 'Impasse Berthaud' },
    { name: 'Square Saint-Gilles Grand Veneur', street: 'Rue de Hesse' },
    { name: 'Promenade Plantée', street: 'Coulée Verte' },
  ],
  water: [
    { name: 'Fontaine Wallace • République', street: 'Boulevard Saint-Martin' },
    { name: 'Canal Lock Hydration Point', street: 'Quai de Valmy' },
    { name: 'Square Alban Satragne Fountain', street: 'Faubourg Saint-Denis' },
  ],
  viewpoint: [
    { name: 'Passerelle Bichat Footbridge', street: 'Quai de Jemmapes' },
    { name: 'Pont de Sully River Overlook', street: 'Quai des Célestins' },
    { name: 'Bassin de l’Arsenal Belvedere', street: 'Boulevard de la Bastille' },
  ],
  garden: [
    { name: 'Jardin des Rosiers – Joseph Migneret', street: 'Rue des Rosiers' },
    { name: 'Jardin Villemin Waterside', street: 'Quai de Valmy' },
    { name: 'Square Barye Island Tip', street: 'Île Saint-Louis' },
  ],
};

/**
 * Haversine distance in meters between two [lat, lng] coordinates.
 */
export function distanceMeters([lat1, lng1], [lat2, lng2]) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calculates the unclamped shortest distance in meters from `coord` ([lat, lng])
 * to the nearest segment on a polyline of `waypoints`.
 */
export function distanceToPolylineMeters(coord, waypoints = []) {
  if (!coord || !waypoints || waypoints.length === 0) return Infinity;
  if (waypoints.length === 1) {
    return distanceMeters(coord, waypoints[0]);
  }

  let minMeters = Infinity;
  const [pLat, pLng] = coord;
  const cosLat = Math.cos((pLat * Math.PI) / 180);

  for (let i = 0; i < waypoints.length - 1; i++) {
    const [aLat, aLng] = waypoints[i];
    const [bLat, bLng] = waypoints[i + 1];

    // Local planar projection in meters relative to point P
    const ax = (aLng - pLng) * 111320 * cosLat;
    const ay = (aLat - pLat) * 111320;
    const bx = (bLng - pLng) * 111320 * cosLat;
    const by = (bLat - pLat) * 111320;

    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;

    let t = 0;
    if (lenSq > 0) {
      t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq));
    }

    const closestX = ax + t * dx;
    const closestY = ay + t * dy;
    const dist = Math.hypot(closestX, closestY);
    if (dist < minMeters) {
      minMeters = dist;
    }
  }

  return minMeters;
}

/**
 * Calculates the shortest distance in meters from `coord` ([lat, lng])
 * to the nearest segment on a polyline of `waypoints` (clamped for UI display).
 */
export function calculateDetourMeters(coord, waypoints = []) {
  if (!coord || !waypoints || waypoints.length === 0) return 18;
  const minMeters = distanceToPolylineMeters(coord, waypoints);
  if (!Number.isFinite(minMeters)) return 18;
  // Since routes snap through or right beside the POI, keep realistic sidewalk offset (6m–120m)
  return Math.max(6, Math.min(120, Math.round(minMeters)));
}

/**
 * Checks whether a candidate venue name or Mapbox feature belongs to a generic chain,
 * fast-food franchise, delivery-only dark kitchen, or tourist trap.
 */
export function isGenericChain(name = '', feat = null) {
  const normalized = String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (!normalized || normalized.length < 2) return true;

  if (CHAIN_BLOCKLIST.some((chain) => normalized.includes(chain))) {
    return true;
  }

  if (CHAIN_REGEX_PATTERNS.some((regex) => regex.test(normalized))) {
    return true;
  }

  // Check Mapbox feature metadata for fast_food or chain brands
  if (feat?.properties) {
    const props = feat.properties;
    const brand = String(props.brand || '').toLowerCase();
    if (brand && CHAIN_BLOCKLIST.some((chain) => brand.includes(chain))) {
      return true;
    }
    const poiCats = Array.isArray(props.poi_category_ids)
      ? props.poi_category_ids
      : Array.isArray(props.poi_category)
      ? props.poi_category
      : [];
    if (
      poiCats.some((c) =>
        ['fast_food', 'food_court', 'drive_in', 'supermarket', 'convenience_store'].includes(
          String(c).toLowerCase()
        )
      )
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Refines the editorial badge label, icon, and warm palette color for culinary spots
 * based on the venue's name and Mapbox categories.
 */
export function refineCulinaryPresentation(name = '', feat = null, defaultSpec = {}) {
  const norm = String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const cats = [
    ...(Array.isArray(feat?.properties?.poi_category) ? feat.properties.poi_category : []),
    ...(Array.isArray(feat?.properties?.poi_category_ids) ? feat.properties.poi_category_ids : []),
  ]
    .map((c) => String(c).toLowerCase())
    .join(' ');

  if (defaultSpec.vibeGroup !== 'eats' && !cats.includes('restaurant') && !cats.includes('bistro') && !cats.includes('wine')) {
    return {
      label: defaultSpec.label,
      icon: defaultSpec.icon,
      color: defaultSpec.color,
      type: defaultSpec.type,
    };
  }

  if (
    norm.includes('cave') ||
    norm.includes('vin') ||
    norm.includes('uvette') ||
    norm.includes('quilles') ||
    cats.includes('wine_bar') ||
    defaultSpec.type === 'wine_bar'
  ) {
    return {
      label: 'Natural Wine & Bites',
      icon: '🍷',
      color: '#C2410C',
      type: 'wine_bar',
    };
  }

  if (
    norm.includes('bistro') ||
    norm.includes('bouillon') ||
    norm.includes('auberge') ||
    norm.includes('brasserie') ||
    norm.includes('chez ') ||
    cats.includes('bistro') ||
    defaultSpec.type === 'bistro'
  ) {
    return {
      label: 'Hidden Bistro',
      icon: '🍽️',
      color: '#E0533C',
      type: 'bistro',
    };
  }

  if (
    norm.includes('cantine') ||
    norm.includes('cantina') ||
    norm.includes('tapas') ||
    norm.includes('taqueria') ||
    norm.includes('izakaya') ||
    cats.includes('tapas') ||
    defaultSpec.type === 'cantina'
  ) {
    return {
      label: 'Neighborhood Cantina',
      icon: '🫒',
      color: '#D97706',
      type: 'cantina',
    };
  }

  if (
    norm.includes('ramen') ||
    norm.includes('atelier') ||
    norm.includes('comptoir') ||
    norm.includes('epicerie') ||
    norm.includes('creperie') ||
    norm.includes('galette') ||
    defaultSpec.type === 'artisanal_kitchen' ||
    defaultSpec.type === 'organic_kitchen' ||
    defaultSpec.type === 'deli' ||
    defaultSpec.type === 'creperie'
  ) {
    return {
      label: 'Artisanal Kitchen',
      icon: defaultSpec.icon || '🍜',
      color: '#EA580C',
      type: 'artisanal_kitchen',
    };
  }

  if (defaultSpec.type === 'bakery') {
    return {
      label: 'Artisanal Bakery',
      icon: '🥐',
      color: '#F59E0B',
      type: 'bakery',
    };
  }

  return {
    label: defaultSpec.label || 'Local Table',
    icon: defaultSpec.icon || '🥘',
    color: defaultSpec.color || '#FF6B4A',
    type: defaultSpec.type || 'restaurant',
  };
}

/**
 * Selects the ordered category catalog for a route based on `activityMode`, `stopVibe`, and `seed`.
 * Ensures a balanced mix of culinary & cultural gems in 'all' mode, or targeted subsets in 'eats' / 'culture'.
 */
export function selectCategorySpecsForVibe(
  activityMode = 'walk',
  stopVibe = 'all',
  count = 4,
  seed = 0,
  variantKey = 'primary'
) {
  if (activityMode === 'run') {
    const runCat = POI_CATEGORIES.run;
    return Array.from({ length: count }, (_, idx) => runCat[(idx + seed) % runCat.length]);
  }

  const allWalk = POI_CATEGORIES.walk;
  const eatsSpecs = allWalk.filter((c) => c.vibeGroup === 'eats');
  const cultureSpecs = allWalk.filter((c) => c.vibeGroup === 'culture');

  // When stopVibe is 'all', bias the POI character by route variant:
  // - 'quiet' ("Quiet Alleys" / Calm & Green): prioritizes parks, pedestrian squares, bookstores & quiet cafés
  // - 'hidden_gems' / 'scenic' ("Hidden Gems" / Local Discovery): prioritizes distinct culinary & cultural POIs
  if (stopVibe === 'all' && variantKey === 'quiet') {
    const calmGreenPool = [
      allWalk.find((c) => c.type === 'park'),
      allWalk.find((c) => c.type === 'bookstore'),
      allWalk.find((c) => c.type === 'coffee'),
      allWalk.find((c) => c.type === 'gallery'),
      allWalk.find((c) => c.type === 'bakery'),
    ].filter(Boolean);
    return Array.from(
      { length: count },
      (_, idx) => calmGreenPool[(idx + seed) % calmGreenPool.length]
    );
  }

  if (stopVibe === 'all' && (variantKey === 'hidden_gems' || variantKey === 'scenic')) {
    const localDiscoveryPool = [
      allWalk.find((c) => c.type === 'bistro'),
      allWalk.find((c) => c.type === 'gallery'),
      allWalk.find((c) => c.type === 'wine_bar'),
      allWalk.find((c) => c.type === 'artisanal_kitchen'),
      allWalk.find((c) => c.type === 'bookstore'),
      allWalk.find((c) => c.type === 'cantina'),
    ].filter(Boolean);
    return Array.from(
      { length: count },
      (_, idx) => localDiscoveryPool[(idx + seed) % localDiscoveryPool.length]
    );
  }

  if (stopVibe === 'eats') {
    return Array.from(
      { length: count },
      (_, idx) => eatsSpecs[(idx * 2 + seed) % eatsSpecs.length]
    );
  }

  if (stopVibe === 'culture') {
    // Include artisanal bakery as an honorary morning pastry stop alongside coffee, books, gallery, park
    const culturePlusBakery = [
      ...cultureSpecs,
      allWalk.find((c) => c.type === 'bakery'),
    ].filter(Boolean);
    return Array.from(
      { length: count },
      (_, idx) => culturePlusBakery[(idx + seed) % culturePlusBakery.length]
    );
  }

  // 'all' ("All Gems" / "Curated Drift"): interleave Niche Eats (Hidden Bistro, Local Table, Wine Bar) with Coffee & Culture
  const balancedPool = [];
  for (let i = 0; i < count; i++) {
    if (i % 2 === 0) {
      balancedPool.push(eatsSpecs[(Math.floor(i / 2) + seed) % eatsSpecs.length]);
    } else {
      balancedPool.push(cultureSpecs[(Math.floor(i / 2) + seed) % cultureSpecs.length]);
    }
  }
  return balancedPool;
}

/**
 * Extracts a clean street/neighborhood name and formatted address from a Mapbox feature.
 */
function extractStreetAndAddress(feature) {
  const props = feature?.properties || {};
  const ctx = props.context || {};

  const streetName =
    ctx.street?.name ||
    props.address ||
    ctx.neighborhood?.name ||
    ctx.locality?.name ||
    '';

  const neighborhood =
    ctx.neighborhood?.name ||
    ctx.locality?.name ||
    ctx.place?.name ||
    '';

  const rawAddress =
    props.address ||
    (props.full_address ? props.full_address.split(',')[0] : '') ||
    (feature?.place_name ? feature.place_name.split(',').slice(1, 2).join('').trim() : '') ||
    streetName;

  const formattedAddress = [rawAddress, neighborhood]
    .filter(Boolean)
    .filter((val, idx, arr) => arr.indexOf(val) === idx)
    .join(', ');

  return {
    streetName: streetName || rawAddress || neighborhood || 'quiet side street',
    address: formattedAddress || rawAddress || 'Local Neighborhood Spot',
  };
}

/**
 * Builds an editorial field note from the real street address/neighborhood context.
 */
export function buildEditorialFieldNote(streetName, catType, activityMode, idx = 0) {
  const cleanStreet = (streetName || 'the neighborhood').replace(/^\d+\s*,?\s*/, '').trim();
  const streetLabel = cleanStreet || 'this quiet block';

  if (activityMode === 'run') {
    const runTemplates = [
      `Smooth pass along ${streetLabel} • zero-stop flow`,
      `Scenic checkpoint by ${streetLabel} • flat grade`,
      `Quick breather near ${streetLabel} • open sightlines`,
      `Low-traffic stretch past ${streetLabel} • steady cadence`,
    ];
    return runTemplates[idx % runTemplates.length];
  }

  const culinaryNotesByType = {
    bistro: [
      `Tucked off ${streetLabel} • ideal post-drift table`,
      `Intimate neighborhood bistro on ${streetLabel} • daily chalkboard menu`,
    ],
    wine_bar: [
      `Natural pours along ${streetLabel} • worth pausing for an early aperitif`,
      `Candlelit cellar on ${streetLabel} • small-batch bottles & bites`,
    ],
    restaurant: [
      `Intimate neighborhood kitchen on ${streetLabel} • worth pausing for lunch or an early aperitif`,
      `Tucked off ${streetLabel} • seasonal market table away from main boulevards`,
    ],
    cantina: [
      `Lively neighborhood cantina on ${streetLabel} • shared plates & warm atmosphere`,
      `Tucked off ${streetLabel} • small-batch kitchen worth a mid-walk pause`,
    ],
    artisanal_kitchen: [
      `Artisanal counter on ${streetLabel} • handcrafted bowls & market produce`,
      `Tucked off ${streetLabel} • independent kitchen with zero chain footprint`,
    ],
    creperie: [
      `Artisanal buckwheat galettes on ${streetLabel} • farm cider & quiet terrace`,
    ],
    organic_kitchen: [
      `Seasonal farm-to-table counter on ${streetLabel} • nourishing post-walk stop`,
    ],
    deli: [
      `Independent pantry & counter on ${streetLabel} • regional cheeses & charcuterie`,
    ],
  };

  if (culinaryNotesByType[catType]) {
    const list = culinaryNotesByType[catType];
    return list[idx % list.length];
  }

  const walkTemplatesByType = {
    coffee: `Tucked along ${streetLabel} • worth a 5-min espresso pause`,
    bookstore: `Quiet shelves on ${streetLabel} • high serendipity browse`,
    gallery: `Curated space off ${streetLabel} • step inside for 3 mins`,
    bakery: `Warm sourdough loaves on ${streetLabel} • follow the morning aroma`,
    park: `Leafy pocket beside ${streetLabel} • shaded bench break`,
  };

  return (
    walkTemplatesByType[catType] ||
    `Tucked off ${streetLabel} • ideal neighborhood pause`
  );
}

/**
 * Queries a single category around `[lat, lng]` using Mapbox Search Box API v1
 * (`/search/searchbox/v1/category/{category}` with fallback to `/search/searchbox/v1/forward`).
 */
async function queryMapboxCategoryAroundPoint(
  anchorCoord,
  categorySpec,
  token,
  signal,
  searchRadiusMeters = 280
) {
  const [lat, lng] = anchorCoord;
  const proximity = `${lng.toFixed(5)},${lat.toFixed(5)}`;

  // Tight metric bounding box around the calibrated vertex so Mapbox prioritizes immediately adjacent venues
  const clampedRadius = Math.max(180, Math.min(1200, Number(searchRadiusMeters) || 280));
  const latDelta = clampedRadius / 111320;
  const lngDelta =
    clampedRadius / (111320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const bbox = [
    (lng - lngDelta).toFixed(5),
    (lat - latDelta).toFixed(5),
    (lng + lngDelta).toFixed(5),
    (lat + latDelta).toFixed(5),
  ].join(',');

  // 1. Primary: Mapbox Search Box Category API
  const categoryUrl = `https://api.mapbox.com/search/searchbox/v1/category/${encodeURIComponent(
    categorySpec.mapboxCategory
  )}?proximity=${proximity}&bbox=${bbox}&limit=10&language=fr,en&access_token=${token}`;

  try {
    const res = await fetch(categoryUrl, { signal });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.features) && data.features.length > 0) {
        return data.features;
      }
    }
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
  }

  // 2. Secondary: Mapbox Search Box Forward API
  const forwardUrl = `https://api.mapbox.com/search/searchbox/v1/forward?q=${encodeURIComponent(
    categorySpec.forwardQuery
  )}&proximity=${proximity}&bbox=${bbox}&types=poi&limit=10&language=fr,en&access_token=${token}`;

  try {
    const res = await fetch(forwardUrl, { signal });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.features) && data.features.length > 0) {
        return data.features;
      }
    }
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
  }

  return [];
}

/**
 * Fetches 3 to 4 distinct, authentic real-world POIs strictly along the route's calibrated anchors/waypoints
 * using the Mapbox Search Box API (`/search/searchbox/v1/category/{category}` or `/search/searchbox/v1/forward`).
 *
 * Enforces strict proximity (`maxPolylineDistanceMeters` / `maxDistanceFromAnchorMeters`, default 140m)
 * to the clean loop/corridor polyline and keeps POIs away from `origin` / `destination` so they never
 * cause U-turn spurs or bloat the calibrated loop.
 */
export async function fetchRealPOIsAlongRoute(
  waypoints = [],
  activityMode = 'walk',
  token = (
    import.meta.env?.VITE_MAPBOX_TOKEN ||
    (typeof process !== 'undefined' ? process.env?.VITE_MAPBOX_TOKEN : '') ||
    ''
  ).trim(),
  options = {}
) {
  const {
    seed = 0,
    stopVibe = 'all',
    variantKey = 'primary',
    signal,
    visitedPoiNames = [],
    visitedPoiIds = [],
    maxDistanceFromAnchorMeters = 140,
    routePolyline = null,
    maxPolylineDistanceMeters = 140,
    origin = null,
    destination = null,
    minDistanceFromOriginMeters = 0,
    minDistanceFromDestinationMeters = 0,
    allowFallback = true,
  } = options;

  const activePolyline =
    Array.isArray(routePolyline) && routePolyline.length >= 2
      ? routePolyline
      : null;

  if (!waypoints || waypoints.length === 0) {
    return [];
  }

  if (!token) {
    if (!allowFallback) return [];
    return getPOIsForRoute(waypoints, activityMode, seed, {
      stopVibe,
      variantKey,
      visitedPoiNames,
      visitedPoiIds,
    });
  }

  const visitedNameSet = new Set(
    (visitedPoiNames || []).map((n) => String(n).toLowerCase().trim())
  );
  const visitedIdSet = new Set((visitedPoiIds || []).map((id) => String(id)));

  const targetCount = activityMode === 'walk' ? 4 : 3;

  // Pick 3–4 well-spaced probe coordinates along the route/corridor anchors
  const probeCoords = [];
  if (waypoints.length <= targetCount) {
    probeCoords.push(...waypoints);
  } else {
    const fractions =
      targetCount === 4 ? [0.2, 0.42, 0.65, 0.85] : [0.25, 0.52, 0.78];
    for (const frac of fractions) {
      const idx = Math.min(
        waypoints.length - 1,
        Math.max(0, Math.floor(waypoints.length * frac))
      );
      probeCoords.push(waypoints[idx]);
    }
  }

  const specsForProbes = selectCategorySpecsForVibe(
    activityMode,
    stopVibe,
    probeCoords.length,
    seed,
    variantKey
  );
  const backupSpecsForProbes = selectCategorySpecsForVibe(
    activityMode,
    stopVibe,
    probeCoords.length,
    seed + 3,
    variantKey
  );

  const selectedSpecs = probeCoords.map((coord, idx) => ({
    coord,
    spec: specsForProbes[idx],
    backupSpec: backupSpecsForProbes[idx],
    index: idx,
  }));

  const searchRadiusMeters = Math.max(
    200,
    Math.min(
      700,
      Math.round(
        Math.max(maxDistanceFromAnchorMeters, maxPolylineDistanceMeters) * 1.65
      )
    )
  );

  const pickBestFromFeatures = (features, anchorCoord, spec, idx, usedNames, discoveredPOIs) => {
    if (!features || features.length === 0) return null;

    const candidates = features
      .map((feat) => {
        const geoCoords = feat?.geometry?.coordinates;
        if (!Array.isArray(geoCoords) || geoCoords.length < 2) return null;
        const [lng, lat] = geoCoords;
        const name = (feat?.properties?.name || feat?.text || '').trim();
        if (!name || isGenericChain(name, feat)) return null;

        const featId = String(feat?.properties?.mapbox_id || '');
        const normName = name.toLowerCase();
        const wasVisited =
          visitedNameSet.has(normName) ||
          (featId && visitedIdSet.has(featId));

        const coords = [Number(lat.toFixed(6)), Number(lng.toFixed(6))];
        const distFromAnchor = distanceMeters(anchorCoord, coords);
        const distFromPolyline = activePolyline
          ? distanceToPolylineMeters(coords, activePolyline)
          : distFromAnchor;
        return {
          feat,
          featId,
          name,
          normName,
          wasVisited,
          coords,
          distFromAnchor,
          distFromPolyline,
        };
      })
      .filter(Boolean)
      .filter((item) => {
        if (activePolyline) {
          return (
            item.distFromPolyline <= maxPolylineDistanceMeters &&
            item.distFromAnchor <= Math.max(maxDistanceFromAnchorMeters, 240)
          );
        }
        return item.distFromAnchor <= maxDistanceFromAnchorMeters;
      })
      .filter((item) => {
        if (origin && minDistanceFromOriginMeters > 0) {
          if (distanceMeters(origin, item.coords) < minDistanceFromOriginMeters) {
            return false;
          }
        }
        if (destination && minDistanceFromDestinationMeters > 0) {
          if (distanceMeters(destination, item.coords) < minDistanceFromDestinationMeters) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const polyDiff = a.distFromPolyline - b.distFromPolyline;
        if (Math.abs(polyDiff) > 8) return polyDiff;
        return a.distFromAnchor - b.distFromAnchor;
      });

    // Deduplicate against venues already picked in this route and ensure >60m spacing
    const uniqueCandidates = candidates.filter((c) => {
      if (usedNames.has(c.normName)) return false;
      const tooClose = discoveredPOIs.some(
        (existing) => distanceMeters(existing.coords, c.coords) < 60
      );
      return !tooClose;
    });

    if (uniqueCandidates.length === 0) return null;

    // Strictly prefer unvisited venues unless no fresh alternatives exist
    const freshCandidates = uniqueCandidates.filter((c) => !c.wasVisited);
    const pool = freshCandidates.length > 0 ? freshCandidates : uniqueCandidates;

    const pickIdx = seed % Math.min(3, pool.length);
    const chosen = pool[pickIdx];
    usedNames.add(chosen.normName);

    const { streetName, address } = extractStreetAndAddress(chosen.feat);
    const detourMeters = calculateDetourMeters(
      chosen.coords,
      activePolyline || waypoints
    );
    const vibeScore = Math.min(
      98,
      Math.max(88, 91 + ((chosen.name.length + idx * 3 + seed) % 7))
    );

    const presentation = refineCulinaryPresentation(
      chosen.name,
      chosen.feat,
      spec
    );

    return {
      id:
        chosen.featId ||
        `poi-real-${activityMode}-${idx}-${Date.now()}`,
      name: chosen.name,
      address,
      streetName,
      category: presentation.label,
      type: presentation.type,
      icon: presentation.icon,
      color: presentation.color,
      coords: chosen.coords,
      vibeScore,
      detourMeters,
      anchorIndex: idx,
      distFromAnchorMeters: Math.round(chosen.distFromAnchor),
      distFromPolylineMeters: Math.round(chosen.distFromPolyline),
      note: buildEditorialFieldNote(
        streetName,
        presentation.type,
        activityMode,
        idx
      ),
      isReal: true,
      isFreshDiscovery: !chosen.wasVisited,
    };
  };

  try {
    const rawLists = await Promise.all(
      selectedSpecs.map(({ coord, spec }) =>
        queryMapboxCategoryAroundPoint(coord, spec, token, signal, searchRadiusMeters)
      )
    );

    const usedNames = new Set();
    const discoveredPOIs = [];
    const missedIndices = [];

    rawLists.forEach((features, idx) => {
      const { coord: anchorCoord, spec } = selectedSpecs[idx];
      const poi = pickBestFromFeatures(
        features,
        anchorCoord,
        spec,
        idx,
        usedNames,
        discoveredPOIs
      );
      if (poi) {
        discoveredPOIs.push(poi);
      } else {
        missedIndices.push(idx);
      }
    });

    // If any vertex found 0 qualifying POIs within 250m for its primary category,
    // try one backup category from the same vibe pool around those missed vertices.
    if (missedIndices.length > 0) {
      const backupLists = await Promise.all(
        missedIndices.map((idx) => {
          const { coord, spec, backupSpec } = selectedSpecs[idx];
          const altSpec =
            backupSpec && backupSpec.mapboxCategory !== spec.mapboxCategory
              ? backupSpec
              : activityMode === 'run'
              ? POI_CATEGORIES.run[(idx + 1) % POI_CATEGORIES.run.length]
              : POI_CATEGORIES.walk.find(
                  (c) =>
                    c.mapboxCategory !== spec.mapboxCategory &&
                    (stopVibe === 'all' || c.vibeGroup === stopVibe)
                ) || POI_CATEGORIES.walk[0];
          return queryMapboxCategoryAroundPoint(
            coord,
            altSpec,
            token,
            signal,
            searchRadiusMeters
          ).then((features) => ({ idx, altSpec, features }));
        })
      );

      backupLists.forEach(({ idx, altSpec, features }) => {
        const { coord: anchorCoord } = selectedSpecs[idx];
        const poi = pickBestFromFeatures(
          features,
          anchorCoord,
          altSpec,
          idx,
          usedNames,
          discoveredPOIs
        );
        if (poi) {
          discoveredPOIs.push(poi);
        }
      });

      discoveredPOIs.sort((a, b) => (a.anchorIndex ?? 0) - (b.anchorIndex ?? 0));
    }

    if (!allowFallback) {
      return discoveredPOIs.slice(0, 4);
    }

    if (discoveredPOIs.length >= 2) {
      return discoveredPOIs.slice(0, 4);
    }
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
  }

  if (!allowFallback) {
    return [];
  }

  // Graceful fallback to curated local spots if API returns zero results or hits a network limit
  return getPOIsForRoute(waypoints, activityMode, seed, {
    stopVibe,
    variantKey,
    visitedPoiNames,
    visitedPoiIds,
  });
}

/**
 * Synchronous curated local fallback POI generator when offline or API returns zero results.
 * Filters out already-visited spot names unless all options in a category have been visited.
 */
export function getPOIsForRoute(
  waypoints = [],
  activityMode = 'walk',
  seed = 0,
  options = {}
) {
  if (!waypoints || waypoints.length === 0) return [];

  const stopVibe = options.stopVibe || 'all';
  const variantKey = options.variantKey || 'primary';
  const visitedNameSet = new Set(
    (options.visitedPoiNames || []).map((n) => String(n).toLowerCase().trim())
  );

  const sampleFractions =
    activityMode === 'walk' ? [0.22, 0.48, 0.72, 0.88] : [0.25, 0.5, 0.75];
  const specs = selectCategorySpecsForVibe(
    activityMode,
    stopVibe,
    sampleFractions.length,
    seed,
    variantKey
  );

  return sampleFractions.map((frac, idx) => {
    const wpIndex = Math.min(
      waypoints.length - 1,
      Math.floor(waypoints.length * frac)
    );
    const [lat, lng] = waypoints[wpIndex] || waypoints[0];
    const cat = specs[idx];
    const fallbackList = CURATED_FALLBACK_SPOTS[cat.type] || [
      { name: 'Atelier du Quartier', street: 'Rue Oberkampf' },
    ];

    const freshFallbacks = fallbackList.filter(
      (s) => !visitedNameSet.has(s.name.toLowerCase())
    );
    const pool = freshFallbacks.length > 0 ? freshFallbacks : fallbackList;
    const spot = pool[(wpIndex + idx + seed) % pool.length];
    const wasVisited = visitedNameSet.has(spot.name.toLowerCase());

    // Slight offset so fallback marker sits right beside the street
    const jitterLat = Number(
      (lat + (idx % 2 === 0 ? 0.00022 : -0.00022)).toFixed(6)
    );
    const jitterLng = Number(
      (lng + (idx % 2 === 0 ? -0.00028 : 0.00028)).toFixed(6)
    );
    const coords = [jitterLat, jitterLng];

    return {
      id: `poi-fallback-${activityMode}-${stopVibe}-${idx}-${wpIndex}-${seed}`,
      name: spot.name,
      address: spot.street,
      streetName: spot.street,
      category: cat.label,
      type: cat.type,
      icon: cat.icon,
      color: cat.color,
      coords,
      vibeScore: 89 + ((idx * 3 + seed) % 9),
      detourMeters: calculateDetourMeters(coords, waypoints),
      note: buildEditorialFieldNote(spot.street, cat.type, activityMode, idx),
      isReal: false,
      isFreshDiscovery: !wasVisited,
    };
  });
}

export const HALL_OF_FAME_ROUTES = [
  {
    id: 'hof-1',
    title: 'Vinyl & Cortado Twilight Loop',
    curator: '@marta.drifts',
    activityMode: 'walk',
    steps: 6000,
    distanceKm: 4.5,
    elevationGain: '18m (Flat)',
    trafficScore: '96% Quiet Alleys',
    tags: ['Hidden Bistro', 'Roastery', 'Natural Wine'],
    likes: 342,
  },
  {
    id: 'hof-2',
    title: 'Zero-Red-Light Canal Tempo',
    curator: '@sora.runs',
    activityMode: 'run',
    steps: 10500,
    distanceKm: 7.9,
    elevationGain: '12m (Ultra-Flat)',
    trafficScore: '99% Car-Free Path',
    tags: ['2 Hydration Stops', 'Smooth Asphalt', 'Dawn Lit'],
    likes: 518,
  },
  {
    id: 'hof-3',
    title: 'Sunday Zine & Pocket Park Stroll',
    curator: '@leo.flaneur',
    activityMode: 'walk',
    steps: 4200,
    distanceKm: 3.15,
    elevationGain: '24m (Gentle)',
    trafficScore: '94% Pedestrian Zone',
    tags: ['Indie Press', 'Hidden Garden', 'Bakery'],
    likes: 289,
  },
];

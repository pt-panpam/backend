import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';

const router = Router();

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const OVERPASS_TIMEOUT_MS = 8000;

// Map OSM tags to a friendly category + emoji + popularity weight
function classify(tags: Record<string, string>): { category: string; icon: string; weight: number } | null {
  const a = tags.amenity;
  const s = tags.shop;
  const t = tags.tourism;
  const o = tags.office;
  const h = tags.historic;

  if (a === 'cafe' || a === 'coffee_shop' || s === 'coffee' || a === 'ice_cream') {
    return { category: 'coffee', icon: '☕', weight: 4 };
  }
  if (a === 'restaurant' || a === 'fast_food' || a === 'food_court') {
    return { category: 'food', icon: '🍜', weight: 5 };
  }
  if (a === 'bar' || a === 'pub' || a === 'nightclub' || a === 'biergarten') {
    return { category: 'nightlife', icon: '🍸', weight: 5 };
  }
  if (s && ['bakery', 'supermarket', 'mall', 'clothes', 'convenience', 'department_store', 'electronics', 'shoes', 'fashion', 'jewelry', 'books'].includes(s)) {
    return { category: 'shop', icon: '🛍️', weight: 4 };
  }
  if (a === 'university' || a === 'college' || a === 'school' || a === 'kindergarten') {
    return { category: 'college', icon: '🎓', weight: 5 };
  }
  if (o || a === 'bank' || a === 'post_office' || tags.building === 'commercial' || a === 'coworking_space') {
    return { category: 'work', icon: '💼', weight: 3 };
  }
  if (t === 'attraction' || t === 'museum' || t === 'viewpoint' || t === 'theme_park' || t === 'zoo' || t === 'aquarium' || h || a === 'arts_centre' || a === 'theatre') {
    return { category: 'landmark', icon: '🏛️', weight: 6 };
  }
  if (tags.leisure === 'park' || a === 'park' || t === 'park') {
    return { category: 'park', icon: '🌳', weight: 4 };
  }
  if (s) {
    return { category: 'shop', icon: '🛍️', weight: 3 };
  }
  return null;
}

const CATEGORY_KEYS = ['coffee', 'food', 'nightlife', 'shop', 'college', 'work', 'landmark', 'park'] as const;

router.get('/nearby/', authenticate, async (req: AuthRequest, res: Response) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  const radius = Math.min(parseInt(req.query.radius as string) || 1500, 4000);

  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ error: 'lat and lng query params required' });
    return;
  }

  const query = `
    [out:json][timeout:15];
    (
      node["amenity"~"cafe|coffee_shop|restaurant|fast_food|food_court|bar|pub|nightclub|university|college|school|kindergarten|bank|post_office|coworking_space|arts_centre|theatre"](around:${radius},${lat},${lng});
      node["shop"~"."](around:${radius},${lat},${lng});
      node["office"~"."](around:${radius},${lat},${lng});
      node["tourism"~"attraction|museum|viewpoint|theme_park|zoo|aquarium|park"](around:${radius},${lat},${lng});
      node["historic"~"."](around:${radius},${lat},${lng});
      node["leisure"="park"](around:${radius},${lat},${lng});
    );
    out center 120;
  `;

  try {
    // Try multiple Overpass mirrors with a per-request timeout for resilience.
    const body = 'data=' + encodeURIComponent(query);
    let ovResp: Awaited<ReturnType<typeof fetch>> | null = null;
    let lastStatus = 0;

    for (const endpoint of OVERPASS_ENDPOINTS) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: controller.signal,
        });
        if (resp.ok) {
          ovResp = resp;
          break;
        }
        lastStatus = resp.status;
      } catch (e: any) {
        if (e?.name === 'AbortError') console.error(`Places fetch timeout: ${endpoint}`);
        else console.error(`Places fetch failed: ${endpoint} - ${e?.message || e}`);
      } finally {
        clearTimeout(timer);
      }
    }

    if (!ovResp) {
      res.status(502).json({ error: 'Place provider unavailable', detail: `Overpass ${lastStatus || 'unreachable'}` });
      return;
    }

    const json: any = await ovResp.json();
    const elements: any[] = json.elements || [];

    const seen = new Set<string>();
    const places: any[] = [];

    for (const el of elements) {
      if (el.type !== 'node') continue;
      const tags = el.tags || {};
      const cls = classify(tags);
      if (!cls) continue;

      const name = tags.name || tags['name:en'] || null;
      if (!name) continue;

      const key = name.toUpperCase() + '|' + el.lat.toFixed(4) + '|' + el.lon.toFixed(4);
      if (seen.has(key)) continue;
      seen.add(key);

      const dist = haversineKm(lat, lng, el.lat, el.lon);

      places.push({
        id: String(el.id),
        name,
        category: cls.category,
        icon: cls.icon,
        lat: el.lat,
        lng: el.lon,
        distance_km: dist ? Math.round(dist * 10) / 10 : 0,
        // lively crowd indicator: popularity weight + proximity boost (closer = feels busier)
        crowd: Math.min(10, Math.round(cls.weight + (dist < 0.5 ? 2 : dist < 1 ? 1 : 0))),
      });
    }

    places.sort((a, b) => b.crowd - a.crowd || a.distance_km - b.distance_km);

    const categories = CATEGORY_KEYS
      .map((k) => ({ key: k, icon: places.find((p) => p.category === k)?.icon || '' }))
      .filter((c) => places.some((p) => p.category === c.key));

    res.json({ places: places.slice(0, 60), categories });
  } catch (err: any) {
    console.error('Places fetch error:', err);
    res.status(500).json({ error: 'Failed to load places' });
  }
});

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default router;

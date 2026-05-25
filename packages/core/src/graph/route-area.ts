// Derive the area a POM covers from its route. Without a `routeAreas` mapping
// this is the first path segment slugified (the legacy behavior, kept so
// existing graphs resolve identically). With a mapping, the full route resolves
// to a human-chosen area label so POM areas reconcile with ticket
// `modifiesAreas` during impact analysis. (#197)

export function routeToAreaSlug(route: string | undefined): string {
  if (!route) return 'root';
  return (
    route
      .replace(/^\//, '')
      .split('/')[0]!
      .replace(/[^a-z0-9-]/gi, '-')
      .toLowerCase() || 'root'
  );
}

export function resolvePomArea(
  route: string | undefined,
  routeAreas: Record<string, string> | undefined,
): string {
  if (route && routeAreas) {
    const exact = routeAreas[route];
    if (exact) return exact;
    // Longest-prefix match on a path-segment boundary: '/settings/profile'
    // falls back to a '/settings' key. The root '/' key is intentionally
    // exact-only (handled above) so it doesn't swallow every route.
    let bestKey: string | undefined;
    let bestLen = -1;
    for (const key of Object.keys(routeAreas)) {
      if (key === '/') continue;
      const norm = key.endsWith('/') ? key.slice(0, -1) : key;
      if ((route === norm || route.startsWith(`${norm}/`)) && norm.length > bestLen) {
        bestLen = norm.length;
        bestKey = key;
      }
    }
    if (bestKey !== undefined) return routeAreas[bestKey]!;
  }
  return routeToAreaSlug(route);
}

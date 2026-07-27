(function initCreditekMetaTargeting(globalScope) {
  function buildMetaCities(selectedIds, zones, radius = 20) {
    const cities = [];
    const seenKeys = new Set();

    for (const id of selectedIds) {
      const zone = zones[id];
      if (!zone || zone.key === undefined || zone.key === null) continue;

      const key = String(zone.key);
      if (!key || seenKeys.has(key)) continue;
      seenKeys.add(key);

      cities.push({
        key,
        radius,
        distance_unit: 'kilometer',
        region: zone.region,
        region_id: String(zone.region_id),
        country: 'CO',
      });
    }

    return cities;
  }

  const api = { buildMetaCities };
  globalScope.CreditekMetaTargeting = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));

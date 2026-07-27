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

  function buildSummaryNames(selectedIds, zones) {
    const names = [];
    const seenKeys = new Set();

    for (const id of selectedIds) {
      const zone = zones[id];
      if (!zone || zone.key === undefined || zone.key === null) continue;
      const key = String(zone.key).trim();
      if (!key || seenKeys.has(key)) continue;
      seenKeys.add(key);
      names.push(String(zone.name || '').trim());
    }

    return names.filter(Boolean);
  }

  function validateSelectedZones(selectedIds, zones) {
    for (const id of selectedIds) {
      const zone = zones[id];
      const key = zone?.key === undefined || zone?.key === null
        ? ''
        : String(zone.key).trim();
      const regionId = zone?.region_id === undefined || zone?.region_id === null
        ? ''
        : String(zone.region_id).trim();

      if (!zone || !key || !zone.region || !regionId) {
        const name = String(zone?.name || 'La zona seleccionada').trim();
        return {
          valid: false,
          error: `No se puede continuar: ${name} no tiene una ubicación válida de Meta.`,
        };
      }
    }

    return { valid: true, error: null };
  }

  function updateSelectedZone(selectedIds, id, selected) {
    if (selected) selectedIds.add(id);
    else selectedIds.delete(id);
    return selectedIds;
  }

  function normalizeLocationQuery(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  const api = {
    buildMetaCities,
    buildSummaryNames,
    normalizeLocationQuery,
    updateSelectedZone,
    validateSelectedZones,
  };
  globalScope.CreditekMetaTargeting = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));

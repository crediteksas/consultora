(function initCreditekCampaignMetadata(globalScope) {
  const UNCLASSIFIED = 'Sin clasificar';

  function text(value) {
    return String(value || '').trim();
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function buildCampaignMetadata({
    campaignId,
    adsetId,
    adIds,
    selectedIds,
    zones,
    platform,
    createdBy,
    createdAt,
  }) {
    const cities = [];
    const seenKeys = new Set();

    for (const id of selectedIds || []) {
      const zone = zones?.[id];
      const key = text(zone?.key);
      if (!zone || !key || seenKeys.has(key)) continue;
      seenKeys.add(key);
      cities.push({
        key,
        name: text(zone.name),
        origin: String(id).startsWith('aliado_') ? 'aliados' : 'propias',
      });
    }

    return {
      campaign_id: text(campaignId),
      adset_id: text(adsetId),
      ad_ids: unique((adIds || []).map(text)),
      cities,
      origins: unique(cities.map(city => city.origin)),
      platform: text(platform) || UNCLASSIFIED,
      created_by: text(createdBy) || UNCLASSIFIED,
      created_at: text(createdAt) || new Date().toISOString(),
    };
  }

  function unclassifiedMetadata(campaignId) {
    return {
      campaign_id: campaignId,
      cities: [{ key: '__unclassified__', name: UNCLASSIFIED, origin: UNCLASSIFIED }],
      origins: [UNCLASSIFIED],
      platform: UNCLASSIFIED,
      classification: UNCLASSIFIED,
    };
  }

  function classifyCampaigns(campaigns, metadataMap = {}) {
    return (campaigns || []).map(campaign => ({
      ...campaign,
      creditek_metadata: metadataMap[campaign.campaign_id]
        ? {
          ...metadataMap[campaign.campaign_id],
          origins: unique(
            metadataMap[campaign.campaign_id].origins
              || metadataMap[campaign.campaign_id].cities?.map(city => city.origin)
              || [],
          ),
          classification: 'Clasificada',
        }
        : unclassifiedMetadata(campaign.campaign_id),
    }));
  }

  function filterCampaigns(campaigns, metadataMap = {}, filters = {}) {
    const cityKey = text(filters.cityKey);
    const platform = text(filters.platform);
    const origin = text(filters.origin);
    const seenCampaigns = new Set();

    return classifyCampaigns(campaigns, metadataMap).filter(campaign => {
      if (!campaign.campaign_id || seenCampaigns.has(campaign.campaign_id)) return false;
      const metadata = campaign.creditek_metadata;
      const matchesCity = !cityKey || metadata.cities.some(city => city.key === cityKey);
      const matchesPlatform = !platform || metadata.platform === platform;
      const matchesOrigin = !origin || metadata.origins.includes(origin);
      if (!matchesCity || !matchesPlatform || !matchesOrigin) return false;
      seenCampaigns.add(campaign.campaign_id);
      return true;
    });
  }

  function getMetadataFilterOptions(campaigns, metadataMap = {}) {
    const cityMap = new Map();
    const platforms = new Set();
    const origins = new Set();

    for (const campaign of classifyCampaigns(campaigns, metadataMap)) {
      const metadata = campaign.creditek_metadata;
      for (const city of metadata.cities) {
        if (!cityMap.has(city.key)) cityMap.set(city.key, city.name);
      }
      platforms.add(metadata.platform);
      metadata.origins.forEach(value => origins.add(value));
    }

    const sortText = (a, b) => a.localeCompare(b, 'es');
    return {
      cities: [...cityMap.entries()]
        .map(([key, name]) => ({ key, name }))
        .sort((a, b) => sortText(a.name, b.name)),
      platforms: [...platforms].sort(sortText),
      origins: [...origins].sort(sortText),
    };
  }

  function filterTrendSeries(series, metadataMap = {}, filters = {}) {
    return (series || []).map(point => ({
      ...point,
      data: filterCampaigns(
        Array.isArray(point.data) ? point.data : [],
        metadataMap,
        filters,
      ),
    }));
  }

  const api = {
    UNCLASSIFIED,
    buildCampaignMetadata,
    classifyCampaigns,
    filterCampaigns,
    filterTrendSeries,
    getMetadataFilterOptions,
  };
  globalScope.CreditekCampaignMetadata = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));

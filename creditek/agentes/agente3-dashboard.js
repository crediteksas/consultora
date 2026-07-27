(function initCreditekMetaDashboard(globalScope) {
  const CONVERSATION_ACTION_TYPES = new Set([
    'onsite_conversion.messaging_conversation_started_7d',
    'onsite_conversion.messaging_first_reply',
  ]);
  const LEAD_ACTION_TYPES = new Set([
    'lead',
    'onsite_conversion.lead_grouped',
    'offsite_conversion.fb_pixel_lead',
  ]);

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function integer(value) {
    return Math.trunc(number(value));
  }

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function addDays(date, amount) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + amount);
    return copy;
  }

  function getDateRanges(days, now = new Date()) {
    const safeDays = Math.max(1, integer(days));
    const until = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const since = addDays(until, -(safeDays - 1));
    const previousUntil = addDays(since, -1);
    const previousSince = addDays(previousUntil, -(safeDays - 1));

    return {
      current: { since: formatDate(since), until: formatDate(until) },
      previous: {
        since: formatDate(previousSince),
        until: formatDate(previousUntil),
      },
    };
  }

  function sumActions(actions, acceptedTypes) {
    return (actions || [])
      .filter(action => acceptedTypes.has(action.action_type))
      .reduce((total, action) => total + integer(action.value), 0);
  }

  function computeMetrics(source = {}) {
    const spend = number(source.spend);
    const impressions = integer(source.impressions);
    const clicks = integer(source.clicks);
    const reach = integer(source.reach);
    const conversations = sumActions(source.actions, CONVERSATION_ACTION_TYPES);
    const leads = sumActions(source.actions, LEAD_ACTION_TYPES);
    const results = conversations + leads;

    return {
      spend,
      impressions,
      clicks,
      reach,
      frequency: number(source.frequency),
      cpm: number(source.cpm),
      cpc: number(source.cpc),
      ctr: number(source.ctr),
      conversations,
      leads,
      results,
      cpr: results > 0 ? spend / results : 0,
    };
  }

  function hasMetricsData(source) {
    if (!source || typeof source !== 'object') return false;
    return [
      'spend',
      'impressions',
      'clicks',
      'reach',
      'frequency',
      'cpm',
      'cpc',
      'ctr',
      'actions',
    ].some(field => Object.prototype.hasOwnProperty.call(source, field));
  }

  function calculateBudget(spent, budget) {
    const safeSpent = Math.max(0, number(spent));
    const safeBudget = Math.max(0, number(budget));
    const percentage = safeBudget > 0 ? (safeSpent / safeBudget) * 100 : 0;

    return {
      spent: safeSpent,
      budget: safeBudget,
      percentage,
      barPercentage: Math.min(100, percentage),
      remaining: Math.max(0, safeBudget - safeSpent),
      overrun: Math.max(0, safeSpent - safeBudget),
    };
  }

  function additiveTotals(source = {}) {
    return {
      spend: number(source.spend),
      impressions: integer(source.impressions),
      clicks: integer(source.clicks),
    };
  }

  function aggregateCampaignInsights(campaignSources = []) {
    const totals = { spend: 0, impressions: 0, clicks: 0 };
    const actionTotals = new Map();

    for (const campaign of campaignSources) {
      totals.spend += number(campaign.spend);
      totals.impressions += integer(campaign.impressions);
      totals.clicks += integer(campaign.clicks);
      for (const action of campaign.actions || []) {
        const type = action.action_type;
        if (!type) continue;
        actionTotals.set(type, (actionTotals.get(type) || 0) + integer(action.value));
      }
    }

    return {
      ...totals,
      actions: [...actionTotals.entries()].map(([action_type, value]) => ({
        action_type,
        value,
      })),
    };
  }

  function reconcileCampaignTotals(accountSource, campaignSources = []) {
    const account = additiveTotals(accountSource);
    const campaigns = campaignSources.reduce((totals, campaign) => {
      const current = additiveTotals(campaign);
      totals.spend += current.spend;
      totals.impressions += current.impressions;
      totals.clicks += current.clicks;
      return totals;
    }, { spend: 0, impressions: 0, clicks: 0 });

    return {
      matches: (
        Math.abs(account.spend - campaigns.spend) < 0.01
        && account.impressions === campaigns.impressions
        && account.clicks === campaigns.clicks
      ),
      account,
      campaigns,
    };
  }

  const api = {
    aggregateCampaignInsights,
    calculateBudget,
    computeMetrics,
    getDateRanges,
    hasMetricsData,
    reconcileCampaignTotals,
  };
  globalScope.CreditekMetaDashboard = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : window));

export const PAYJOY_SOURCE='PAYJOY';
export const isPayJoyCustomerCheckResult=value=>Boolean(value&&typeof value.match==='boolean'&&value.source===PAYJOY_SOURCE&&value.checked_at);

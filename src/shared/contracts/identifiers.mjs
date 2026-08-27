export const normalizeCustomerId=value=>String(value??'').trim();
export const hasCustomerId=value=>normalizeCustomerId(value).length>0;

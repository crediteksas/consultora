export const PLATFORM_AVAILABILITY=Object.freeze({REAL:'REAL',PENDING_ADAPTER:'PENDING_ADAPTER',UNAVAILABLE:'UNAVAILABLE'});
export const NOVA_PLATFORMS=Object.freeze(['PAYJOY','ALO','ADDI','KREDIYA']);

export function createPlatformAuthorizationCheck(value={}){
  if(!NOVA_PLATFORMS.includes(value.platform))throw new Error('unsupported_platform');
  return Object.freeze({
    platform:value.platform,
    match:Boolean(value.match),
    contract_status:value.contract_status||'UNKNOWN',
    balance:value.balance??null,
    payment_history:value.payment_history??null,
    signal:value.signal||'YELLOW',
    reason_codes:Object.freeze([...(value.reason_codes||[])]),
    checked_at:value.checked_at||null,
    availability:value.availability||PLATFORM_AVAILABILITY.UNAVAILABLE
  });
}

export const pendingPlatformChecks=()=>['ALO','ADDI','KREDIYA'].map(platform=>createPlatformAuthorizationCheck({platform,availability:PLATFORM_AVAILABILITY.PENDING_ADAPTER,signal:'YELLOW',reason_codes:['PENDING_ADAPTER']}));

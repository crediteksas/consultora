import {PLATFORM_CODES} from './contract.mjs';
export const createPlatformLink=({customer_id,platform,external_reference})=>{
  if(!PLATFORM_CODES.includes(platform))throw new Error('unsupported_platform');
  return Object.freeze({customer_id,platform,external_reference});
};

import {execFileSync} from 'node:child_process';
export const createMacOSKeychainProvider=({service='creditek-payjoy-api',account='comercial@crediteksas.com'}={})=>async()=>execFileSync('security',['find-generic-password','-s',service,'-a',account,'-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();

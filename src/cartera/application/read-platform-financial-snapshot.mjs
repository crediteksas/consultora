import {hasCustomerId} from '../../shared/contracts/identifiers.mjs';
export class ReadPlatformFinancialSnapshot{
  constructor({snapshots}={}){this.snapshots=snapshots;}
  execute(customer_id,platform){if(!hasCustomerId(customer_id))return null;return this.snapshots.find(customer_id,platform);}
}

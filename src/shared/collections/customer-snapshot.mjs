export function createCollectionsCustomerSnapshot(value={}){
  return Object.freeze({has_active_issue:Boolean(value.has_active_issue),collections_signal:value.collections_signal||'NO_AVAILABLE',updated_at:value.updated_at||null});
}

export function isExplicitServiceConsent(value: unknown): boolean;
export function isExplicitRejection(value: unknown): boolean;
export function isPublicStoreInfoRequest(value: unknown): boolean;
export function isAllianceRequest(value: unknown): boolean;
export function isAdvisorContactQuestion(value: unknown): boolean;
export function shouldSuppressAutomatedFollowup(input?: {
  funnelState?: unknown;
  lastCustomerText?: unknown;
}): boolean;

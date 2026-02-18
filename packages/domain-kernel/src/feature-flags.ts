export type DomainFeatureFlags = {
  kernelUnifiedDomain: boolean;
  localOutboxEnabled: boolean;
  localReadModelEnabled: boolean;
  syncV2Enabled: boolean;
};

export const defaultDomainFeatureFlags: DomainFeatureFlags = {
  kernelUnifiedDomain: false,
  localOutboxEnabled: false,
  localReadModelEnabled: false,
  syncV2Enabled: false,
};

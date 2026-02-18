import {
  defaultDomainFeatureFlags,
  type DomainFeatureFlags,
} from "@life-os/domain-kernel";

function readBooleanEnv(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return fallback;
}

export type KernelFeatureFlags = DomainFeatureFlags & {
  aiSuggestionSchedulingEnabled: boolean;
};

export const kernelFeatureFlags: KernelFeatureFlags = {
  kernelUnifiedDomain: readBooleanEnv(
    "KERNEL_UNIFIED_DOMAIN",
    defaultDomainFeatureFlags.kernelUnifiedDomain,
  ),
  localOutboxEnabled: readBooleanEnv(
    "LOCAL_OUTBOX_ENABLED",
    defaultDomainFeatureFlags.localOutboxEnabled,
  ),
  localReadModelEnabled: readBooleanEnv(
    "LOCAL_READ_MODEL_ENABLED",
    defaultDomainFeatureFlags.localReadModelEnabled,
  ),
  syncV2Enabled: readBooleanEnv(
    "SYNC_V2_ENABLED",
    defaultDomainFeatureFlags.syncV2Enabled,
  ),
  aiSuggestionSchedulingEnabled: readBooleanEnv(
    "AI_SUGGESTION_SCHEDULING_ENABLED",
    true,
  ),
};

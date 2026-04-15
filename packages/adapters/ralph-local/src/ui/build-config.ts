import type { CreateConfigValues } from "@paperclipai/adapter-utils";

export function buildRalphLocalConfig(v: CreateConfigValues): Record<string, unknown> {
  const ac: Record<string, unknown> = {};
  const schemaVals = v.adapterSchemaValues as Record<string, unknown> | undefined;
  if (schemaVals?.hatCollection) ac.hatCollection = schemaVals.hatCollection;
  if (schemaVals?.defaultHat) ac.defaultHat = schemaVals.defaultHat;
  if (schemaVals?.ralphPath) ac.ralphPath = schemaVals.ralphPath;
  if (schemaVals?.maxLoops !== undefined) ac.maxLoops = schemaVals.maxLoops;
  if (schemaVals?.maxConcurrency !== undefined) ac.maxConcurrency = schemaVals.maxConcurrency;
  if (schemaVals?.enableMemoryBank !== undefined) ac.enableMemoryBank = schemaVals.enableMemoryBank;
  return ac;
}

import type { AdapterConfigFieldsProps } from "../types";
import {
  Field,
  DraftInput,
  DraftNumberInput,
  ToggleField,
} from "../../components/agent-config-primitives";
import { ChoosePathButton } from "../../components/PathInstructionsModal";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

export function RalphLocalConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
}: AdapterConfigFieldsProps) {
  // Ralph-specific fields are stored in adapterSchemaValues for create mode
  const ralphValues = values as (Record<string, unknown> & { adapterSchemaValues?: Record<string, unknown> }) | null;
  const schemaVals = (isCreate ? ralphValues?.adapterSchemaValues : null) as Record<string, unknown> | null | undefined;

  function getCreateVal(key: string): string {
    return String(schemaVals?.[key] ?? "");
  }

  function getCreateNum(key: string): number {
    return Number(schemaVals?.[key] ?? 0);
  }

  function getCreateBool(key: string): boolean {
    return schemaVals?.[key] !== false;
  }

  function setCreateVal(key: string, val: unknown) {
    if (!set) return;
    const prev = (ralphValues?.adapterSchemaValues ?? {}) as Record<string, unknown>;
    set({ adapterSchemaValues: { ...prev, [key]: val } } as Parameters<typeof set>[0]);
  }

  return (
    <>
      <Field label="Hat collection">
        <DraftInput
          value={isCreate ? getCreateVal("hatCollection") : eff("adapterConfig", "hatCollection", String(config.hatCollection ?? ""))}
          onCommit={(v) =>
            isCreate
              ? setCreateVal("hatCollection", v)
              : mark("adapterConfig", "hatCollection", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder="default"
        />
      </Field>

      <Field label="Default hat">
        <DraftInput
          value={isCreate ? getCreateVal("defaultHat") : eff("adapterConfig", "defaultHat", String(config.defaultHat ?? ""))}
          onCommit={(v) =>
            isCreate
              ? setCreateVal("defaultHat", v)
              : mark("adapterConfig", "defaultHat", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder="main"
        />
      </Field>

      <Field label="Ralph CLI path">
        <div className="flex items-center gap-2">
          <DraftInput
            value={isCreate ? getCreateVal("ralphPath") : eff("adapterConfig", "ralphPath", String(config.ralphPath ?? ""))}
            onCommit={(v) =>
              isCreate
                ? setCreateVal("ralphPath", v)
                : mark("adapterConfig", "ralphPath", v || undefined)
            }
            immediate
            className={inputClass}
            placeholder="ralph"
          />
          <ChoosePathButton />
        </div>
      </Field>

      <Field label="Max loops">
        {isCreate ? (
          <input
            type="number"
            className={inputClass}
            value={getCreateNum("maxLoops")}
            onChange={(e) => setCreateVal("maxLoops", Number(e.target.value))}
            placeholder="0 (unlimited)"
          />
        ) : (
          <DraftNumberInput
            value={eff("adapterConfig", "maxLoops", Number(config.maxLoops ?? 0))}
            onCommit={(v) => mark("adapterConfig", "maxLoops", v || undefined)}
            immediate
            className={inputClass}
          />
        )}
      </Field>

      <Field label="Max concurrent tasks">
        {isCreate ? (
          <input
            type="number"
            className={inputClass}
            value={getCreateNum("maxConcurrency")}
            onChange={(e) => setCreateVal("maxConcurrency", Number(e.target.value))}
            placeholder="1"
          />
        ) : (
          <DraftNumberInput
            value={eff("adapterConfig", "maxConcurrency", Number(config.maxConcurrency ?? 1))}
            onCommit={(v) => mark("adapterConfig", "maxConcurrency", v || undefined)}
            immediate
            className={inputClass}
          />
        )}
      </Field>

      <ToggleField
        label="Enable memory bank"
        checked={
          isCreate
            ? getCreateBool("enableMemoryBank")
            : eff("adapterConfig", "enableMemoryBank", config.enableMemoryBank !== false)
        }
        onChange={(v) =>
          isCreate
            ? setCreateVal("enableMemoryBank", v)
            : mark("adapterConfig", "enableMemoryBank", v)
        }
      />
    </>
  );
}


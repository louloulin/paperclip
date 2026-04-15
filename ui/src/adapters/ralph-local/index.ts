import type { UIAdapterModule } from "../types";
import { parseProcessStdoutLine } from "../process/parse-stdout";
import { RalphLocalConfigFields } from "./config-fields";
import { buildRalphLocalConfig } from "@paperclipai/adapter-ralph-local/ui";

export const ralphLocalUIAdapter: UIAdapterModule = {
  type: "ralph_local",
  label: "Ralph Orchestrator",
  parseStdoutLine: parseProcessStdoutLine,
  ConfigFields: RalphLocalConfigFields,
  buildAdapterConfig: buildRalphLocalConfig,
};

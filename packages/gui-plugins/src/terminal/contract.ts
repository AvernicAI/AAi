import { Contract, type MountedSession } from "@opencode/plugin/gui"

/** Reveals the original agent shell jobs in the existing terminal panel. */
export const AgentTerminal = Contract.define<
  {
    open(session: MountedSession): void
  },
  "terminal.agent"
>("terminal.agent")

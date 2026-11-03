import { allThemes } from "@opencode/tui/theme"
import { Effect, Option } from "effect"
import { EOL } from "node:os"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"

export default Runtime.handler(Commands.commands.themes, (input) =>
  Effect.sync(() => {
    const filter = Option.getOrUndefined(input.filter)?.trim().toLowerCase() ?? ""
    const themes = Object.keys(allThemes()).filter((id) => id.includes(filter)).sort()
    process.stdout.write((input.format === "json" ? JSON.stringify(themes) : themes.join(EOL)) + EOL)
  }),
)

import { Effect, Option } from "effect"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { openUrl } from "../../ui/prompt"

export default Runtime.handler(
  Commands.commands.devin,
  Effect.fn("cli.devin")(function* (input) {
    const session = Option.getOrUndefined(input.session)

    if (input.action === "session" && (!session || !/^devin-[a-zA-Z0-9-]+$/.test(session)))
      return yield* Effect.fail(new Error("Supply a Devin Cloud session ID, such as devin-123, to aai devin session."))

    if (input.action !== "session" && session)
      return yield* Effect.fail(new Error("A Devin Cloud session ID is only accepted by aai devin session."))

    if (input.action === "bots") {
      const url = "https://app.devin.ai/bots"
      process.stdout.write(url + "\n")
      return yield* openUrl(url)
    }

    const executable = Bun.which(process.env.OPENCODE_DEVIN_PATH || "devin")

    if (!executable)
      return yield* Effect.fail(
        new Error("Install the official Devin CLI or set OPENCODE_DEVIN_PATH to its executable."),
      )

    const args = session ? ["--cloud", "--resume", session] : ["auth", "login"]
    const code = yield* Effect.tryPromise(
      () => Bun.spawn([executable, ...args], { stdin: "inherit", stdout: "inherit", stderr: "inherit" }).exited,
    )

    if (code !== 0) process.exitCode = code
  }),
)

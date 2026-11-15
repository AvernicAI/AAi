import { randomUUID } from "node:crypto"
import { execFile, spawn } from "node:child_process"
import { promisify, stripVTControlCharacters } from "node:util"
import type { TaskUpdate } from "./contract"

export function startTask(input: {
  command: string
  directory: string
  emit: (value: typeof TaskUpdate.Type) => void
}) {
  if (!input.command.trim()) throw new Error("ide.command")
  const id = randomUUID()
  const lifetime = { stopped: false, exited: false }
  const closed = Promise.withResolvers<void>()

  const child = spawn(input.command, {
    cwd: input.directory,
    shell: true,
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "0" },
  })

  const emit = (text: string, status: typeof TaskUpdate.Type.status = "running", code: number | null = null) =>
    input.emit({ id, command: input.command, text: stripVTControlCharacters(text), status, code })

  emit("")
  child.stdout.setEncoding("utf8").on("data", (text: string) => emit(text))
  child.stderr.setEncoding("utf8").on("data", (text: string) => emit(text))
  child.on("error", (error) => emit(error.message + "\n"))
  child.on("close", (code) => {
    lifetime.exited = true
    emit("", lifetime.stopped ? "stopped" : code === 0 ? "completed" : "failed", code)
    closed.resolve()
  })

  return {
    id,
    closed: closed.promise,
    running: () => !lifetime.exited,
    async stop() {
      if (lifetime.exited) return
      lifetime.stopped = true
      const pid = child.pid

      if (!pid) return closed.promise
      const kill = () => (process.platform === "win32" ? child.kill("SIGKILL") : process.kill(-pid, "SIGKILL"))

      const timer = setTimeout(() => {
        void Promise.try(kill).catch(() => undefined)
      }, 2000)

      await (
        process.platform === "win32"
          ? promisify(execFile)("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true })
          : Promise.try(() => process.kill(-pid, "SIGTERM"))
      ).catch(() => child.kill())
      await closed.promise.finally(() => clearTimeout(timer))
    },
  }
}

export type Task = ReturnType<typeof startTask>

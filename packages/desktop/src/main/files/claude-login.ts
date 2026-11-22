import { spawn } from "node:child_process"
import { homedir } from "node:os"

// Only this fixed authentication command can launch. No renderer-provided shell text or credentials are accepted.
export function claudeLoginCommand(platform: NodeJS.Platform) {
  if (platform === "win32")
    return { command: "cmd.exe", args: ["/d", "/c", "start", '""', "cmd.exe", "/d", "/k", "claude", "auth", "login"] }

  if (platform === "darwin")
    return {
      command: "osascript",
      args: ["-e", 'tell application "Terminal"\nactivate\ndo script "claude auth login"\nend tell'],
    }

  return { command: "x-terminal-emulator", args: ["-e", "claude", "auth", "login"] }
}

export function launchClaudeLogin() {
  const command = claudeLoginCommand(process.platform)

  return new Promise<boolean>((resolve) => {
    const child = spawn(command.command, command.args, {
      cwd: homedir(),
      stdio: "ignore",
      windowsHide: true,
      windowsVerbatimArguments: process.platform === "win32",
      detached: true,
    })

    child.once("error", () => resolve(false))
    child.once("spawn", () => {
      child.unref()
      resolve(true)
    })
  })
}

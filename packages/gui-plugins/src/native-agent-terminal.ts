import { spawn } from "node:child_process"
import { homedir } from "node:os"

/** Launches a visible terminal for an explicit click. Callers supply fixed argument lists. */
export function launchAgentTerminal(executable: string, args: readonly string[]) {
  const command = terminalCommand(executable, args)

  return new Promise<boolean>((resolve) => {
    const child = spawn(command.file, command.args, {
      cwd: homedir(),
      detached: true,
      stdio: "ignore",
      windowsHide: process.platform === "win32",
      windowsVerbatimArguments: process.platform === "win32",
    })

    child.once("error", () => resolve(false))
    child.once("spawn", () => {
      child.unref()
      resolve(true)
    })
  })
}

function terminalCommand(executable: string, args: readonly string[]) {
  if (process.platform === "win32") {
    const script = "& " + [executable, ...args].map((arg) => "'" + arg.replaceAll("'", "''") + "'").join(" ")

    return {
      file: "cmd.exe",
      // START gives PowerShell a fresh interactive console when Electron has no console handles.
      args: [
        "/d",
        "/c",
        "start",
        '""',
        "powershell.exe",
        "-NoProfile",
        "-NoExit",
        "-EncodedCommand",
        Buffer.from(script, "utf16le").toString("base64"),
      ],
    }
  }

  if (process.platform === "darwin") {
    const script = [executable, ...args].map((arg) => "'" + arg.replaceAll("'", "'\\''") + "'").join(" ")

    return { file: "osascript", args: ["-e", 'tell application "Terminal" to do script ' + JSON.stringify(script)] }
  }

  return { file: "x-terminal-emulator", args: ["-e", executable, ...args] }
}

import path from "node:path"

/** Quotes one executable path for a desktop entry's `Exec=` line. */
export function autostartExec(command: string) {
  return `"${command.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}

export function autostartFilePath(configHome: string, appID: string) {
  return path.join(configHome, "autostart", `${appID}.desktop`)
}

/** Linux has no login-item API, so the app writes the XDG autostart entry itself. */
export function autostartEntry(input: { name: string; exec: string }) {
  return [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${input.name}`,
    `Exec=${input.exec}`,
    "Terminal=false",
    "X-GNOME-Autostart-enabled=true",
    "",
  ].join("\n")
}

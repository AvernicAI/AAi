import { fileURLToPath } from "node:url"
import path from "node:path"

export function shouldRevealLocalFile(value: string) {
  // A link in model/tool output is not permission to execute a program or an OS shortcut.
  const name = path.basename(value).replace(/[. ]+$/, "")

  return (
    name.includes(":") ||
    !path.extname(name) ||
    /\.(?:exe|com|bat|cmd|ps1|psm1|psd1|vbs|vbe|vb|js|jse|wsf|wsh|hta|msi|msp|msix|appx|lnk|url|scf|reg|scr|cpl|msc|appref-ms|application|sh|command|app|desktop|run|py|pyw|rb|pl|php|jar|gadget|diagcab|settingcontent-ms)$/i.test(
      name,
    )
  )
}

export function resolveExternalURL(value: string) {
  if (!URL.canParse(value)) return undefined
  const url = new URL(value)

  if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") return url.href

  return undefined
}

export function resolveLocalFilePath(value: string) {
  if (!URL.canParse(value)) return undefined
  const url = new URL(value)

  if (url.protocol !== "file:" || url.hostname) return undefined

  try {
    return fileURLToPath(url)
  } catch {
    return undefined
  }
}

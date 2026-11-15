const modifiers = new Map([
  ["commandorcontrol", "CommandOrControl"],
  ["cmdorctrl", "CommandOrControl"],
  ["command", "Command"],
  ["cmd", "Command"],
  ["control", "Control"],
  ["ctrl", "Control"],
  ["alt", "Alt"],
  ["option", "Alt"],
  ["shift", "Shift"],
  ["super", "Super"],
  ["meta", "Super"],
])

const namedKeys = new Map([
  ["space", "Space"],
  ["tab", "Tab"],
  ["enter", "Enter"],
  ["return", "Enter"],
  ["escape", "Escape"],
  ["esc", "Escape"],
  ["backspace", "Backspace"],
  ["delete", "Delete"],
  ["insert", "Insert"],
  ["home", "Home"],
  ["end", "End"],
  ["pageup", "PageUp"],
  ["pagedown", "PageDown"],
  ["up", "Up"],
  ["down", "Down"],
  ["left", "Left"],
  ["right", "Right"],
  ["plus", "Plus"],
  ["comma", "Comma"],
  ["minus", "Minus"],
  ["period", "Period"],
  ["slash", "Slash"],
  ["backslash", "Backslash"],
  ["semicolon", "Semicolon"],
  ["quote", "Quote"],
  ["backquote", "Backquote"],
  ["bracketleft", "BracketLeft"],
  ["bracketright", "BracketRight"],
])

/**
 * Canonicalizes an accelerator and rejects the ones `globalShortcut.register` would refuse or
 * silently drop: unmodified plain keys, unknown modifiers, duplicates, and malformed key names.
 * Returning undefined lets the caller report a typed problem instead of registering nothing.
 */
export function parseAccelerator(input: string): string | undefined {
  if (input.length === 0 || input.length > 64) return undefined

  const parts = input.split("+").map((part) => part.trim())

  if (parts.length < 2 || parts.some((part) => part.length === 0)) return undefined

  const key = acceleratorKey(parts.at(-1) ?? "")

  if (!key) return undefined

  const seen = new Set<string>()
  const canonical: string[] = []

  for (const part of parts.slice(0, -1)) {
    const modifier = modifiers.get(part.toLowerCase())

    if (!modifier || seen.has(modifier)) return undefined
    seen.add(modifier)
    canonical.push(modifier)
  }

  return [...canonical, key].join("+")
}

function acceleratorKey(input: string): string | undefined {
  if (/^[a-z0-9]$/i.test(input)) return input.toUpperCase()

  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(input)) return input.toUpperCase()

  return namedKeys.get(input.toLowerCase())
}

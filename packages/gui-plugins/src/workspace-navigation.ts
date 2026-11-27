import type { WebContents } from "electron"

export function guardWorkspaceNavigation(
  contents: WebContents,
  topLevel: (url: string) => boolean,
  frame: (url: string) => boolean,
) {
  contents.on("will-frame-navigate", (event) => {
    if (!(event.isMainFrame ? topLevel : frame)(event.url)) event.preventDefault()
  })
  contents.on("will-redirect", (event) => {
    if (!(event.isMainFrame ? topLevel : frame)(event.url)) event.preventDefault()
  })
}

import { For } from "solid-js"
import { PromptContext } from "@opencode/gui-extensions/sdk"
import { Contribution } from "./render"
import { useExtensionHost } from "./host"

/** Controls from the same contributions whose text the composer captures when submitting. */
export function ExtensionPromptControls() {
  const host = useExtensionHost()

  return (
    <For each={host.items(PromptContext)}>
      {(item) => <Contribution extension={item.extension}>{() => item.value.render()}</Contribution>}
    </For>
  )
}

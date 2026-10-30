import { For } from "solid-js"
import { PromptContext } from "@opencode/plugin/gui"
import { Contribution } from "./render"
import { usePluginHost } from "./host"

/** Controls from the same contributions whose text the composer captures when submitting. */
export function ExtensionPromptControls() {
  const host = usePluginHost()

  return (
    <For each={host.items(PromptContext)}>
      {(item) => <Contribution plugin={item.plugin}>{() => item.value.render()}</Contribution>}
    </For>
  )
}

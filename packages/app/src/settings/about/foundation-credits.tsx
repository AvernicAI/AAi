import { createResource } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { ExternalLink } from "@/runtime/platform/external-link"
import legal from "./legal.svg"
import anomalyBrush from "./anomaly-brush.svg"
import { FALLBACK_OTHER_CONTRIBUTORS, loadOtherContributorCount } from "./contributors"

const writers = [
  "thdxr",
  "adamdotdev",
  "rekram1-node",
  "kitlangton",
  "iamdavidhill",
  "jayair",
  "fwang",
  "brendonovich",
  "nexxeln",
  "hona",
  "kommander",
  "jlongster",
  "vimtor",
  "r44vcorp",
  "simonklee",
  "arvsrn",
] as const

const illustrators = ["usrnk1", "ludvigrask_", "arvsrn", "iamdavidhill"] as const

/** Original contributor acknowledgements retained in the third-party notices. */
export function FoundationCredits() {
  const language = useLanguage()
  const platform = usePlatform()

  const [otherContributors] = createResource(() => loadOtherContributorCount(platform.fetch ?? fetch), {
    initialValue: FALLBACK_OTHER_CONTRIBUTORS,
  })

  const credit = (name: string) => (
    <bdi dir="ltr">
      <ExternalLink href={profile(name)}>{name}</ExternalLink>
    </bdi>
  )

  const writerCredits = () => [
    ...writers.map(credit),
    <ExternalLink href="https://github.com/anomalyco/opencode/graphs/contributors">
      {language.plural("settings.about.otherContributor", otherContributors.latest, {
        count: otherContributors.latest,
      })}
    </ExternalLink>,
  ]

  return (
    <section class="settings-about-content">
      <div class="settings-about-credits">
        <p>{language.rich("settings.about.writtenByNames", { names: language.list(writerCredits()) })}</p>
        <p>{language.rich("settings.about.illustratedByNames", { names: language.list(illustrators.map(credit)) })}</p>
      </div>
      <div class="settings-about-publication">
        <p>{language.t("settings.about.firstPublished")}</p>
        <p>{language.t("settings.about.firstIllustrated")}</p>
      </div>
      <p>
        <ExternalLink href="https://opencode.ai">{language.t("settings.about.website")}</ExternalLink>
      </p>
      <p>{language.t("settings.about.trademark")}</p>
      <p>{language.t("settings.about.tagline")}</p>
      <img class="settings-about-legal" src={legal} alt="" />
      <div class="settings-about-copyright">
        <p>{language.t("settings.about.copyright")}</p>
        <img class="settings-about-anomaly-brush" src={anomalyBrush} alt="" />
      </div>
    </section>
  )
}

function profile(name: string) {
  if (name === "r44vcorp") return "https://github.com/R44VC0RP"

  if (name === "ludvigrask_") return "https://x.com/ludvigrask_"

  return `https://github.com/${name}`
}

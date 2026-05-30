# Audio sourcing — Freesound candidates

Candidate sound assets from [freesound.org](https://freesound.org) for the cues
defined in `src/ui/audio/audioManifest.ts`. This is a shortlist to audition, not
a final selection — every entry must still be opened, checked, and listened to
before use.

## Before you download

- **License.** Prefer **CC0** (no attribution, safest for distribution). Filter
  any Freesound search to CC0 via the left sidebar, or append
  `&f=license:"Creative Commons 0"` to a search URL. **CC-BY** is fine but you
  must keep a credits/attribution list. **Avoid NonCommercial (NC)** licenses.
  Licenses below are NOT verified — confirm the badge on each page.
- **Editing.** Most are raw recordings. Trim/normalise to the manifest's needs:
  tight one-shots (no leading silence), and **seamless loops** for `loop: true`
  beds (crowd ambience + music). Where a cue lists a `variants` count, slice
  multiple takes from one longer recording.
- **Drop location.** Final files go under `public/audio/...` at the exact path in
  each manifest asset's `file` field (Vite serves them at `/The-Rugby-Manager/audio/…`).

## Best-value packs

These cover ~20 cues between them:

- [Breviceps – Clicks, Buttons & UI](https://freesound.org/people/Breviceps/packs/25371/) — most `ui.*` cues
- [SilverIllusionist – Cinematic Stings](https://freesound.org/people/SilverIllusionist/packs/35496/) — TMO verdict + season stingers
- [SilverIllusionist – Video Game Victory Fanfare](https://freesound.org/people/SilverIllusionist/packs/35507/) — champion / award / win music
- One stadium-ambience recording + one referee-whistle clip cover the whole
  crowd-bed + whistle set.

---

## Whistle
One pea-whistle source, trimmed into the five cues.

| Cue(s) | Candidates |
|---|---|
| `whistle.stoppage`, `whistle.penalty`, `whistle.try` | [Pablo-F – referee-whistle](https://freesound.org/people/Pablo-F/sounds/90743/) · [SpliceSound – Referee whistle, gymnasium](https://freesound.org/people/SpliceSound/sounds/218318/) · [strongbot – metal whistle (tongued attack)](https://freesound.org/people/strongbot/sounds/568995/) |
| `whistle.half_time`, `whistle.full_time` | [Robinhood76 – end of match referee whistle](https://freesound.org/people/Robinhood76/sounds/692545/) |

## Crowd beds (loop — author seamless)

| Cue | Candidates |
|---|---|
| `crowd.bed.idle` / `crowd.bed.engaged` | [Dan_AudioFile – Football-match large-crowd ambience (stereo)](https://freesound.org/people/Dan_AudioFile/sounds/654085/) · [stomachache – Stadium Crowd](https://freesound.org/people/stomachache/sounds/274516/) · [GregorQuendel – Crowd Ambience and Cheering](https://freesound.org/people/GregorQuendel/sounds/481775/) |
| `crowd.bed.tension` | [soundslikewillem – Crowd in Anticipation of Show](https://freesound.org/people/soundslikewillem/sounds/193062/) |

## Crowd reactions (one-shots)

| Cue | Candidates |
|---|---|
| `crowd.try.routine` / `crowd.try.huge` | [paulw2k – Football-crowd-GOAL](https://freesound.org/people/paulw2k/sounds/196461/) · [SoundsExciting – Crowd Cheering](https://freesound.org/people/SoundsExciting/sounds/365132/) · [FoolBoyMedia – Crowd Cheer](https://freesound.org/people/FoolBoyMedia/sounds/397434/) |
| `crowd.goal.success` | [Tomlija – small crowd cheering & clapping 3](https://freesound.org/people/Tomlija/sounds/100904/) · [AlaskaRobotics – cheering and clapping crowd 1](https://freesound.org/people/AlaskaRobotics/sounds/221568/) |
| `crowd.goal.miss` / `crowd.groan` | [unchaz – Disappointed_Crowd](https://freesound.org/people/unchaz/sounds/150956/) · [mrrap4food – crowd "oh" disappointed](https://freesound.org/people/mrrap4food/sounds/619007/) · [FritzSounds – A Few Groans Of Disappointment](https://freesound.org/people/FritzSounds/sounds/366297/) |
| `crowd.surge.linebreak` / `crowd.oooh.bighit` | [noah0189 – Crowd Ooohs and Ahhhs in Excitement](https://freesound.org/people/noah0189/sounds/264499/) · [Quistard – Near miss Ooh (stadium)](https://freesound.org/people/Quistard/sounds/237682/) |
| `crowd.cheer.turnover` | [paulw2k – Football-crowd Cheer+Jeers](https://freesound.org/people/paulw2k/sounds/196463/) |
| `crowd.clap_build` | [deleted_user_5205523 – Medium Indoor Crowd Clapping (loop)](https://freesound.org/people/deleted_user_5205523/sounds/340355/) · [IllusiaProductions – Crowd clapping](https://freesound.org/people/IllusiaProductions/sounds/249938/) |
| `crowd.gasp.card` | [RadioCounseling – Crowd gasp](https://freesound.org/people/RadioCounseling/sounds/635110/) · [dreamstobecome – gasps small crowd](https://freesound.org/people/dreamstobecome/sounds/439258/) |

## Impacts (pitch sounds — layer a thud + a grunt)

| Cue | Candidates |
|---|---|
| `impact.tackle.soft` / `impact.tackle.hard` | [MPooman – Soccer Tackle Sounds (HQ)](https://freesound.org/people/MPooman/sounds/662107/) · [JakLocke – Bodies impacting surfaces (pack)](https://freesound.org/people/JakLocke/packs/16039/) · [lipalearning – male grunt](https://freesound.org/people/lipalearning/sounds/427972/) |
| `impact.scrum.engage` / `impact.scrum.collapse` / `impact.maul.drive` | [MrFossy – Male Grunts and Screams (pack)](https://freesound.org/people/MrFossy/packs/30826/) layered with the JakLocke body-impact pack |
| `impact.boot.punt` | [volivieri – soccer kick 01](https://freesound.org/people/volivieri/sounds/37156/) · [bittermelonheart – Soccer Ball Kick](https://freesound.org/s/555042/) · [Zabuhailo – soccer shot and goal](https://freesound.org/people/Zabuhailo/sounds/166110/) |

> `impact.lineout.throw` and `impact.post` had no clean dedicated hit — easiest to
> slice a short whoosh and a metal-pole clank from a generic impact pack, or
> generate via ElevenLabs.

## TMO drone + verdict stings

| Cue | Candidates |
|---|---|
| `stinger.tmo.review` (loop) | [reacthor – Drone of suspense](https://freesound.org/s/130982/) · [Hybrid_V – Horror-Suspense Drone Texture](https://freesound.org/people/Hybrid_V/sounds/320830/) · [Eponn – Tension Buildup Drone](https://freesound.org/people/Eponn/sounds/617765/) |
| `stinger.tmo.no_card` / `yellow` / `red` | [SilverIllusionist – Cinematic Stings (pack)](https://freesound.org/people/SilverIllusionist/packs/35496/) · [SilverIllusionist – Dramatic Sting](https://freesound.org/people/SilverIllusionist/sounds/830184/) · [EminYILDIRIM – Cinematic Boom Impact](https://freesound.org/people/EminYILDIRIM/sounds/553418/) (red) · [Jofae – Cinematic Low Pitch Impact](https://freesound.org/people/Jofae/sounds/408141/) |

## UI

| Cue | Candidates |
|---|---|
| `ui.click.primary` / `back` / `toggle` / `slider` | [Breviceps – Clicks, Buttons & UI (pack)](https://freesound.org/people/Breviceps/packs/25371/) · [el_boss – UI Button Click](https://freesound.org/people/el_boss/sounds/677861/) · [Jummit – Soft UI Button Click](https://freesound.org/people/Jummit/sounds/528561/) · [cabled_mess – Minimal UI Sounds](https://freesound.org/people/cabled_mess/sounds/370962/) |
| `ui.confirm` / `ui.notify` | [FoolBoyMedia – Up Chime 4](https://freesound.org/people/FoolBoyMedia/sounds/352669/) · [hykenfreak – Notification Chime](https://freesound.org/people/hykenfreak/sounds/202029/) · [Headphaze – Completed Status Alert](https://freesound.org/people/Headphaze/sounds/277031/) |
| `ui.error` | [FoolBoyMedia – Alert Chime 2](https://freesound.org/people/FoolBoyMedia/sounds/352658/) · [SamsterBirdies – Beeps, tones & UI (pack)](https://freesound.org/people/SamsterBirdies/packs/32730/) |

## Music beds (loop) — mostly CC-BY, verify attribution

| Cue | Candidates |
|---|---|
| `music.home` / `music.prematch` | [joshuaempyre – Epic Orchestra LOOP](https://freesound.org/people/joshuaempyre/sounds/250856/) · [X3nus – Epic Finale (loop)](https://freesound.org/people/X3nus/sounds/449935/) · [AudioCoffee – Emotional Motivational Cinematic (loop)](https://freesound.org/people/AudioCoffee/sounds/728746/) |
| `music.hub` | [orangefreesounds – Lounge Ambient Music Loop](https://freesound.org/people/orangefreesounds/sounds/242080/) · [ViraMiller – Relaxing Ambient Melodies](https://freesound.org/people/ViraMiller/sounds/744214/) · [PatrickLieberkind – Calm Background Organ](https://freesound.org/people/PatrickLieberkind/sounds/214334/) |
| `music.result.win` / `music.result.loss` | [SilverIllusionist – Video Game Victory Fanfare (pack)](https://freesound.org/people/SilverIllusionist/packs/35507/) (win) · [AudioCoffee – Cinematic Inspiring Piano (loop)](https://freesound.org/people/AudioCoffee/sounds/721951/) (loss) |
| `music.transfer` | No perfect hit — layer a clock tick under [Eponn – Tension Buildup Drone](https://freesound.org/people/Eponn/sounds/617765/), or generate via ElevenLabs |

## Season stingers

| Cue | Candidates |
|---|---|
| `stinger.playoff_reveal` | [EminYILDIRIM – Cinematic Boom Impact](https://freesound.org/people/EminYILDIRIM/sounds/553418/) · [Robinhood76 – strong cinematic hit](https://freesound.org/people/Robinhood76/sounds/178834/) · [SilverIllusionist – Orchestral Hit 2](https://freesound.org/people/SilverIllusionist/sounds/580820/) |
| `stinger.champion` / `stinger.award` | [humanoide9000 – Victory Fanfare](https://freesound.org/people/humanoide9000/sounds/466133/) · [Sheyvan – Orchestral Victory Fanfare](https://freesound.org/people/Sheyvan/sounds/470083/) · [FunWithSound – Success Fanfare Trumpets](https://freesound.org/people/FunWithSound/sounds/456966/) |
| `stinger.budget.up` / `stinger.signing.success` | [GowlerMusic – Cash Register](https://freesound.org/people/GowlerMusic/sounds/360453/) · [Fratz – ding](https://freesound.org/people/Fratz/sounds/239966/) · [FoolBoyMedia – Up Chime 4](https://freesound.org/people/FoolBoyMedia/sounds/352669/) |
| `stinger.budget.down` / `stinger.bid.lost` | A descending sting from the [SilverIllusionist – Cinematic Stings pack](https://freesound.org/people/SilverIllusionist/packs/35496/) (pitch a verdict sting down) |
| `stinger.retired` / `stinger.injury` | Wistful: [PatrickLieberkind – Calm Background Organ](https://freesound.org/people/PatrickLieberkind/sounds/214334/); concern: short low slice of [reacthor – Drone of suspense](https://freesound.org/s/130982/) |

---

## Weak-fit cues to revisit

These had no clean Freesound match — best generated in ElevenLabs (prompts already
in the manifest) or sliced from a generic pack:

- `impact.lineout.throw` (light whoosh)
- `impact.post` (metal-upright clank)
- `music.transfer` (ticking deadline-day bed)

## Coverage

Every Tier-1 and Tier-2 cue has at least one candidate. Generation in ElevenLabs
remains the fallback for the three weak-fit cues above and for any clip whose
license doesn't clear.

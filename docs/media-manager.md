# Media Manager

Source of truth for the media-story generator — the "noise around the game". After each of the player's club fixtures, one generated, light-and-snarky media take (newspaper / podcast / TV pundit / YouTuber / journalist-on-X) lands in the inbox, reacting to the result, a standout/flop player, the team's style vs its identity, the crowd, or mounting pressure on the manager. **Pure flavour — zero gameplay effect** (no morale, form, results, or reputation impact). The whole point is colour.

Lives in `src/game/media/`.

## Files

| File | Role |
|---|---|
| `mediaManager.ts` | The engine. Context types (`MediaMatchContext`, `MediaPlayer`, `MediaPredictionContext`), the weighted archetype **selector**, the slot **assembler**, per-archetype builders, and the two entry points `generateMatchStory` / `generateSeasonPrediction`. Pure + deterministic. |
| `phrases.ts` | The **phrase bank** — flat `readonly string[]` pools by category (clichés, result framings, style/DNA, crowd, manager pressure, predictions). Data only, no logic. Grow freely. |
| `personas.ts` | The recurring (fictional) media cast + per-`Register` opener / sign-off pools. |

## How a story is built

```
generateMatchStory(ctx)
  → makeRng(ctx.seed)                       // standalone seeded RNG
  → score candidate archetypes (weighted)   // result / player / style / crowd / manager
  → weighted-pick one
  → build {subject, body} from slot pools    // phrases.ts
  → pick a persona, wrap in its voice        // personas.ts
  → MediaStory
```

Freshness is **combinatorial, not template-final**: a story is assembled from independent slot pools (framing clause → cliché(s) → stat callout → verdict) and then rendered through one of a dozen persona voices (opener + byline + sign-off). The effective space is the pools multiplied together × personas × live data (scoreline, player name, attendance), so the bank stays fresh far longer than a flat list of finished sentences. **To expand it, just add fragments to the relevant array in `phrases.ts`** — no logic change.

## Archetypes & triggers

The selector scores every eligible archetype by newsworthiness, then weighted-picks one (`result` is the always-eligible floor, so there's always ~1 story/round):

| Archetype | Fires when | Notes |
|---|---|---|
| **Result reaction** | always eligible | upset / statement / thrashing / narrow / capitulation / gallant-loss, chosen by margin + `expectedToWin` + tries. |
| **Player focus** | a club player's match rating is notably high or low | gated by **age**: young+good → hype + maturity; young+poor → distraction; veteran+good → resurgence; veteran+poor → decline; mid → in-form / criticism. A position/role-appropriate cliché is layered on (playmaker → rugby-IQ/composure; quick back with a break → pace; forward → physical/set-piece; high tackle count → defence). |
| **Style / DNA** | the match was played markedly with or against the club's `suggestedTactics` identity | expansive praise / kick criticism / lost-identity / won-ugly, from `teamTries` + `teamSummary.kicksFromHand` vs the DNA. |
| **Crowd** | home game with fill rate ≥97% or <65% | great-atmosphere vs empty-seats (+ optional cost-of-living line). |
| **Manager pressure** | a loss with ≥2 losses in the last 3 | "natives are restless". |
| **Pre-season prediction** | week 1 only (derived in the inbox, not persisted) | framed by `boardAmbition`: title / playoffs / mid-table / struggle. |

## Determinism (critical)

The media RNG is a **standalone `makeRng(seed)` stream** (`src/utils/rng.ts`), independent of the four shared streams. The per-fixture seed is `hashSeed(state.seed, round, clubId)`; the prediction seed is `hashSeed(state.seed, 'prediction', clubId)`. This means a media draw **cannot consume or perturb the career (`rngTransfer`) stream** — so it can never shift transfer / injury / rollover outcomes, and `npm run verify` (season determinism) stays green. Same `(state.seed, round, club)` always yields the same story.

## Integration points

- **Generation:** `GameCoordinator.publishMediaStory(...)`, called from `recordPlayerMatchResult` after the human fixture's `FIXTURE_RESULT_RECORDED`. Builds `MediaMatchContext` from the live `MatchSnapshot` (exact per-player ratings — not recoverable from saved `results`, which is why generation happens here and the output is persisted), the `FixtureResult` (score / tries / attendance), the club's `suggestedTactics`, and the roster (age via `getAge`, position, marquee).
- **Mutation seam:** one `MEDIA_STORY_PUBLISHED` `SeasonEvent` variant → pushes onto `state.league.mediaStories`. Reset to `[]` at `SEASON_INITIALIZED` and `SEASON_ROLLED_OVER`.
- **Persistence:** `SavedSeason.mediaStories?` (additive optional — **no `SAVE_VERSION` bump**). `toSavePayload` serialises them; `fromSave` restores each via `MEDIA_STORY_PUBLISHED` (they aren't replayable from `results`). Parsed/validated in `SaveManager.parseSavedGame`.
- **Surface:** `inbox.ts` `buildAssistantReport` — a new `'media'` `InboxItem` category. Surfaces the latest round's story (priority 18) plus the week-1 prediction (priority 22). `InboxScreen` renders the `'media'` category with the **Media** heading; no new screen.

## Tone

PG / snarky by design — hype, decline jibes, style digs, crowd jeers, cheeky off-field nudges (haircuts, socials, brand deals). Deliberately avoids genuinely dark real-world angles (mental-health pile-ons, personal/family attacks). All personas and outlets are invented.

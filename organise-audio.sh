#!/bin/bash
# organise-audio.sh
# Copies & renames downloaded Freesound files into the correct public/audio/ folders.
# Run from the The-Rugby-Manager project root:
#   bash organise-audio.sh

set -e

DL="$HOME/Downloads"
DEST="$(dirname "$0")/public/audio"

echo "→ Creating audio folder structure..."
mkdir -p "$DEST/whistle" "$DEST/crowd" "$DEST/impact" "$DEST/stinger" "$DEST/ui" "$DEST/music"

echo "→ Unzipping packs if needed..."

# Breviceps UI pack
if [ -f "$DL/25371__breviceps__clicks-buttons-ui-sounds.zip" ]; then
  mkdir -p "$DL/breviceps_ui"
  unzip -o "$DL/25371__breviceps__clicks-buttons-ui-sounds.zip" -d "$DL/breviceps_ui" > /dev/null
fi

# JakLocke body impacts pack (may be two zips — deduplicate)
for z in "$DL"/16039__jaklocke__bodies-impacting-surfaces*.zip; do
  [ -f "$z" ] && unzip -o "$z" -d "$DL/jaklocke_impacts" > /dev/null 2>&1
done

# MrFossy grunts pack
if [ -f "$DL/30826__mrfossy__voice-male-grunts-and-screams.zip" ]; then
  mkdir -p "$DL/mrfossy_grunts"
  unzip -o "$DL/30826__mrfossy__voice-male-grunts-and-screams.zip" -d "$DL/mrfossy_grunts" > /dev/null
fi

echo "→ Copying whistle files..."
# Pablo-F original whistle (stoppage/penalty/try variants)
cp "$DL/90743__pablo-f__referee-whistle.wav"            "$DEST/whistle/stoppage.mp3" 2>/dev/null && echo "  whistle/stoppage.mp3 ✓" || echo "  MISSING: 90743 pablo-f referee-whistle"
# SpliceSound CC0 whistle (half-time / full-time)
cp "$DL/218318__splicesound__referee-whistle-blow-gymnasium.wav" "$DEST/whistle/half-time.mp3" 2>/dev/null && echo "  whistle/half-time.mp3 ✓" || echo "  MISSING: 218318 splicesound referee-whistle"

# Note: penalty.mp3, try.mp3, full-time.mp3 — slice these from the same whistle source files above
echo "  NOTE: whistle/penalty.mp3, try.mp3, full-time.mp3 → trim from the source files above in your audio editor"

echo "→ Copying crowd bed files..."
cp "$DL/654085__dan_audiofile__football-match-cheering-large-crowd_ambience-stereo.wav" "$DEST/crowd/bed-idle.mp3" 2>/dev/null && echo "  crowd/bed-idle.mp3 ✓" || echo "  MISSING: 654085 dan_audiofile crowd bed"
# bed-engaged = same source, use a different section
cp "$DL/654085__dan_audiofile__football-match-cheering-large-crowd_ambience-stereo.wav" "$DEST/crowd/bed-engaged.mp3" 2>/dev/null && echo "  crowd/bed-engaged.mp3 ✓ (same source — trim different section)"
echo "  NOTE: crowd/bed-tension.mp3 → ElevenLabs (no clean Freesound source)"

echo "→ Copying crowd reaction files..."
cp "$DL/196461__paulw2k__football-crowd-goal.wav"       "$DEST/crowd/try-routine.mp3" 2>/dev/null && echo "  crowd/try-routine.mp3 ✓" || echo "  MISSING: 196461 paulw2k crowd goal"
cp "$DL/397434__foolboymedia__crowd-cheer.wav"          "$DEST/crowd/try-huge.mp3" 2>/dev/null && echo "  crowd/try-huge.mp3 ✓" || echo "  MISSING: 397434 foolboymedia crowd cheer"
cp "$DL/397434__foolboymedia__crowd-cheer.wav"          "$DEST/crowd/goal-success.mp3" 2>/dev/null && echo "  crowd/goal-success.mp3 ✓ (same source as try-huge — trim shorter)"

# Quistard Saint Mary's Stadium files
cp "$DL/237679__quistard__football-crowd-goal-ch"*".wav" "$DEST/crowd/goal-miss.mp3" 2>/dev/null || \
cp "$DL"/237679__quistard__*.wav                         "$DEST/crowd/goal-miss.mp3" 2>/dev/null && echo "  crowd/goal-miss.mp3 ✓" || echo "  MISSING: quistard 237679"

cp "$DL/237683__quistard__football-crowd-near-mi"*".wav" "$DEST/crowd/groan.mp3" 2>/dev/null || \
cp "$DL"/237683__quistard__*.wav                          "$DEST/crowd/groan.mp3" 2>/dev/null && echo "  crowd/groan.mp3 ✓" || echo "  MISSING: quistard 237683"

cp "$DL/237678__quistard__football-crowd-goal-ch"*".wav" "$DEST/crowd/surge-linebreak.mp3" 2>/dev/null || \
cp "$DL"/237678__quistard__*.wav                          "$DEST/crowd/surge-linebreak.mp3" 2>/dev/null && echo "  crowd/surge-linebreak.mp3 ✓" || echo "  MISSING: quistard 237678"

cp "$DL/237675__quistard__football-crowd-3-near-"*".wav" "$DEST/crowd/oooh-bighit.mp3" 2>/dev/null || \
cp "$DL"/237675__quistard__*.wav                          "$DEST/crowd/oooh-bighit.mp3" 2>/dev/null && echo "  crowd/oooh-bighit.mp3 ✓" || echo "  MISSING: quistard 237675"

cp "$DL/237682__quistard__football-crowd-near-mi"*".wav" "$DEST/crowd/cheer-turnover.mp3" 2>/dev/null || \
cp "$DL"/237682__quistard__*.wav                          "$DEST/crowd/cheer-turnover.mp3" 2>/dev/null && echo "  crowd/cheer-turnover.mp3 ✓" || echo "  MISSING: quistard 237682"

# clap-build — use the minute-silence quistard file (any remaining one)
echo "  NOTE: crowd/clap-build.mp3 → use the Quistard minute-silence file from the pack (rename manually)"
echo "  NOTE: crowd/gasp-card.mp3 → ElevenLabs (no clean Freesound source)"

echo "→ Copying impact files..."
cp "$DL/662107__mpooman__mpooman-soccer-tackle-sounds-se462-high-quality.mp3" "$DEST/impact/tackle-soft.mp3" 2>/dev/null && echo "  impact/tackle-soft.mp3 ✓" || echo "  MISSING: 662107 mpooman tackle"
cp "$DL/662107__mpooman__mpooman-soccer-tackle-sounds-se462-high-quality.mp3" "$DEST/impact/tackle-hard.mp3" 2>/dev/null && echo "  impact/tackle-hard.mp3 ✓ (same source — use harder hit from pack)"

# JakLocke + MrFossy for scrum/maul — copy pack folder contents for manual selection
if [ -d "$DL/jaklocke_impacts" ]; then
  cp "$DL/jaklocke_impacts"/*.wav "$DEST/impact/" 2>/dev/null && echo "  JakLocke impacts extracted to impact/ — pick & rename scrum-engage, scrum-collapse, maul-drive"
fi
if [ -d "$DL/mrfossy_grunts" ]; then
  cp "$DL/mrfossy_grunts"/*.wav "$DEST/impact/" 2>/dev/null && echo "  MrFossy grunts extracted to impact/ — pick & rename for scrum/maul layering"
fi

cp "$DL/37156__volivieri__soccer-kick-01.wav"           "$DEST/impact/boot-punt.mp3" 2>/dev/null && echo "  impact/boot-punt.mp3 ✓" || echo "  MISSING: 37156 volivieri soccer kick"
cp "$DL/166110__zabuhailo__soccershot-and-goal.wav"     "$DEST/impact/boot-punt-2.mp3" 2>/dev/null && echo "  impact/boot-punt-2.mp3 ✓ (trim kick at start, cut Russian speech)" || echo "  MISSING: 166110 zabuhailo"

echo "  NOTE: impact/lineout-throw.mp3 → ElevenLabs"
echo "  NOTE: impact/post.mp3 → ElevenLabs"

echo "→ Copying TMO stinger files..."
cp "$DL/830184__silverillusionist__dramatic-sting-sudden-realization.wav" "$DEST/stinger/tmo-no-card.mp3" 2>/dev/null && echo "  stinger/tmo-no-card.mp3 ✓" || echo "  MISSING: 830184 silverillusionist dramatic sting"
cp "$DL/830184__silverillusionist__dramatic-sting-sudden-realization.wav" "$DEST/stinger/tmo-yellow.mp3" 2>/dev/null && echo "  stinger/tmo-yellow.mp3 ✓ (same source — use different section/pitch)"
cp "$DL/553418__eminyildirim__cinematic-boom-impact-hit-2021.wav"          "$DEST/stinger/tmo-red.mp3" 2>/dev/null && echo "  stinger/tmo-red.mp3 ✓" || echo "  MISSING: 553418 eminyildirim boom impact"
cp "$DL/408141__jofae__cinematic-low-pitch-impact.mp3"                     "$DEST/stinger/tmo-red-alt.mp3" 2>/dev/null && echo "  stinger/tmo-red-alt.mp3 ✓" || echo "  MISSING: 408141 jofae low pitch"
echo "  NOTE: stinger/tmo-review.mp3 → ElevenLabs (drone loop)"

echo "→ Copying UI files..."
# Breviceps pack — copy all and note which to use
if [ -d "$DL/breviceps_ui" ]; then
  cp "$DL/breviceps_ui"/*.wav "$DEST/ui/" 2>/dev/null
  cp "$DL/breviceps_ui"/*.mp3 "$DEST/ui/" 2>/dev/null
  echo "  Breviceps pack extracted to ui/ — pick & rename: click-primary, click-back, toggle, slider"
fi
cp "$DL/352669__foolboymedia__up-chime-4.mp3"   "$DEST/ui/confirm.mp3" 2>/dev/null && echo "  ui/confirm.mp3 ✓" || echo "  MISSING: 352669 foolboymedia up-chime"
cp "$DL/352669__foolboymedia__up-chime-4.mp3"   "$DEST/ui/notify.mp3" 2>/dev/null && echo "  ui/notify.mp3 ✓ (same source — confirm and notify can share or use different trim)"
cp "$DL/352658__foolboymedia__alert-chime-2.mp3" "$DEST/ui/error.mp3" 2>/dev/null && echo "  ui/error.mp3 ✓" || echo "  MISSING: 352658 foolboymedia alert-chime"

echo "→ Copying music files..."
cp "$DL/449935__x3nus__epic-finale-loop.wav"    "$DEST/music/home.mp3" 2>/dev/null && echo "  music/home.mp3 ✓" || echo "  MISSING: 449935 x3nus epic finale"
cp "$DL/449935__x3nus__epic-finale-loop.wav"    "$DEST/music/prematch.mp3" 2>/dev/null && echo "  music/prematch.mp3 ✓ (same source as home — swap later)"
echo "  NOTE: music/hub.mp3, music/result-win.mp3, music/result-loss.mp3, music/transfer.mp3 → ElevenLabs or find alternatives"

echo "→ Copying season stinger files..."
cp "$DL/466133__humanoide9000__victory-fanfare.wav"       "$DEST/stinger/champion.mp3" 2>/dev/null && echo "  stinger/champion.mp3 ✓" || echo "  MISSING: 466133 humanoide9000 victory fanfare"
cp "$DL/470083__sheyvan__music-orchestral-victory-fanfare.wav" "$DEST/stinger/award.mp3" 2>/dev/null && echo "  stinger/award.mp3 ✓" || echo "  MISSING: 470083 sheyvan orchestral fanfare"
cp "$DL/456966__funwithsound__success-fanfare-trumpets.mp3" "$DEST/stinger/signing-success.mp3" 2>/dev/null && echo "  stinger/signing-success.mp3 ✓" || echo "  MISSING: 456966 funwithsound success fanfare"
cp "$DL/360453__gowlermusic__cash-register.wav"            "$DEST/stinger/budget-up.mp3" 2>/dev/null && echo "  stinger/budget-up.mp3 ✓" || echo "  MISSING: 360453 gowlermusic cash register"
cp "$DL/580820__silverillusionist__orchestral-hit-2.m4a"   "$DEST/stinger/playoff-reveal.mp3" 2>/dev/null && echo "  stinger/playoff-reveal.mp3 ✓" || echo "  MISSING: 580820 silverillusionist orchestral hit"
cp "$DL/553418__eminyildirim__cinematic-boom-impact-hit-2021.wav" "$DEST/stinger/budget-down.mp3" 2>/dev/null && echo "  stinger/budget-down.mp3 ✓ (pitch down in audio editor)"
echo "  NOTE: stinger/bid-lost.mp3 → pitch-down a SilverIllusionist sting from the pack"
echo "  NOTE: stinger/retired.mp3, stinger/injury.mp3 → ElevenLabs"
echo "  NOTE: stinger/takeover.mp3 → ElevenLabs"

echo ""
echo "════════════════════════════════════════════"
echo "Done! Check above for any MISSING files."
echo ""
echo "Manual steps still needed:"
echo "  1. Trim/rename whistle variants (penalty.mp3, try.mp3, full-time.mp3)"
echo "  2. Pick correct files from Breviceps pack in ui/ and rename"
echo "  3. Pick/rename JakLocke + MrFossy files for scrum-engage, scrum-collapse, maul-drive"
echo "  4. Trim boot-punt-2.mp3 (cut speech, keep kick)"
echo "  5. Trim crowd bed variants from dan_audiofile source"
echo "  6. ElevenLabs: tmo-review, bed-tension, gasp-card, lineout-throw, post, music beds, retired, injury, takeover, bid-lost"
echo "════════════════════════════════════════════"

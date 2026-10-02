#!/bin/bash
# Veo 3.1 image-to-video for every story shot. Re-run one: ./shots.sh 04a-momo
cd "$(dirname "$0")/../.." || exit 1
G=../.claude/skills/twist-ad/scripts/gen.mjs; K=public/ads/next-time/key; V=public/ads/next-time/clips
NEG="music, soundtrack, subtitles, captions, on-screen text, watermark, morphing faces, extra fingers, cartoon, CGI, plastic skin, slow motion"
FILM="Shot on 35mm film, natural light, real documentary feel, subtle handheld."
declare -A P=(
 [01-altar]="Very slow push-in towards the framed photograph. Incense smoke drifts upward, the butter lamp flames flicker gently. Nothing else moves. $FILM Audio: quiet hall room tone, faint distant traffic, a soft murmur of mourners. No speech, no music."
 [02-hall]="Locked-off wide shot with subtle handheld drift. The man at the microphone stands solemnly, glances down at his folded paper, then up at the mourners. The ceiling fan turns slowly; a woman in the second row dabs her eye with a handkerchief. $FILM Audio: quiet hall ambience, ceiling fan hum, one soft cough. No speech, no music."
 [03-suresh-mic]="Slow push-in on the man at the microphone. He pauses, lowers his eyes, slowly unfolds the sheet of paper and looks down at it for a moment, then looks back up at the audience with a pained, sincere, deadpan expression. $FILM Audio: hall room tone, paper rustling. No speech, no music."
 [04a-momo]="Warm handheld. The waiter's hand sets the small black bill folder down on the table. The man with the big moustache and Dhaka topi pats his shirt pockets, finds nothing, shrugs, grins broadly and points at his friend, saying cheerfully in a Nepali accent: \"Next time, pakka!\" $FILM Audio: busy restaurant chatter, clinking plates, his one line of dialogue."
 [04b-chiya]="Handheld street shot. In the background the man with the moustache and Dhaka topi waves cheerfully and walks off into the crowd without looking back. The man with glasses watches him go with a completely blank face, holding two glasses of tea, while the stall owner's open palm waits for payment. $FILM Audio: street traffic, motorbike horns, tea stall clatter. No speech, no music."
 [04c-petrol]="The man in the passenger seat pretends to sleep, then very slowly cracks one eye open to peek at his friend paying outside, then quickly shuts it again and fake-snores. Outside, the friend hands rupee notes to the attendant. $FILM Audio: petrol pump whirr, street traffic, a small fake snore. No speech, no music."
 [04d-birthday]="A waiter's hand slides the bill in front of the man in the paper birthday hat. He looks down at it, then slowly turns his head to look at the empty chair beside him, where a cloth napkin flutters down onto the seat. Friends laughing in the background. $FILM Audio: restaurant chatter and laughter. No speech, no music."
 [06-mourners]="Very slow push-in past the microphone towards the seated mourners. Every one of them, almost in unison, solemnly unfolds a small piece of paper, reads it, and nods gravely. Completely deadpan. $FILM Audio: paper rustling, quiet room tone. No speech, no music."
 [10a-door]="Static low-angle shot from doormat height. The man in the doorway freezes mid-sip, staring down at the puppy. The puppy tilts its head to one side. $FILM Audio: morning birds, a distant temple bell, a small puppy whine. No speech, no music."
 [10b-puppy]="Static high-angle point-of-view shot. The puppy with the black curled moustache marking stares up into the lens, slowly tilts its head, then gives one small bark. The moustache marking stays exactly the same. $FILM Audio: morning birds, one small puppy bark. No speech, no music."
 [10c-suresh]="Static low-angle close-up. The man stares down, frozen and deadpan, then slowly pulls the small folded paper out of his t-shirt pocket and unfolds it without taking his eyes off the camera. $FILM Audio: morning birds, paper rustle. No speech, no music."
)
mkdir -p $V
for id in "${@:-${!P[@]}}"; do
  node $G video $V/$id.mp4 "${P[$id]}" --image $K/$id.png --dur 8 --res 1080p --neg "$NEG" > $V/$id.log 2>&1 &
  sleep 20  # Veo rate limit: stagger submissions (gen.mjs also retries 429s)
done
wait; tail -n1 $V/*.log

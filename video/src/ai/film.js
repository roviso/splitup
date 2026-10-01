// Voice and music direction for the Smart Split film (used by scripts/voice.mjs and scripts/music.mjs with FILM=ai).

export const voicePrompt = (transcript) => `# AUDIO PROFILE
A warm, natural narrator in their late twenties, speaking straight to one friend. Conversational and a little playful, never salesy.

## THE SCENE
A product film for Split-Up, a bill-splitting app for friends in Nepal, introducing its new AI feature, Smart Split.

## DIRECTOR'S NOTES
- Opening: fond and lively, smiling on "the whole gang". Honour the emotion tags in brackets; never read them aloud.
- The second paragraph is a list that speeds up and gets more exasperated, landing flat and deflated on "the calculator".
- "Put the calculator away." is quiet and confident, after a short breath.
- The product section is calm, clear and unhurried. Let "to the paisa" land.
- The invite lines are playful, like letting a friend in on a trick.
- "before the tea gets cold" slows down, with a smile.
- The install lines are clear, simple instructions, like helping a friend over their shoulder.
- The last line is warm, in three even beats, then the web address, slowly.
- Leave a short natural pause between paragraphs. Keep one consistent voice for the whole read.
- Pronounce "momo" as "moh-moh", "chowmein" as "chow-mayn", "paisa" as "pie-sah", "Splitup" as "split-up", "thimitech" as "thimmy-tech".

## TRANSCRIPT
${transcript}`;

export const musicPrompt = (at, total) => `Instrumental music bed for a ${Math.round(total)}-second modern app film. No vocals, no lyrics.
Warm, playful, premium; clean modern production with a subtle South Asian colour (soft madal hand-drum pattern and a gentle bansuri-like flute motif), felt piano, plucks and airy pads. Around 108 BPM.
Structure, timed to the voiceover:
- 0 to ${at('sad')} s: light and bouncy, happy pluck groove with hand percussion.
- ${at('sad')} to ${at('turn')} s: groove drops out, sparse and slightly melancholic, lots of space.
- ${at('turn')} s: near silence, then a short riser and a confident lift into the main theme at ${at('reveal')} s.
- ${at('reveal')} to ${at('payoff')} s: steady, calm, uplifting groove that sits under a narrator (leave the midrange clear).
- ${at('payoff')} to ${at('soon')} s: a small joyful swell.
- ${at('soon')} to ${at('cta')} s: light and simple, lots of space for spoken instructions.
- ${at('cta')} s to the end: a warm final chorus, then a clean resolved ending at ${Math.round(total)} s.`;

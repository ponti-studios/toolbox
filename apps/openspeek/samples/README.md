# OpenSpeek voice samples

One sample clip per [Deepgram Flux](https://developers.deepgram.com/docs/flux-tts/voices)
voice, so you can audition a voice before committing to it. Every clip reads the
same ~150-word narration passage at the default speed, so voices are directly
comparable.

Each file is `flux-<voice>-en.m4a` (e.g. `gemma.m4a` for `flux-gemma-en`). The
clips ship inside the `@ponti-studios/openspeek` npm package.

Listen in a terminal:

```
open apps/openspeek/samples/gemma.m4a
```

Or list every voice with its sample and description:

```
openspeek --voices
```

Regenerate them all (requires an `OPENROUTER_API_KEY`):

```
for v in hannah kit alexis cliff sienna cole brooke colin gemma haley heather \
         miles sean bree brittany bruce conor donovan drew elise jack kai \
         kelsey maeve marcelo marcus meena meghan naveen paige priya rufus \
         sharon tanner wade wes; do
  openspeek -q -m deepgram/flux-tts:free -v "flux-$v-en" snippet.md "$PWD/$v.m4a"
done
```

The narration passage used (`snippet.md`):

```
# Chapter One

The harbor at dawn was quiet, the gulls still asleep on the pilings. Ada pulled
her coat tighter and watched the tide slide in, patient as a held breath. She
had spent seven years running from this town. Now she was back, and the water
remembered her name.

"Come on in," her father said from the doorway, voice thin with age. "Coffee's
still hot."

She stepped inside. The kitchen smelled of woodsmoke and old newspapers, the
same as it had the day she left.
```

# Pocket Guitar

A touch-friendly guitar instrument for the browser, built with a real-time Karplus-Strong physical modeling synth on the Web Audio API. Zero dependencies, no audio samples—just open and play.

## Highlights

- **Split-Deck Mobile Layout**: Fret notes or pick chords in the upper deck while strumming and plucking strings over the soundhole below.
- **Fretboard & Chords Modes**:
  - **Fretboard**: Multi-touch across 6 strings (`6E`–`1E`) and 5 frets, with per-string open/mute (`✕`) nut toggles, interactive chord fingering guides, and a **Latch** toggle to hold shapes hands-free.
  - **Chords**: 12 essential chord pads (`C`, `G`, `Am`, `F`, `Em`, `D`, `Dm`, `E7`, `A`, `G7`, `Cadd9`, `Bm`) showing chord tones and fret voicings.
- **Ergonomic Fit**:
  - **Neck Width & Alignment**: Scale string spacing (`50%`–`100%`) and dock the neck (`L` / `C` / `R`) so large phones feel like a real fretboard.
  - **Left-Handed Mode (`Lefty`)**: Flips string order (`6E→1E` ⇄ `1E→6E`), chord diagrams, and strum direction.
- **Synth & Rig Controls**:
  - Three voicings (`Acoustic`, `Clean`, `Overdrive`), `Capo` (`0` to `+5`), and master volume with instant mute.
  - Layout and audio settings persist automatically in `localStorage`.

## Keyboard Controls

| Key | Action |
| :--- | :--- |
| `1` – `9` | Latch chord (`C`, `G`, `Am`, `F`, `Em`, `D`, `Dm`, `E7`, `A`) |
| `Space` / `↓` | Downstroke |
| `↑` | Upstroke |
| `Q` `W` `E` `R` `T` `Y` | Pluck individual strings (left to right) |

## Running Locally

Open `index.html` in any modern browser, or serve the folder with a static file server.

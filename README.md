# Pocket Guitar 🎸

A mobile-first guitar practice web application powered by a Web Audio API Karplus-Strong physical modeling synthesizer. Runs directly in any modern browser with zero external dependencies or audio sample files.

## Features

- **Two Play Modes**
  - **Fretboard Mode**: Press directly on the 6 strings (`6E`–`1E`) across frets `1`–`5` with multi-touch support. Includes chord shape guides (`C`, `G`, `Am`, `F`, `Em`, `D`, `Dm`, `E7`), a **Hold** latch mode for one-handed or desktop play, and per-string open/mute (`✕`) nut toggles.
  - **Chords Mode**: Tap any of 12 common chord pads (`C`, `G`, `Am`, `F`, `Em`, `D`, `Dm`, `E7`, `A`, `G7`, `Cadd9`, `Bm`) to automatically fret the voicing and focus on strumming in the lower area.
- **Interactive Strum & Picking Zone**
  - Swipe horizontally across the strings over the soundhole to strum, or tap individual strings to pick arpeggios with standing-wave visual string vibration.
- **Ergonomic Sizing & Left-Handed Support**
  - **Adjustable String Spacing (`Width`)**: Narrow the neck width (`50%`–`100%`) and align it (`L` / `C` / `R`) so large smartphone screens match realistic guitar string spacing.
  - **Left-Handed (`Lefty`) Mode**: One-tap toggle to mirror string order (`6E→1E` ⇄ `1E→6E`), chord voicings, and pickguard orientation.
- **Sound & Capo Controls**
  - Master volume slider (`0%`–`100%`) with one-tap mute button.
  - Three built-in tones (`Acoustic`, `Clean`, `Overdrive`) and `Capo 0`–`+5` transposition.
  - Preferences (`Vol`, `Mute`, `Width`, `Align`, `Lefty`) are automatically persisted in `localStorage`.

## Keyboard Shortcuts (Desktop)

- `1`–`9`: Select chords (`C`, `G`, `Am`, `F`, `Em`, `D`, `Dm`, `E7`, `A`)
- `Space` or `↓`: Down Strum / `↑`: Up Strum
- `Q` `W` `E` `R` `T` `Y`: Pluck individual strings from left to right

## Usage

Open `index.html` directly in a web browser or serve the directory with any static HTTP server.


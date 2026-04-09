# duee

A calm, native macOS app for tracking due-date tasks with a compact floating UI.

## Why duee

`duee` is intentionally narrow and lightweight:

- quick add flow: date + task text
- closest due dates first
- one-click completion
- optional minimal mode to hide completed tasks
- persistent local storage with SwiftData
- translucent, always-on-top utility window

## Features

- Native SwiftUI + SwiftData macOS app
- Compact overlay-style window with custom minimize behavior
- Keyboard-friendly input (`Return` to add)
- Status-aware due labels (for active tasks):
  - `due 4/10 • today`
  - `due 4/10 • in 3 days`
  - `due 4/10 • 2 days late`
- Completed tasks show plain due date only
- Right-click task menu with delete
- Settings for:
  - Minimal mode
  - Unfocused transparency
  - Appearance (`System`, `Light`, `Dark`)

## Tech Stack

- Swift 6
- SwiftUI
- SwiftData
- AppKit interop for window behavior

## Project Structure

- `Sources/Duee/App`:
  app entry point, window lifecycle, appearance/transparency handling
- `Sources/Duee/Models`:
  `DueeTask` SwiftData model
- `Sources/Duee/Views`:
  root view, settings view, task composer, task row
- `Sources/Duee/Settings`:
  settings keys and appearance mode enum
- `Sources/Duee/Preview`:
  in-memory preview seed data

## Run Locally

```bash
swift build
open Package.swift
```

Then run the `Duee` target from Xcode.

## License

MIT. See [LICENSE](LICENSE).

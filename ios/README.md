# SwiftUI Diagram Toolbar

This folder contains a **native SwiftUI** recreation of the diagram tool palette from the web app, matching the screenshot’s layout, padding, and blur.

## Layout and spacing (from screenshot)

| Element | Value |
|--------|--------|
| **Pill** | Height 48pt, corner radius 24pt (full pill), width 232pt |
| **Material** | `.ultraThinMaterial` (frosted glass) |
| **Toolbar padding** | Horizontal 14pt, vertical 8pt |
| **Button spacing** | 9pt between buttons |
| **Buttons** | 32×32pt, corner radius 9pt (squircle), white ~95% opacity |
| **Pull-tab** | 30×22pt, corner radius 8pt, white fill, light border, soft shadow |
| **6-dot icon** | Centered in tab, scale 0.8 for breathing room |

## Usage

1. Add `DiagramToolbarView.swift` to your Xcode project (iOS 17+ for `#Preview`; use a `PreviewProvider` on older targets if needed).
2. Use the view in your SwiftUI hierarchy:
   ```swift
   DiagramToolbarView()
   ```
3. The preview shows the toolbar on a light gray background.

## Notes

- Buttons are placeholders (empty actions). Wire `Button { }` to your own handlers.
- Drag handle is visual only; add a `@GestureState` / `DragGesture` if you need drag-to-reposition.
- Colors match the web palette (e.g. pen `#007AFF`, segment colors for the color wheel).

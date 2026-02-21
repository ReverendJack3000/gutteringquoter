//
//  DiagramToolbarView.swift
//  Quote App – SwiftUI recreation of diagram tool palette
//  Matches layout, padding, and blur from the web diagram toolbar.
//

import SwiftUI

// MARK: - Main view

struct DiagramToolbarView: View {
    private let pillHeight: CGFloat = 48
    private let tabHeight: CGFloat = 22
    private let paletteWidth: CGFloat = 232

    var body: some View {
        ZStack(alignment: .top) {
            toolPalettePill
                .offset(y: tabHeight)
            dragHandleTab
        }
        .frame(width: paletteWidth, height: tabHeight + pillHeight)
    }

    // MARK: - Tool palette (pill)

    private var toolPalettePill: some View {
        HStack(spacing: 9) {
            penButton
            minusButton
            gridButton
            plusButton
            colorWheelButton
            minusButton
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .frame(height: pillHeight)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: pillHeight / 2))
        .overlay(
            RoundedRectangle(cornerRadius: pillHeight / 2)
                .strokeBorder(Color.white.opacity(0.5), lineWidth: 0.5)
        )
        .shadow(color: .black.opacity(0.08), radius: 12, x: 0, y: 4)
    }

    // MARK: - Buttons (squircle, ~32pt)

    private var penButton: some View {
        Button {} label: {
            Image(systemName: "pencil.tip")
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(Color(red: 0/255, green: 122/255, blue: 1))
        }
        .frame(width: 32, height: 32)
        .background(Color.white.opacity(0.95), in: RoundedRectangle(cornerRadius: 9))
    }

    private var minusButton: some View {
        Button {} label: {
            Image(systemName: "minus")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Color(white: 0.35))
        }
        .frame(width: 32, height: 32)
        .background(Color.white.opacity(0.95), in: RoundedRectangle(cornerRadius: 9))
    }

    private var gridButton: some View {
        Button {} label: {
            Image(systemName: "square.grid.2x2")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Color(white: 0.35))
        }
        .frame(width: 32, height: 32)
        .background(Color.white.opacity(0.95), in: RoundedRectangle(cornerRadius: 9))
    }

    private var plusButton: some View {
        Button {} label: {
            Image(systemName: "plus")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Color(white: 0.35))
        }
        .frame(width: 32, height: 32)
        .background(Color.white.opacity(0.95), in: RoundedRectangle(cornerRadius: 9))
    }

    private var colorWheelButton: some View {
        Button {} label: {
            ColorWheelIcon()
                .frame(width: 20, height: 20)
        }
        .frame(width: 32, height: 32)
        .background(Color.white.opacity(0.95), in: RoundedRectangle(cornerRadius: 9))
    }

    // MARK: - Drag handle (pull-tab)

    private var dragHandleTab: some View {
        RoundedRectangle(cornerRadius: 8)
            .fill(.white)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(Color(white: 0.88), lineWidth: 1)
            )
            .overlay(
                GripSixDotIcon()
                    .frame(width: 20, height: 12)
                    .scaleEffect(0.8)
            )
            .frame(width: 30, height: tabHeight)
            .shadow(color: .black.opacity(0.12), radius: 6, x: 0, y: 2)
            .frame(maxWidth: .infinity)
    }
}

// MARK: - 6-dot grip icon

struct GripSixDotIcon: View {
    private let dotRadius: CGFloat = 1.25
    private let rectInset: CGFloat = 1

    var body: some View {
        ZStack(alignment: .center) {
            RoundedRectangle(cornerRadius: 3)
                .strokeBorder(Color(white: 0.45), lineWidth: 1.5)
                .frame(width: 22, height: 12)

            // 3x2 grid of dots
            VStack(spacing: 4) {
                HStack(spacing: 6) {
                    dot; dot; dot
                }
                HStack(spacing: 6) {
                    dot; dot; dot
                }
            }
        }
        .frame(width: 24, height: 14)
    }

    private var dot: some View {
        Circle()
            .fill(Color(white: 0.45))
            .frame(width: dotRadius * 2, height: dotRadius * 2)
    }
}

// MARK: - Color wheel icon (rainbow segments)

struct ColorWheelIcon: View {
    private let segmentColors: [Color] = [
        Color(red: 1, green: 0.23, blue: 0.19),    // #FF3B30
        Color(red: 1, green: 0.58, blue: 0),      // #FF9500
        Color(red: 1, green: 0.8, blue: 0),      // #FFCC00
        Color(red: 0.2, green: 0.78, blue: 0.35), // #34C759
        Color(red: 0, green: 0.48, blue: 1),      // #007AFF
        Color(red: 0.69, green: 0.32, blue: 0.87) // #AF52DE
    ]

    var body: some View {
        ZStack {
            ForEach(Array(segmentColors.enumerated()), id: \.offset) { index in
                ColorWheelSegment(
                    startAngle: .degrees(Double(index) * 60),
                    endAngle: .degrees(Double(index + 1) * 60)
                )
                .fill(segmentColors[index])
            }
            Circle()
                .fill(.white)
                .frame(width: 10, height: 10)
            Circle()
                .strokeBorder(Color(white: 0.9), lineWidth: 1)
                .frame(width: 10, height: 10)
        }
        .frame(width: 20, height: 20)
    }
}

private struct ColorWheelSegment: Shape {
    var startAngle: Angle
    var endAngle: Angle

    func path(in rect: CGRect) -> Path {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let r = min(rect.width, rect.height) / 2
        var path = Path()
        path.move(to: center)
        path.addArc(center: center, radius: r, startAngle: startAngle, endAngle: endAngle, clockwise: false)
        path.closeSubpath()
        return path
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        Color(white: 0.93)
            .ignoresSafeArea()
        DiagramToolbarView()
    }
    .previewDisplayName("Diagram Toolbar")
}

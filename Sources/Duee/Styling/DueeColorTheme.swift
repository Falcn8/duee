import Foundation
import SwiftUI

#if os(macOS)
import AppKit
typealias DueePlatformColor = NSColor
#elseif os(iOS)
import UIKit
typealias DueePlatformColor = UIColor
#endif

struct DueeThemeSwatch: Hashable {
    let red: Double
    let green: Double
    let blue: Double

    init(red: Double, green: Double, blue: Double) {
        self.red = red
        self.green = green
        self.blue = blue
    }

    init?(hex: String) {
        let cleaned = DueeColorThemeCatalog.sanitizeEditableHex(hex)
        guard cleaned.count == 6 else { return nil }

        var value: UInt64 = 0
        guard Scanner(string: cleaned).scanHexInt64(&value) else { return nil }

        let red = Double((value >> 16) & 0xFF) / 255.0
        let green = Double((value >> 8) & 0xFF) / 255.0
        let blue = Double(value & 0xFF) / 255.0

        self.init(red: red, green: green, blue: blue)
    }

    var color: Color {
        Color(red: red, green: green, blue: blue)
    }

    #if os(macOS)
    var platformColor: NSColor {
        NSColor(calibratedRed: red, green: green, blue: blue, alpha: 1)
    }
    #elseif os(iOS)
    var platformColor: UIColor {
        UIColor(red: red, green: green, blue: blue, alpha: 1)
    }
    #endif

    var luminance: Double {
        (0.2126 * red) + (0.7152 * green) + (0.0722 * blue)
    }

    var hasWarmBias: Bool {
        red > 0.55 && green < 0.45
    }
}

struct DueeColorTheme: Identifiable, Hashable {
    let id: String
    let title: String
    let hexes: [String]
    let isCurrent: Bool

    var previewColors: [Color] {
        swatches.map(\.color)
    }

    private var swatches: [DueeThemeSwatch] {
        let parsed = hexes.compactMap(DueeThemeSwatch.init(hex:))
        if parsed.count >= 3 {
            return parsed
        }

        return DueeColorThemeCatalog.defaultCustomHexes.compactMap(DueeThemeSwatch.init(hex:))
    }

    private var swatchesByLuminance: [DueeThemeSwatch] {
        swatches.sorted { $0.luminance < $1.luminance }
    }

    private var darkestSwatch: DueeThemeSwatch {
        swatchesByLuminance.first ?? swatches[0]
    }

    private var secondDarkestSwatch: DueeThemeSwatch {
        if swatchesByLuminance.count >= 4 {
            return swatchesByLuminance[1]
        }
        return middleSwatch
    }

    private var secondLightestSwatch: DueeThemeSwatch {
        if swatchesByLuminance.count >= 4 {
            return swatchesByLuminance[2]
        }
        return middleSwatch
    }

    private var lightestSwatch: DueeThemeSwatch {
        swatchesByLuminance.last ?? swatches[0]
    }

    private var middleSwatch: DueeThemeSwatch {
        swatchesByLuminance[swatchesByLuminance.count / 2]
    }

    private var accentSwatch: DueeThemeSwatch {
        if swatches.count >= 4 {
            return swatches[2]
        }
        return swatches[min(1, swatches.count - 1)]
    }

    private var supportSwatch: DueeThemeSwatch {
        if swatches.count >= 4 {
            return swatches[1]
        }
        return swatches[0]
    }

    func neutralTone(for colorScheme: ColorScheme) -> Color {
        if isCurrent {
            return colorScheme == .dark ? .white : .black
        }
        return colorScheme == .dark ? lightestSwatch.color : darkestSwatch.color
    }

    func softTone(for colorScheme: ColorScheme) -> Color {
        if isCurrent {
            return colorScheme == .dark ? .white : .black
        }
        return colorScheme == .dark ? secondLightestSwatch.color : secondDarkestSwatch.color
    }

    func surfaceTone(for colorScheme: ColorScheme) -> Color {
        if isCurrent {
            return colorScheme == .dark ? .white : .black
        }
        return colorScheme == .dark ? secondDarkestSwatch.color : secondLightestSwatch.color
    }

    func accentTone(for colorScheme: ColorScheme) -> Color {
        if isCurrent {
            return colorScheme == .dark ? .white : .black
        }
        return accentSwatch.color
    }

    func secondaryAccentTone(for colorScheme: ColorScheme) -> Color {
        if isCurrent {
            return colorScheme == .dark ? .white : .black
        }
        return supportSwatch.color
    }

    func accentForegroundTone(for colorScheme: ColorScheme) -> Color {
        if isCurrent {
            return colorScheme == .dark ? .black.opacity(0.7) : .white.opacity(0.92)
        }
        let luminance = accentSwatch.luminance
        return luminance > 0.57 ? .black.opacity(0.82) : .white.opacity(0.94)
    }

    func attentionTone(for colorScheme: ColorScheme) -> Color {
        if isCurrent {
            return colorScheme == .dark ? .cyan : .indigo
        }

        let candidates = [accentSwatch, supportSwatch, secondDarkestSwatch, secondLightestSwatch]
        if let swatch = candidates.first(where: { !$0.hasWarmBias && $0.luminance > 0.18 && $0.luminance < 0.82 }) {
            return swatch.color
        }

        return colorScheme == .dark ? .cyan : .indigo
    }

    func warningTone(for colorScheme: ColorScheme) -> Color {
        if isCurrent {
            return .red
        }
        if let warm = swatches.first(where: \.hasWarmBias) {
            return warm.color
        }
        return accentTone(for: colorScheme)
    }

    #if os(macOS)
    func windowBackgroundColor(isDark: Bool) -> NSColor {
        if isCurrent {
            return isDark ? .black : .windowBackgroundColor
        }
        return isDark ? darkestSwatch.platformColor : lightestSwatch.platformColor
    }
    #endif
}

enum DueeColorThemeCatalog {
    static let defaultThemeID = "minimal"
    static let customThemeID = "custom"
    static let customInputColorCount = 3
    static let defaultCustomHexes = ["F7F6E5", "DA4848", "36064D"]
    static let defaultCustomThemeRawValue = defaultCustomHexes.joined(separator: ",")
    private static let legacyThemeIDMap: [String: String] = [
        "current": defaultThemeID,
        "palette-1": "pulse",
        "palette-2": "grove",
        "palette-3": "desk",
        "palette-4": "harbor",
        "palette-5": "studio",
    ]

    private static let presetThemes: [DueeColorTheme] = [
        DueeColorTheme(
            id: defaultThemeID,
            title: "minimal",
            hexes: ["FFFFFF", "DADADA", "9A9A9A", "000000"],
            isCurrent: true
        ),
        DueeColorTheme(
            id: "pulse",
            title: "pulse",
            hexes: ["F7F6E5", "76D2DB", "DA4848", "36064D"],
            isCurrent: false
        ),
        DueeColorTheme(
            id: "grove",
            title: "grove",
            hexes: ["6E1A37", "AE2448", "72BAA9", "D5E7B5"],
            isCurrent: false
        ),
        DueeColorTheme(
            id: "desk",
            title: "desk",
            hexes: ["7DAACB", "E8DBB3", "FFFDEB", "CE2626"],
            isCurrent: false
        ),
        DueeColorTheme(
            id: "harbor",
            title: "harbor",
            hexes: ["DB1A1A", "FFF6F6", "8CC7C4", "2C687B"],
            isCurrent: false
        ),
        DueeColorTheme(
            id: "studio",
            title: "studio",
            hexes: ["81A6C6", "AACDDC", "F3E3D0", "D2C4B4"],
            isCurrent: false
        ),
    ]

    static func allThemes(customThemeRaw: String) -> [DueeColorTheme] {
        presetThemes + [
            DueeColorTheme(
                id: customThemeID,
                title: "Custom",
                hexes: normalizedCustomHexes(from: customThemeRaw),
                isCurrent: false
            ),
        ]
    }

    static func theme(for id: String, customThemeRaw: String) -> DueeColorTheme {
        let resolvedID = normalizedThemeID(id)
        return allThemes(customThemeRaw: customThemeRaw).first(where: { $0.id == resolvedID })
            ?? presetThemes[0]
    }

    static func normalizedThemeID(_ id: String) -> String {
        let cleaned = id.trimmingCharacters(in: .whitespacesAndNewlines)
        if let mapped = legacyThemeIDMap[cleaned] {
            return mapped
        }
        if presetThemes.contains(where: { $0.id == cleaned }) || cleaned == customThemeID {
            return cleaned
        }
        return defaultThemeID
    }

    static func normalizedCustomHexes(from raw: String) -> [String] {
        editableCustomHexes(from: raw).enumerated().map { index, value in
            canonicalHex(value) ?? defaultCustomHexes[index]
        }
    }

    static func editableCustomHexes(from raw: String) -> [String] {
        var values = raw
            .split(separator: ",", omittingEmptySubsequences: false)
            .map { sanitizeEditableHex(String($0)) }

        // Migrate legacy 4-slot custom palettes (base, support, accent, contrast)
        // to the new 3-slot custom model (base, accent, contrast).
        if values.count >= 4 {
            values = [values[0], values[2], values[3]]
        } else if values.count > customInputColorCount {
            values = Array(values.prefix(customInputColorCount))
        }
        while values.count < customInputColorCount {
            values.append(defaultCustomHexes[values.count])
        }
        return values
    }

    static func serializeEditableHexes(_ hexes: [String]) -> String {
        var values = Array(hexes.prefix(customInputColorCount)).map(sanitizeEditableHex)
        while values.count < customInputColorCount {
            values.append(defaultCustomHexes[values.count])
        }
        return values.joined(separator: ",")
    }

    static func sanitizeEditableHex(_ value: String) -> String {
        let uppercase = value.uppercased()
        let allowed = uppercase.filter { char in
            switch char {
            case "0" ... "9", "A" ... "F":
                return true
            default:
                return false
            }
        }
        return String(allowed.prefix(6))
    }

    static func canonicalHex(_ value: String) -> String? {
        let cleaned = sanitizeEditableHex(value)
        guard cleaned.count == 6 else { return nil }
        return cleaned
    }
}

private struct DueeColorThemeKey: EnvironmentKey {
    static let defaultValue: DueeColorTheme = DueeColorThemeCatalog.theme(
        for: DueeColorThemeCatalog.defaultThemeID,
        customThemeRaw: DueeColorThemeCatalog.defaultCustomThemeRawValue
    )
}

extension EnvironmentValues {
    var dueeColorTheme: DueeColorTheme {
        get { self[DueeColorThemeKey.self] }
        set { self[DueeColorThemeKey.self] = newValue }
    }
}

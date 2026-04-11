import SwiftUI

enum DueeAppearanceMode: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: String { rawValue }

    var title: String {
        switch self {
        case .system:
            return "System"
        case .light:
            return "Light"
        case .dark:
            return "Dark"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system:
            return nil
        case .light:
            return .light
        case .dark:
            return .dark
        }
    }
}

enum DueePreferenceKeys {
    static let appearanceMode = "appearanceMode"
    static let unfocusedBackgroundAlpha = "unfocusedBackgroundAlpha"
    static let colorThemeID = "colorThemeID"
    static let customThemeHexes = "customThemeHexes"
}

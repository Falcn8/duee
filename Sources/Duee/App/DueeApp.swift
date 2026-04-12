import SwiftData
import SwiftUI

#if os(macOS)
import AppKit
#endif

@main
struct DueeApp: App {
#if os(macOS)
    @NSApplicationDelegateAdaptor(DueeAppDelegate.self) private var appDelegate
#endif
    @AppStorage(DueePreferenceKeys.appearanceMode) private var appearanceModeRaw = DueeAppearanceMode.system.rawValue
    @AppStorage(DueePreferenceKeys.colorThemeID) private var colorThemeID = DueeColorThemeCatalog.defaultThemeID
    @AppStorage(DueePreferenceKeys.customThemeHexes) private var customThemeHexes = DueeColorThemeCatalog.defaultCustomThemeRawValue
    private let modelContainer = DueeApp.makeModelContainer()

    var body: some Scene {
#if os(macOS)
        Window("duee", id: "main") {
            DueeWebRootView()
                .frame(minWidth: 360, minHeight: 48)
                .preferredColorScheme(effectiveAppearanceMode.colorScheme)
                .environment(\.dueeColorTheme, colorTheme)
        }
        .defaultSize(width: 390, height: 470)
        .windowResizability(.automatic)
        .windowStyle(.hiddenTitleBar)
        .modelContainer(modelContainer)
        .commands {
            CommandGroup(replacing: .newItem) { }
        }
#else
        WindowGroup {
            DueeRootView()
                .preferredColorScheme(effectiveAppearanceMode.colorScheme)
                .environment(\.dueeColorTheme, colorTheme)
        }
        .modelContainer(modelContainer)
#endif
    }

    private var storedAppearanceMode: DueeAppearanceMode {
        DueeAppearanceMode(rawValue: appearanceModeRaw) ?? .system
    }

    private var effectiveAppearanceMode: DueeAppearanceMode {
        if DueeColorThemeCatalog.normalizedThemeID(colorThemeID) != DueeColorThemeCatalog.defaultThemeID {
            return .light
        }
        return storedAppearanceMode
    }

    private var colorTheme: DueeColorTheme {
        DueeColorThemeCatalog.theme(for: colorThemeID, customThemeRaw: customThemeHexes)
    }

    private static func makeModelContainer() -> ModelContainer {
        let schema = Schema([DueeTask.self])
        let cloudConfiguration = ModelConfiguration(cloudKitDatabase: .automatic)
        let localConfiguration = ModelConfiguration()

        do {
            return try ModelContainer(for: schema, configurations: [cloudConfiguration])
        } catch {
            do {
                return try ModelContainer(for: schema, configurations: [localConfiguration])
            } catch {
                fatalError("Failed to initialize SwiftData store: \(error)")
            }
        }
    }
}

#if os(macOS)
@MainActor
final class DueeAppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    private let focusedBackgroundAlpha: CGFloat = 1.0
    private let expandedMinHeight: CGFloat = 420
    private let defaultExpandedHeight: CGFloat = 470
    private let minimumWindowWidth: CGFloat = 360
    private let defaultUnfocusedBackgroundAlpha: CGFloat = 0.78
    private var didApplyLaunchWindowSizing = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handlePreferenceChange),
            name: UserDefaults.didChangeNotification,
            object: nil
        )
        applyAppAppearance()
        promoteToForeground()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            sender.windows.first?.makeKeyAndOrderFront(nil)
        }
        sender.windows.forEach { configureWindowAppearance($0, enforceExpandedSize: false) }
        sender.activate(ignoringOtherApps: true)
        return true
    }

    private func promoteToForeground() {
        NSApp.setActivationPolicy(.regular)
        DispatchQueue.main.async {
            let shouldEnforceExpandedSize = !self.didApplyLaunchWindowSizing
            NSApp.windows.forEach { self.configureWindowAppearance($0, enforceExpandedSize: shouldEnforceExpandedSize) }
            self.didApplyLaunchWindowSizing = true
            NSApp.windows.first?.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
        }
    }

    private func configureWindowAppearance(_ window: NSWindow?, enforceExpandedSize: Bool) {
        guard let window else { return }
        window.styleMask.insert(.fullSizeContentView)
        window.isOpaque = false
        window.delegate = self
        window.appearance = NSApp.appearance
        window.hasShadow = true
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.titlebarSeparatorStyle = .none
        window.isMovableByWindowBackground = true
        window.level = .floating
        window.collectionBehavior.insert(.fullScreenAuxiliary)
        window.collectionBehavior.insert(.canJoinAllSpaces)

        window.standardWindowButton(.closeButton)?.isHidden = true
        window.standardWindowButton(.miniaturizeButton)?.isHidden = true
        window.standardWindowButton(.zoomButton)?.isHidden = true

        if enforceExpandedSize {
            window.minSize = NSSize(width: minimumWindowWidth, height: expandedMinHeight)
            if window.frame.height < expandedMinHeight {
                resize(window: window, toHeight: defaultExpandedHeight, animate: false)
            }
        }

        applyBackgroundOpacity(to: window, isFocused: window.isKeyWindow)
    }

    func windowDidBecomeKey(_ notification: Notification) {
        guard let window = notification.object as? NSWindow else { return }
        applyBackgroundOpacity(to: window, isFocused: true)
    }

    func windowDidResignKey(_ notification: Notification) {
        guard let window = notification.object as? NSWindow else { return }
        applyBackgroundOpacity(to: window, isFocused: false)
    }

    private func applyBackgroundOpacity(to window: NSWindow, isFocused: Bool) {
        let alpha = isFocused ? focusedBackgroundAlpha : configuredUnfocusedBackgroundAlpha
        let baseColor = configuredColorTheme.windowBackgroundColor(isDark: isDarkAppearance(for: window))
        window.backgroundColor = baseColor.withAlphaComponent(alpha)
    }

    private func resize(window: NSWindow, toHeight newHeight: CGFloat, animate: Bool) {
        var frame = window.frame
        let delta = newHeight - frame.height
        frame.size.height = newHeight
        frame.origin.y -= delta
        window.setFrame(frame, display: true, animate: animate)
    }

    @objc
    private func handlePreferenceChange() {
        applyAppAppearance()
        NSApp.windows.forEach { window in
            window.appearance = NSApp.appearance
            applyBackgroundOpacity(to: window, isFocused: window.isKeyWindow)
        }
    }

    private var configuredUnfocusedBackgroundAlpha: CGFloat {
        let rawValue = UserDefaults.standard.object(forKey: DueePreferenceKeys.unfocusedBackgroundAlpha) as? Double
        let value = CGFloat(rawValue ?? Double(defaultUnfocusedBackgroundAlpha))
        return min(max(value, 0.35), 0.95)
    }

    private var configuredColorTheme: DueeColorTheme {
        let themeID = UserDefaults.standard.string(forKey: DueePreferenceKeys.colorThemeID)
            ?? DueeColorThemeCatalog.defaultThemeID
        let customThemeRaw = UserDefaults.standard.string(forKey: DueePreferenceKeys.customThemeHexes)
            ?? DueeColorThemeCatalog.defaultCustomThemeRawValue
        return DueeColorThemeCatalog.theme(for: themeID, customThemeRaw: customThemeRaw)
    }

    private func isDarkAppearance(for window: NSWindow) -> Bool {
        switch effectiveAppearanceMode {
        case .dark:
            return true
        case .light:
            return false
        case .system:
            let match = window.effectiveAppearance.bestMatch(from: [.darkAqua, .vibrantDark, .aqua, .vibrantLight])
            return match == .darkAqua || match == .vibrantDark
        }
    }

    private func applyAppAppearance() {
        switch effectiveAppearanceMode {
        case .system:
            NSApp.appearance = nil
        case .light:
            NSApp.appearance = NSAppearance(named: .aqua)
        case .dark:
            NSApp.appearance = NSAppearance(named: .darkAqua)
        }
    }

    private var effectiveAppearanceMode: DueeAppearanceMode {
        let storedModeRaw = UserDefaults.standard.string(forKey: DueePreferenceKeys.appearanceMode)
        let storedMode = DueeAppearanceMode(rawValue: storedModeRaw ?? DueeAppearanceMode.system.rawValue) ?? .system
        let storedThemeID = UserDefaults.standard.string(forKey: DueePreferenceKeys.colorThemeID)
            ?? DueeColorThemeCatalog.defaultThemeID
        let normalizedThemeID = DueeColorThemeCatalog.normalizedThemeID(storedThemeID)

        if normalizedThemeID != DueeColorThemeCatalog.defaultThemeID {
            return .light
        }
        return storedMode
    }
}
#endif

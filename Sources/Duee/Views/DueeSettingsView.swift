import SwiftUI

struct DueeSettingsView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dueeColorTheme) private var colorTheme
    @Binding var minimalMode: Bool
    @Binding var unfocusedBackgroundAlpha: Double
    @Binding var appearanceMode: DueeAppearanceMode
    @Binding var colorThemeID: String
    @Binding var customThemeHexes: String
    @Environment(\.dismiss) private var dismiss
    @State private var editableCustomHexes = DueeColorThemeCatalog.defaultCustomHexes

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Settings")
                    .font(.system(size: 18, weight: .semibold))

                Spacer(minLength: 8)

                Button("Done") {
                    dismiss()
                }
                .keyboardShortcut(.defaultAction)
            }

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 12) {
                    minimalModeCard
#if os(macOS)
                    transparencyCard
#endif
                    appearanceCard
                    colorThemeCard
                }
                .padding(.vertical, 1)
            }
        }
        .padding(18)
#if os(macOS)
        .frame(width: 380, height: 560)
#else
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
#endif
        .tint(settingsAccent)
        .onAppear {
            let normalizedThemeID = DueeColorThemeCatalog.normalizedThemeID(colorThemeID)
            if normalizedThemeID != colorThemeID {
                colorThemeID = normalizedThemeID
            }
            enforceAppearanceModeForTheme()
            syncEditableCustomHexes(from: customThemeHexes)
        }
        .onChange(of: customThemeHexes) { _, newValue in
            syncEditableCustomHexes(from: newValue)
        }
        .onChange(of: colorThemeID) { _, _ in
            enforceAppearanceModeForTheme()
        }
    }

    private var minimalModeCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Toggle("Minimal mode", isOn: $minimalMode)
                .toggleStyle(.switch)
                .controlSize(.small)

            Text("Hide completed tasks instead of showing them in Done.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .modifier(SettingsCardStyle(fill: settingsCardFill, stroke: settingsCardStroke))
    }

    #if os(macOS)
    private var transparencyCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Unfocused transparency")
                    .font(.subheadline)
                Spacer(minLength: 8)
                Text(String(format: "%.2f", unfocusedBackgroundAlpha))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            Slider(value: $unfocusedBackgroundAlpha, in: 0.35 ... 0.95, step: 0.01)
                .accessibilityLabel("Unfocused transparency")

            Text("Lower = more transparent when unfocused.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .modifier(SettingsCardStyle(fill: settingsCardFill, stroke: settingsCardStroke))
    }
    #endif

    private var appearanceCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Appearance")
                .font(.subheadline)

            if isMinimalThemeSelected {
                Picker("Appearance", selection: $appearanceMode) {
                    ForEach(DueeAppearanceMode.allCases) { mode in
                        Text(mode.title).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
            } else {
                HStack {
                    Text("Mode")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 8)
                    Text("Light")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(
                            Capsule()
                                .fill(settingsCardStroke.opacity(0.25))
                        )
                }

                Text("Non-minimal themes are fixed to Light mode. Use minimal for System, Light, or Dark.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .modifier(SettingsCardStyle(fill: settingsCardFill, stroke: settingsCardStroke))
    }

    private var colorThemeCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center) {
                Text("Color theme")
                    .font(.subheadline)
                Spacer(minLength: 8)
                Picker("Color theme", selection: themeSelectionBinding) {
                    ForEach(themeOptions) { theme in
                        Text(theme.title).tag(theme.id)
                    }
                }
                .labelsHidden()
                .pickerStyle(.menu)
            }

            HStack(spacing: 8) {
                ForEach(Array(selectedTheme.previewColors.enumerated()), id: \.offset) { index, swatch in
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(swatch)
                        .frame(height: 18)
                        .overlay(
                            RoundedRectangle(cornerRadius: 6, style: .continuous)
                                .stroke(themePreviewStroke, lineWidth: 0.5)
                        )
                        .accessibilityLabel("Theme color \(index + 1)")
                }
            }
            .frame(maxWidth: .infinity)

            if normalizedThemeID == DueeColorThemeCatalog.customThemeID {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(0 ..< DueeColorThemeCatalog.customInputColorCount, id: \.self) { index in
                        HStack(spacing: 8) {
                            Text(customInputLabel(for: index))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .frame(width: 66, alignment: .leading)

                            RoundedRectangle(cornerRadius: 4, style: .continuous)
                                .fill(customPreviewColor(at: index))
                                .frame(width: 28, height: 16)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                                        .stroke(themePreviewStroke, lineWidth: 0.5)
                                )

                            TextField("RRGGBB", text: customHexBinding(for: index))
                                .font(.caption.monospaced())
                                .textFieldStyle(.roundedBorder)
                        }
                    }

                    HStack {
                        if hasInvalidCustomHex {
                            Text("Hex values must be 6 characters; invalid values use defaults.")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        } else {
                            Text("Custom themes use exactly 3 colors.")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }

                        Spacer(minLength: 8)

                        Button("Reset") {
                            editableCustomHexes = DueeColorThemeCatalog.defaultCustomHexes
                            customThemeHexes = DueeColorThemeCatalog.serializeEditableHexes(editableCustomHexes)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                    }
                }
                .padding(.top, 2)
            }
        }
        .modifier(SettingsCardStyle(fill: settingsCardFill, stroke: settingsCardStroke))
    }

    private var themeOptions: [DueeColorTheme] {
        DueeColorThemeCatalog.allThemes(customThemeRaw: customThemeHexes)
    }

    private var selectedTheme: DueeColorTheme {
        DueeColorThemeCatalog.theme(for: colorThemeID, customThemeRaw: customThemeHexes)
    }

    private var normalizedThemeID: String {
        DueeColorThemeCatalog.normalizedThemeID(colorThemeID)
    }

    private var isMinimalThemeSelected: Bool {
        normalizedThemeID == DueeColorThemeCatalog.defaultThemeID
    }

    private var themeSelectionBinding: Binding<String> {
        Binding(
            get: { normalizedThemeID },
            set: { newValue in
                let normalized = DueeColorThemeCatalog.normalizedThemeID(newValue)
                colorThemeID = normalized
                if normalized != DueeColorThemeCatalog.defaultThemeID {
                    appearanceMode = .light
                }
            }
        )
    }

    private func enforceAppearanceModeForTheme() {
        if normalizedThemeID != DueeColorThemeCatalog.defaultThemeID, appearanceMode != .light {
            appearanceMode = .light
        }
    }

    private var hasInvalidCustomHex: Bool {
        editableCustomHexes.contains { DueeColorThemeCatalog.canonicalHex($0) == nil }
    }

    private var themePreviewStroke: Color {
        colorTheme.neutralTone(for: colorScheme).opacity(colorTheme.isCurrent ? 0.25 : 0.35)
    }

    private func customInputLabel(for index: Int) -> String {
        switch index {
        case 0:
            return "Base"
        case 1:
            return "Accent"
        default:
            return "Contrast"
        }
    }

    private func customHexBinding(for index: Int) -> Binding<String> {
        Binding(
            get: {
                guard editableCustomHexes.indices.contains(index) else { return "" }
                return editableCustomHexes[index]
            },
            set: { newValue in
                guard editableCustomHexes.indices.contains(index) else { return }
                editableCustomHexes[index] = DueeColorThemeCatalog.sanitizeEditableHex(newValue)
                customThemeHexes = DueeColorThemeCatalog.serializeEditableHexes(editableCustomHexes)
            }
        )
    }

    private func customPreviewColor(at index: Int) -> Color {
        guard editableCustomHexes.indices.contains(index) else {
            return .clear
        }
        let fallback = DueeColorThemeCatalog.defaultCustomHexes[index]
        let hex = DueeColorThemeCatalog.canonicalHex(editableCustomHexes[index]) ?? fallback
        return DueeThemeSwatch(hex: hex)?.color ?? .clear
    }

    private func syncEditableCustomHexes(from rawValue: String) {
        let normalized = DueeColorThemeCatalog.editableCustomHexes(from: rawValue)
        if normalized != editableCustomHexes {
            editableCustomHexes = normalized
        }
    }

    private var settingsCardFill: Color {
        if colorTheme.isCurrent {
            return colorScheme == .dark ? .white.opacity(0.16) : .black.opacity(0.06)
        }
        return colorTheme.surfaceTone(for: colorScheme).opacity(colorScheme == .dark ? 0.28 : 0.2)
    }

    private var settingsCardStroke: Color {
        if colorTheme.isCurrent {
            return colorScheme == .dark ? .white.opacity(0.2) : .black.opacity(0.14)
        }
        return colorTheme.neutralTone(for: colorScheme).opacity(colorScheme == .dark ? 0.24 : 0.16)
    }

    private var settingsAccent: Color {
        if colorTheme.isCurrent {
            return colorScheme == .dark ? .white.opacity(0.9) : .black.opacity(0.86)
        }
        return colorTheme.accentTone(for: colorScheme).opacity(0.96)
    }
}

private struct SettingsCardStyle: ViewModifier {
    let fill: Color
    let stroke: Color

    func body(content: Content) -> some View {
        content
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(fill)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(stroke, lineWidth: 0.5)
            )
    }
}

#Preview("Settings") {
    DueeSettingsView(
        minimalMode: .constant(false),
        unfocusedBackgroundAlpha: .constant(0.78),
        appearanceMode: .constant(.system),
        colorThemeID: .constant(DueeColorThemeCatalog.defaultThemeID),
        customThemeHexes: .constant(DueeColorThemeCatalog.defaultCustomThemeRawValue)
    )
}

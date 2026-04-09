import SwiftUI

struct DueeSettingsView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Binding var minimalMode: Bool
    @Binding var unfocusedBackgroundAlpha: Double
    @Binding var appearanceMode: DueeAppearanceMode
    @Environment(\.dismiss) private var dismiss

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

            VStack(alignment: .leading, spacing: 8) {
                Toggle("Minimal mode", isOn: $minimalMode)
                    .toggleStyle(.switch)
                    .controlSize(.small)

                Text("Hide completed tasks instead of showing them in Done.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(settingsCardFill)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(settingsCardStroke, lineWidth: 0.5)
            )

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

                Text("Lower values make the window more transparent when unfocused.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(settingsCardFill)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(settingsCardStroke, lineWidth: 0.5)
            )

            VStack(alignment: .leading, spacing: 8) {
                Text("Appearance")
                    .font(.subheadline)

                Picker("Appearance", selection: $appearanceMode) {
                    ForEach(DueeAppearanceMode.allCases) { mode in
                        Text(mode.title).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()

                Text("Default is System.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(settingsCardFill)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(settingsCardStroke, lineWidth: 0.5)
            )

            Spacer(minLength: 0)
        }
        .padding(18)
        .frame(width: 360, height: 360)
    }

    private var settingsCardFill: Color {
        colorScheme == .dark ? .white.opacity(0.16) : .black.opacity(0.06)
    }

    private var settingsCardStroke: Color {
        colorScheme == .dark ? .white.opacity(0.2) : .black.opacity(0.14)
    }
}

#Preview("Settings") {
    DueeSettingsView(
        minimalMode: .constant(false),
        unfocusedBackgroundAlpha: .constant(0.78),
        appearanceMode: .constant(.system)
    )
}

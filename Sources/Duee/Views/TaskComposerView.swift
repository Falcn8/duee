import SwiftUI

#if os(macOS)
import AppKit
#endif

struct TaskComposerView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dueeColorTheme) private var colorTheme

    @Binding var dueDate: Date
    @Binding var hasDueDate: Bool
    @Binding var taskText: String
    let onAdd: () -> Void

    @FocusState private var isTaskFieldFocused: Bool
    @State private var isComposerHovered = false

    private var canAdd: Bool {
        !taskText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        HStack(spacing: 7) {
            dateField

            taskField
                .frame(maxWidth: .infinity, alignment: .leading)

            addButton
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 7)
        .padding(.horizontal, 4)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(composerFill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(composerStroke, lineWidth: 0.7)
        )
        .shadow(color: composerShadow, radius: isComposerHovered ? 10 : 6, x: 0, y: isComposerHovered ? 5 : 3)
        .onHover { isComposerHovered = $0 }
        .animation(.easeOut(duration: 0.16), value: isTaskFieldFocused)
        .animation(.easeOut(duration: 0.16), value: canAdd)
        .animation(.easeOut(duration: 0.16), value: hasDueDate)
        .animation(.easeOut(duration: 0.2), value: isComposerHovered)
    }

    private var dateField: some View {
        HStack(spacing: 0) {
            Image(systemName: "calendar")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.secondary)
                .padding(.trailing, -4)

            if hasDueDate {
                DatePicker("", selection: $dueDate, displayedComponents: [.date])
                    .labelsHidden()
#if os(macOS)
                    .datePickerStyle(.field)
                    .controlSize(.small)
#else
                    .datePickerStyle(.compact)
#endif
                    .frame(width: 104)
                    .padding(.leading, -6)
                    .overlay(alignment: .trailing) {
                        Button {
                            hasDueDate = false
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(.secondary.opacity(0.72))
                        }
                        .buttonStyle(.plain)
                        .offset(x: -2)
                        .accessibilityLabel("Remove due date")
                    }
                    .accessibilityLabel("Due date")
            } else {
                Button {
                    hasDueDate = true
                    dueDate = Calendar.current.startOfDay(for: .now)
                } label: {
                    Text("No date")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(noDatePillFill))
                }
                .buttonStyle(.plain)
                .padding(.leading, 4)
                .accessibilityLabel("Set due date")
            }
        }
        .padding(.leading, 8)
        .padding(.trailing, 0)
        .padding(.vertical, 4)
        .background(Capsule().fill(segmentFill))
        .overlay(
            Capsule()
                .stroke(segmentStroke, lineWidth: 0.55)
        )
    }

    private var taskField: some View {
        HStack(spacing: 7) {
            Image(systemName: "square.and.pencil")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.secondary.opacity(0.85))

            TextField("add a task", text: $taskText)
                .textFieldStyle(.plain)
                .controlSize(.small)
                .focused($isTaskFieldFocused)
                .onSubmit(addTask)
#if os(macOS)
                .onExitCommand {
                    isTaskFieldFocused = false
                    NSApp.keyWindow?.makeFirstResponder(nil)
                }
#endif
                .accessibilityLabel("Task text")

            if !taskText.isEmpty {
                Button {
                    taskText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.secondary.opacity(0.7))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear task text")
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(taskFieldFill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(taskFieldStroke, lineWidth: 0.6)
        )
    }

    private var addButton: some View {
        Button(action: addTask) {
            Image(systemName: "arrow.up")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(addButtonForeground)
                .frame(width: 28, height: 28)
                .background(
                    Circle()
                        .fill(addButtonFill)
                )
                .overlay(
                    Circle()
                        .stroke(addButtonStroke, lineWidth: 0.65)
                )
        }
        .buttonStyle(.plain)
        .disabled(!canAdd)
        .opacity(canAdd ? 1 : 0.72)
        .scaleEffect(canAdd ? 1 : 0.95)
        .keyboardShortcut(.return, modifiers: [])
        .accessibilityLabel("Add task")
    }

    private func addTask() {
        guard canAdd else { return }
        onAdd()
    }

    private var composerFill: Color {
        if colorTheme.isCurrent {
            if colorScheme == .dark {
                return .white.opacity(isTaskFieldFocused ? 0.19 : 0.16)
            }
            return .black.opacity(isTaskFieldFocused ? 0.06 : 0.045)
        }
        return colorTheme.surfaceTone(for: colorScheme).opacity(isTaskFieldFocused ? 0.31 : 0.24)
    }

    private var composerStroke: Color {
        if colorTheme.isCurrent {
            return colorScheme == .dark
                ? .white.opacity(isTaskFieldFocused ? 0.34 : 0.26)
                : .black.opacity(isTaskFieldFocused ? 0.2 : 0.14)
        }
        return colorTheme.neutralTone(for: colorScheme).opacity(isTaskFieldFocused ? 0.3 : 0.22)
    }

    private var composerShadow: Color {
        if colorTheme.isCurrent {
            return colorScheme == .dark ? .black.opacity(0.24) : .black.opacity(0.08)
        }
        return colorTheme.softTone(for: colorScheme).opacity(colorScheme == .dark ? 0.2 : 0.14)
    }

    private var segmentFill: Color {
        if colorTheme.isCurrent {
            return colorScheme == .dark ? .white.opacity(0.13) : .black.opacity(0.055)
        }
        return colorTheme.secondaryAccentTone(for: colorScheme).opacity(colorScheme == .dark ? 0.3 : 0.22)
    }

    private var segmentStroke: Color {
        if colorTheme.isCurrent {
            return colorScheme == .dark ? .white.opacity(0.17) : .black.opacity(0.085)
        }
        return colorTheme.softTone(for: colorScheme).opacity(colorScheme == .dark ? 0.3 : 0.2)
    }

    private var noDatePillFill: Color {
        if colorTheme.isCurrent {
            return colorScheme == .dark ? .white.opacity(0.22) : .white.opacity(0.8)
        }
        return colorTheme.surfaceTone(for: colorScheme).opacity(colorScheme == .dark ? 0.35 : 0.6)
    }

    private var taskFieldFill: Color {
        if colorTheme.isCurrent {
            if colorScheme == .dark {
                return .white.opacity(isTaskFieldFocused ? 0.2 : 0.14)
            }
            return .white.opacity(isTaskFieldFocused ? 0.92 : 0.8)
        }
        return colorTheme.surfaceTone(for: colorScheme).opacity(isTaskFieldFocused ? 0.46 : 0.34)
    }

    private var taskFieldStroke: Color {
        if colorTheme.isCurrent {
            if colorScheme == .dark {
                return .white.opacity(isTaskFieldFocused ? 0.27 : 0.2)
            }
            return .black.opacity(isTaskFieldFocused ? 0.18 : 0.12)
        }
        return colorTheme.neutralTone(for: colorScheme).opacity(isTaskFieldFocused ? 0.26 : 0.2)
    }

    private var addButtonFill: LinearGradient {
        if colorTheme.isCurrent {
            if colorScheme == .dark {
                return LinearGradient(
                    colors: [
                        .white.opacity(canAdd ? 0.44 : 0.18),
                        .white.opacity(canAdd ? 0.28 : 0.12)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
            }
            return LinearGradient(
                colors: [
                    .black.opacity(canAdd ? 0.84 : 0.24),
                    .black.opacity(canAdd ? 0.7 : 0.18)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        }
        let fillColor = colorTheme.accentTone(for: colorScheme).opacity(canAdd ? 0.9 : 0.4)
        return LinearGradient(
            colors: [fillColor, fillColor],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    private var addButtonStroke: Color {
        if colorTheme.isCurrent {
            if colorScheme == .dark {
                return .white.opacity(canAdd ? 0.55 : 0.22)
            }
            return .black.opacity(canAdd ? 0.45 : 0.2)
        }
        return colorTheme.neutralTone(for: colorScheme).opacity(canAdd ? 0.38 : 0.2)
    }

    private var addButtonForeground: Color {
        if colorTheme.isCurrent {
            if colorScheme == .dark {
                return canAdd ? .black.opacity(0.7) : .secondary.opacity(0.8)
            }
            return canAdd ? .white.opacity(0.92) : .secondary.opacity(0.8)
        }
        return canAdd ? colorTheme.accentForegroundTone(for: colorScheme) : .secondary.opacity(0.8)
    }
}

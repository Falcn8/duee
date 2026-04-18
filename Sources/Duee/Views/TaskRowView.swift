import SwiftUI

struct TaskRowView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dueeColorTheme) private var colorTheme

    let task: DueeTask
    let namespace: Namespace.ID
    let isNewlyAdded: Bool
    let onToggle: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void

    @State private var isHovered = false

    private enum DueUrgency {
        case none
        case tomorrow
        case today
    }

    var body: some View {
        Button(action: onToggle) {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .strokeBorder(checkColor, lineWidth: 1.2)
                        .frame(width: 18, height: 18)

                    if task.isCompleted {
                        Image(systemName: "checkmark")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(.secondary)
                    }
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text(task.text)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(task.isCompleted ? .secondary : .primary)
                        .strikethrough(task.isCompleted, color: .secondary.opacity(0.6))
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)

                    Text(dueLabelText)
                        .font(.caption)
                        .foregroundStyle(dueDateColor)
                }

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(rowBackground)
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(rowStrokeColor, lineWidth: 0.5)
            )
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .scaleEffect(isNewlyAdded ? 1.012 : 1)
            .shadow(color: addHighlightColor, radius: isNewlyAdded ? 10 : 0, y: isNewlyAdded ? 4 : 0)
            .matchedGeometryEffect(id: task.id, in: namespace)
        }
        .buttonStyle(.plain)
        .animation(.easeOut(duration: 0.3), value: isNewlyAdded)
        .animation(.snappy(duration: 0.24, extraBounce: 0), value: task.isCompleted)
        .animation(.easeOut(duration: 0.2), value: dueUrgency)
        .onHover { hovering in
            isHovered = hovering
        }
        .contextMenu {
            Button(action: onEdit) {
                Label("Edit", systemImage: "pencil")
            }

            Button(role: .destructive, action: onDelete) {
                Label("Delete", systemImage: "trash")
            }
        }
        .accessibilityLabel(accessibilityLabel)
        .accessibilityHint(accessibilityHint)
    }

    private var rowBackground: some ShapeStyle {
        if task.isCompleted {
            if colorTheme.isCurrent {
                if colorScheme == .dark {
                    return Color.white.opacity(isHovered ? 0.16 : 0.12)
                }
                return Color.black.opacity(isHovered ? 0.08 : 0.06)
            }
            let base = colorTheme.surfaceTone(for: colorScheme)
            let completedOpacity = colorScheme == .dark ? (isHovered ? 0.25 : 0.2) : (isHovered ? 0.18 : 0.14)
            return base.opacity(completedOpacity)
        }

        if colorTheme.isCurrent {
            switch dueUrgency {
            case .today:
                return colorScheme == .dark
                    ? .white.opacity(isHovered ? 0.28 : 0.24)
                    : .black.opacity(isHovered ? 0.12 : 0.1)
            case .tomorrow:
                return colorScheme == .dark
                    ? .white.opacity(isHovered ? 0.25 : 0.21)
                    : .black.opacity(isHovered ? 0.11 : 0.09)
            case .none:
                return colorScheme == .dark
                    ? .white.opacity(isHovered ? 0.24 : 0.2)
                    : .black.opacity(isHovered ? 0.12 : 0.09)
            }
        }

        if colorTheme.isCurrent {
            return colorScheme == .dark ? Color.white.opacity(isHovered ? 0.24 : 0.2) : Color.black.opacity(isHovered ? 0.12 : 0.09)
        }
        let base = colorTheme.surfaceTone(for: colorScheme)
        let activeOpacity: Double
        switch dueUrgency {
        case .today:
            activeOpacity = colorScheme == .dark ? (isHovered ? 0.38 : 0.32) : (isHovered ? 0.28 : 0.23)
        case .tomorrow:
            activeOpacity = colorScheme == .dark ? (isHovered ? 0.35 : 0.29) : (isHovered ? 0.25 : 0.21)
        case .none:
            activeOpacity = colorScheme == .dark ? (isHovered ? 0.34 : 0.28) : (isHovered ? 0.25 : 0.2)
        }
        return base.opacity(activeOpacity)
    }

    private var rowStrokeColor: Color {
        if isNewlyAdded {
            if colorTheme.isCurrent {
                return colorScheme == .dark ? .white.opacity(0.34) : .black.opacity(0.22)
            }
            return colorTheme.accentTone(for: colorScheme).opacity(colorScheme == .dark ? 0.44 : 0.32)
        }

        if !task.isCompleted {
            switch dueUrgency {
            case .today:
                if colorTheme.isCurrent {
                    return colorScheme == .dark ? .white.opacity(0.28) : .black.opacity(0.2)
                }
                return colorTheme.warningTone(for: colorScheme).opacity(colorScheme == .dark ? 0.46 : 0.34)
            case .tomorrow:
                if colorTheme.isCurrent {
                    return colorScheme == .dark ? .white.opacity(0.23) : .black.opacity(0.17)
                }
                return colorTheme.accentTone(for: colorScheme).opacity(colorScheme == .dark ? 0.36 : 0.26)
            case .none:
                break
            }
        }

        if colorTheme.isCurrent {
            if colorScheme == .dark {
                return .white.opacity(task.isCompleted ? 0.14 : 0.2)
            }
            return .black.opacity(task.isCompleted ? 0.1 : 0.16)
        }
        return colorTheme.neutralTone(for: colorScheme).opacity(task.isCompleted ? 0.15 : 0.23)
    }

    private var addHighlightColor: Color {
        if !isNewlyAdded {
            return .clear
        }
        if colorTheme.isCurrent {
            return colorScheme == .dark ? .white.opacity(0.16) : .black.opacity(0.1)
        }
        return colorTheme.accentTone(for: colorScheme).opacity(colorScheme == .dark ? 0.24 : 0.16)
    }

    private var checkColor: Color {
        if task.isCompleted {
            return .secondary.opacity(0.7)
        }
        if colorTheme.isCurrent {
            return .primary.opacity(0.58)
        }
        return colorTheme.softTone(for: colorScheme).opacity(0.78)
    }

    private var dueDateColor: Color {
        if !task.hasDueDate {
            return .secondary.opacity(0.82)
        }
        if isOverdue {
            return colorTheme.warningTone(for: colorScheme).opacity(0.9)
        }

        switch dueUrgency {
        case .today:
            return colorTheme.attentionTone(for: colorScheme).opacity(colorScheme == .dark ? 0.94 : 0.88)
        case .tomorrow:
            if colorTheme.isCurrent {
                return .primary.opacity(0.72)
            }
            return colorTheme.accentTone(for: colorScheme).opacity(0.78)
        case .none:
            return .secondary
        }
    }

    private var isOverdue: Bool {
        guard let daysFromToday else { return false }
        return !task.isCompleted && daysFromToday < 0
    }

    private var daysFromToday: Int? {
        guard task.hasDueDate else { return nil }
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: .now)
        let dueDay = calendar.startOfDay(for: task.dueDate)
        return calendar.dateComponents([.day], from: today, to: dueDay).day ?? 0
    }

    private var dueUrgency: DueUrgency {
        guard !task.isCompleted, let daysFromToday else {
            return .none
        }

        switch daysFromToday {
        case 0:
            return .today
        case 1:
            return .tomorrow
        default:
            return .none
        }
    }

    private var dueLabelText: String {
        guard task.hasDueDate else {
            return "no due date"
        }

        let dateText = task.dueDate.formatted(.dateTime.month(.defaultDigits).day(.defaultDigits))
        let dayDelta = daysFromToday ?? 0

        if task.isCompleted {
            return "due \(dateText)"
        }

        if dayDelta == 0 {
            return "due \(dateText) • today"
        }
        if dayDelta > 0 {
            let dayWord = dayDelta == 1 ? "day" : "days"
            return "due \(dateText) • in \(dayDelta) \(dayWord)"
        }

        let lateDays = abs(dayDelta)
        let dayWord = lateDays == 1 ? "day" : "days"
        return "due \(dateText) • \(lateDays) \(dayWord) late"
    }

    private var accessibilityLabel: String {
        if task.isCompleted {
            return "Restore \(task.text)"
        }
        return "Mark \(task.text) complete"
    }

    private var accessibilityHint: String {
        if task.isCompleted {
            return "Move this task back into active tasks."
        }
        return "Move this task into done."
    }
}

import SwiftUI

struct TaskRowView: View {
    @Environment(\.colorScheme) private var colorScheme

    let task: DueeTask
    let namespace: Namespace.ID
    let onToggle: () -> Void
    let onDelete: () -> Void

    @State private var isHovered = false

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
            .matchedGeometryEffect(id: task.id, in: namespace)
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            isHovered = hovering
        }
        .contextMenu {
            Button(role: .destructive, action: onDelete) {
                Label("Delete", systemImage: "trash")
            }
        }
        .accessibilityLabel(accessibilityLabel)
        .accessibilityHint(accessibilityHint)
    }

    private var rowBackground: some ShapeStyle {
        if colorScheme == .dark {
            return Color.white.opacity(task.isCompleted ? (isHovered ? 0.16 : 0.12) : (isHovered ? 0.24 : 0.2))
        }
        return Color.black.opacity(task.isCompleted ? (isHovered ? 0.08 : 0.06) : (isHovered ? 0.12 : 0.09))
    }

    private var rowStrokeColor: Color {
        if colorScheme == .dark {
            return .white.opacity(task.isCompleted ? 0.14 : 0.2)
        }
        return .black.opacity(task.isCompleted ? 0.1 : 0.16)
    }

    private var checkColor: Color {
        if task.isCompleted {
            return .secondary.opacity(0.7)
        }
        return .primary.opacity(0.58)
    }

    private var dueDateColor: Color {
        return isOverdue ? .red.opacity(0.82) : .secondary
    }

    private var isOverdue: Bool {
        !task.isCompleted && daysFromToday < 0
    }

    private var daysFromToday: Int {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: .now)
        let dueDay = calendar.startOfDay(for: task.dueDate)
        return calendar.dateComponents([.day], from: today, to: dueDay).day ?? 0
    }

    private var dueLabelText: String {
        let dateText = task.dueDate.formatted(.dateTime.month(.defaultDigits).day(.defaultDigits))

        if task.isCompleted {
            return "due \(dateText)"
        }

        if daysFromToday == 0 {
            return "due \(dateText) • today"
        }
        if daysFromToday > 0 {
            let dayWord = daysFromToday == 1 ? "day" : "days"
            return "due \(dateText) • in \(daysFromToday) \(dayWord)"
        }

        let lateDays = abs(daysFromToday)
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

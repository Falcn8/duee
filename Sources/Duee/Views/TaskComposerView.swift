import AppKit
import SwiftUI

struct TaskComposerView: View {
    @Environment(\.colorScheme) private var colorScheme

    @Binding var dueDate: Date
    @Binding var taskText: String
    let onAdd: () -> Void

    @FocusState private var isTaskFieldFocused: Bool

    private var canAdd: Bool {
        !taskText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        HStack(spacing: 3) {
            DatePicker("Due date", selection: $dueDate, displayedComponents: [.date])
                .labelsHidden()
                .datePickerStyle(.field)
                .controlSize(.small)
                .frame(width: 118)
                .accessibilityLabel("Due date")

            TextField("add a task", text: $taskText)
                .textFieldStyle(.roundedBorder)
                .controlSize(.small)
                .focused($isTaskFieldFocused)
                .onSubmit(addTask)
                .onExitCommand {
                    isTaskFieldFocused = false
                    NSApp.keyWindow?.makeFirstResponder(nil)
                }
                .accessibilityLabel("Task text")

            Button(action: addTask) {
                Image(systemName: "plus")
                    .font(.system(size: 11, weight: .semibold))
                    .frame(width: 24, height: 24)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
            .disabled(!canAdd)
            .keyboardShortcut(.return, modifiers: [])
            .accessibilityLabel("Add task")
        }
        .padding(.vertical, 6)
        .padding(.leading, 4)
        .padding(.trailing, 6)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(composerFill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(composerStroke, lineWidth: 0.5)
        )
    }

    private func addTask() {
        guard canAdd else { return }
        onAdd()
    }

    private var composerFill: Color {
        colorScheme == .dark ? .white.opacity(0.22) : .black.opacity(0.08)
    }

    private var composerStroke: Color {
        colorScheme == .dark ? .white.opacity(0.24) : .black.opacity(0.14)
    }
}

import SwiftData
import SwiftUI

#if os(macOS)
import AppKit
#elseif os(iOS)
import UIKit
#endif

struct DueeRootView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dueeColorTheme) private var colorTheme
    @Query private var tasks: [DueeTask]

    @AppStorage("minimalMode") private var minimalMode = false
    @AppStorage(DueePreferenceKeys.unfocusedBackgroundAlpha) private var unfocusedBackgroundAlpha = 0.78
    @AppStorage(DueePreferenceKeys.appearanceMode) private var appearanceModeRaw = DueeAppearanceMode.system.rawValue
    @AppStorage(DueePreferenceKeys.colorThemeID) private var colorThemeID = DueeColorThemeCatalog.defaultThemeID
    @AppStorage(DueePreferenceKeys.customThemeHexes) private var customThemeHexes = DueeColorThemeCatalog.defaultCustomThemeRawValue

    @State private var draftDueDate = Date()
    @State private var draftHasDueDate = true
    @State private var draftText = ""
    @State private var editingTask: DueeTask?
    @State private var editingTaskText = ""
    @State private var editingDueDate = Date()
    @State private var editingHasDueDate = true
    @State private var isShowingSettings = false
    @State private var isCollapsed = false
    @State private var expandedWindowHeight: CGFloat = 470
    @State private var collapseAnchorBottomY: CGFloat?
    @Namespace private var rowAnimation

    init() {
        let dueDateSort = SortDescriptor(\DueeTask.dueDate, order: .forward)
        let createdSort = SortDescriptor(\DueeTask.createdAt, order: .forward)
        _tasks = Query(sort: [dueDateSort, createdSort], animation: .snappy(duration: 0.24))
    }

    private var effectiveCollapsed: Bool {
#if os(macOS)
        return isCollapsed
#else
        return false
#endif
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header

            if !effectiveCollapsed {
                TaskComposerView(
                    dueDate: $draftDueDate,
                    hasDueDate: $draftHasDueDate,
                    taskText: $draftText,
                    onAdd: createTask
                )

                Divider()
                    .opacity(0.35)

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 9) {
                        activeSection

                        if !minimalMode && !completedTasks.isEmpty {
                            doneSection
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 2)
                }
            }
        }
        .frame(
            maxWidth: .infinity,
            maxHeight: .infinity,
            alignment: effectiveCollapsed ? .leading : .topLeading
        )
        .padding(.top, effectiveCollapsed ? 4 : 11)
        .padding(.leading, 18)
        .padding(.trailing, 18)
        .padding(.bottom, effectiveCollapsed ? 4 : 18)
        .background(.clear)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(rootStrokeColor, lineWidth: 0.5)
        )
        .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .ignoresSafeArea(.container, edges: .top)
        .onTapGesture {
#if os(macOS)
            if isCollapsed {
                toggleCollapsedMode()
            }
#endif
        }
        .simultaneousGesture(TapGesture().onEnded {
            clearInputFocus()
        })
        .animation(.easeInOut(duration: 0.22), value: minimalMode)
        .animation(.easeInOut(duration: 0.2), value: isCollapsed)
        .animation(.snappy(duration: 0.26, extraBounce: 0), value: activeTasks.map(\.id))
        .animation(.snappy(duration: 0.26, extraBounce: 0), value: completedTasks.map(\.id))
        .sheet(isPresented: $isShowingSettings) {
            DueeSettingsView(
                minimalMode: $minimalMode,
                unfocusedBackgroundAlpha: $unfocusedBackgroundAlpha,
                appearanceMode: appearanceModeBinding,
                colorThemeID: $colorThemeID,
                customThemeHexes: $customThemeHexes
            )
        }
        .sheet(item: $editingTask) { _ in
            EditTaskSheetView(
                taskText: $editingTaskText,
                dueDate: $editingDueDate,
                hasDueDate: $editingHasDueDate,
                onSave: saveEditedTask,
                onCancel: { editingTask = nil }
            )
        }
    }

    private var activeTasks: [DueeTask] {
        tasks
            .filter { !$0.isCompleted }
            .sorted(by: dueDateAscending)
    }

    private var completedTasks: [DueeTask] {
        tasks
            .filter(\.isCompleted)
            .sorted(by: dueDateAscending)
    }

    private func dueDateAscending(_ lhs: DueeTask, _ rhs: DueeTask) -> Bool {
        if lhs.hasDueDate != rhs.hasDueDate {
            return lhs.hasDueDate && !rhs.hasDueDate
        }

        if !lhs.hasDueDate {
            return lhs.createdAt < rhs.createdAt
        }

        if lhs.dueDate == rhs.dueDate {
            return lhs.createdAt < rhs.createdAt
        }
        return lhs.dueDate < rhs.dueDate
    }

    private var appearanceModeBinding: Binding<DueeAppearanceMode> {
        Binding(
            get: {
                DueeAppearanceMode(rawValue: appearanceModeRaw) ?? .system
            },
            set: { mode in
                appearanceModeRaw = mode.rawValue
            }
        )
    }

    private var rootStrokeColor: Color {
        if colorTheme.isCurrent {
            return colorScheme == .dark ? .white.opacity(0.22) : .black.opacity(0.14)
        }
        return colorTheme.neutralTone(for: colorScheme).opacity(colorScheme == .dark ? 0.24 : 0.18)
    }

    private var headerButtonFill: Color {
        if colorTheme.isCurrent {
            return colorScheme == .dark ? .white.opacity(0.3) : .black.opacity(0.16)
        }
        return colorTheme.surfaceTone(for: colorScheme).opacity(colorScheme == .dark ? 0.32 : 0.26)
    }

    private var headerButtonStroke: Color {
        if colorTheme.isCurrent {
            return colorScheme == .dark ? .white.opacity(0.34) : .black.opacity(0.22)
        }
        return colorTheme.softTone(for: colorScheme).opacity(colorScheme == .dark ? 0.45 : 0.34)
    }

    private var collapsedSummaryText: String {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: .now)

        let dueTodayCount = activeTasks.filter { task in
            task.hasDueDate && calendar.isDate(task.dueDate, inSameDayAs: today)
        }.count

        if dueTodayCount > 0 {
            return "\(dueTodayCount) \(taskWord(for: dueTodayCount)) left to do today"
        }

        if activeTasks.isEmpty {
            return "all tasks done"
        }

        let overdueCount = activeTasks.filter { $0.hasDueDate && $0.dueDate < today }.count
        if overdueCount > 0 {
            return "\(overdueCount) overdue \(taskWord(for: overdueCount))"
        }

        return "\(activeTasks.count) \(taskWord(for: activeTasks.count)) left"
    }

    private func taskWord(for count: Int) -> String {
        count == 1 ? "task" : "tasks"
    }

    private var header: some View {
#if os(macOS)
        HStack(alignment: .center, spacing: 8) {
            if isCollapsed {
                VStack(alignment: .leading, spacing: 1) {
                    Text("duee")
                        .font(.system(size: 20, weight: .semibold))
                        .tracking(0.1)

                    Text(collapsedSummaryText)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }

                Spacer(minLength: 6)

                headerCircleButton(
                    systemImage: "xmark",
                    accessibilityText: "Hide window from screen",
                    action: hideWindowFromScreen
                )
            } else {
                Text("duee")
                    .font(.system(size: 24, weight: .semibold))
                    .tracking(0.1)

                Spacer(minLength: 8)

                headerCircleButton(
                    systemImage: "minus",
                    accessibilityText: "Minimize to title only",
                    action: toggleCollapsedMode
                )

                headerCircleButton(
                    systemImage: "gearshape",
                    accessibilityText: "Open settings"
                ) {
                    isShowingSettings = true
                }
            }
        }
#else
        HStack(alignment: .center, spacing: 8) {
            Text("duee")
                .font(.system(size: 24, weight: .semibold))
                .tracking(0.1)

            Spacer(minLength: 8)

            headerCircleButton(
                systemImage: "gearshape",
                accessibilityText: "Open settings"
            ) {
                isShowingSettings = true
            }
        }
#endif
    }

    private var activeSection: some View {
        Group {
            if activeTasks.isEmpty {
                EmptyStateCard(
                    title: tasks.isEmpty ? "Nothing due yet" : "All clear",
                    subtitle: tasks.isEmpty
                        ? "Add your first task above."
                        : "Everything is completed."
                )
            } else {
                Text("Upcoming")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.leading, 2)
                    .padding(.bottom, 2)

                ForEach(activeTasks) { task in
                    TaskRowView(
                        task: task,
                        namespace: rowAnimation,
                        onToggle: { toggleCompletion(for: task) },
                        onEdit: { beginEditing(task) },
                        onDelete: { deleteTask(task) }
                    )
                    .transition(
                        .asymmetric(
                            insertion: .opacity.combined(with: .move(edge: .top)),
                            removal: .opacity
                        )
                    )
                }
            }
        }
    }

    private var doneSection: some View {
        Group {
            Text("Done")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.top, 8)
                .padding(.leading, 2)
                .padding(.bottom, 2)

            ForEach(completedTasks) { task in
                TaskRowView(
                    task: task,
                    namespace: rowAnimation,
                    onToggle: { toggleCompletion(for: task) },
                    onEdit: { beginEditing(task) },
                    onDelete: { deleteTask(task) }
                )
                .transition(.opacity)
            }
        }
    }

    private func createTask() {
        clearInputFocus()
        let cleaned = draftText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return }

        withAnimation(.snappy(duration: 0.22, extraBounce: 0)) {
            let item = DueeTask(
                dueDate: draftHasDueDate ? draftDueDate : nil,
                text: cleaned
            )
            modelContext.insert(item)
            draftText = ""
        }

        persist()
    }

    private func toggleCompletion(for task: DueeTask) {
        clearInputFocus()
        withAnimation(.snappy(duration: 0.25, extraBounce: 0)) {
            if task.isCompleted {
                task.markActive()
            } else {
                task.markCompleted()
            }
        }
        persist()
    }

    private func beginEditing(_ task: DueeTask) {
        clearInputFocus()
        editingTaskText = task.text
        editingHasDueDate = task.hasDueDate
        editingDueDate = task.dueDate
        editingTask = task
    }

    private func saveEditedTask() {
        guard let editingTask else { return }
        let cleaned = editingTaskText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return }

        editingTask.text = cleaned
        editingTask.hasDueDate = editingHasDueDate
        if editingHasDueDate {
            editingTask.dueDate = Calendar.current.startOfDay(for: editingDueDate)
        }

        self.editingTask = nil
        persist()
    }

    private func deleteTask(_ task: DueeTask) {
        clearInputFocus()
        withAnimation(.snappy(duration: 0.18, extraBounce: 0)) {
            modelContext.delete(task)
        }
        persist()
    }

    private func persist() {
        do {
            try modelContext.save()
        } catch {
            assertionFailure("Failed to save Duee tasks: \(error.localizedDescription)")
        }
    }

    private func clearInputFocus() {
#if os(macOS)
        NSApp.keyWindow?.makeFirstResponder(nil)
#elseif os(iOS)
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
#endif
    }

#if os(macOS)
    private func toggleCollapsedMode() {
        clearInputFocus()

        guard let window = currentWindow else {
            isCollapsed.toggle()
            return
        }

        let collapsedHeight: CGFloat = 48
        let expandedMinHeight: CGFloat = 420

        if isCollapsed {
            isCollapsed = false
            let targetHeight = max(expandedWindowHeight, expandedMinHeight)
            let anchoredBottomY = collapseAnchorBottomY ?? window.frame.minY
            collapseAnchorBottomY = nil
            DispatchQueue.main.async {
                window.minSize = NSSize(width: 360, height: expandedMinHeight)
                resize(window: window, toHeight: targetHeight, anchoredToBottom: anchoredBottomY, animate: false)
            }
        } else {
            expandedWindowHeight = max(window.frame.height, expandedMinHeight)
            let anchoredBottomY = window.frame.minY
            collapseAnchorBottomY = anchoredBottomY
            isCollapsed = true
            DispatchQueue.main.async {
                window.minSize = NSSize(width: 360, height: collapsedHeight)
                resize(window: window, toHeight: collapsedHeight, anchoredToBottom: anchoredBottomY, animate: false)
                DispatchQueue.main.async {
                    resize(window: window, toHeight: collapsedHeight, anchoredToBottom: anchoredBottomY, animate: false)
                }
            }
        }
    }

    private func hideWindowFromScreen() {
        clearInputFocus()
        currentWindow?.orderOut(nil)
        NSApp.hide(nil)
    }

    private var currentWindow: NSWindow? {
        NSApp.keyWindow
            ?? NSApp.mainWindow
            ?? NSApp.windows.first(where: { $0.isVisible })
            ?? NSApp.windows.first
    }
#endif

    private func headerCircleButton(
        systemImage: String,
        accessibilityText: String,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            clearInputFocus()
            action()
        } label: {
            ZStack {
                Circle()
                    .fill(headerButtonFill)

                Circle()
                    .stroke(headerButtonStroke, lineWidth: 0.6)

                Image(systemName: systemImage)
                    .font(.system(size: 12.5, weight: .medium))
            }
            .frame(width: 34, height: 34)
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .frame(width: 34, height: 34)
        .contentShape(Circle())
        .accessibilityLabel(accessibilityText)
    }

#if os(macOS)
    private func resize(
        window: NSWindow,
        toHeight newHeight: CGFloat,
        anchoredToBottom bottomY: CGFloat? = nil,
        animate: Bool = true
    ) {
        var frame = window.frame
        frame.size.height = round(newHeight)
        if let bottomY {
            frame.origin.y = round(bottomY)
        }
        window.setFrame(frame, display: true, animate: animate)
    }
#endif
}

private struct EmptyStateCard: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dueeColorTheme) private var colorTheme

    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(.primary)

            Text(subtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 11)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(cardFill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(cardStroke, lineWidth: 0.5)
        )
    }

    private var cardFill: Color {
        if colorTheme.isCurrent {
            return colorScheme == .dark ? .white.opacity(0.14) : .black.opacity(0.06)
        }
        return colorTheme.surfaceTone(for: colorScheme).opacity(colorScheme == .dark ? 0.28 : 0.2)
    }

    private var cardStroke: Color {
        if colorTheme.isCurrent {
            return colorScheme == .dark ? .white.opacity(0.2) : .black.opacity(0.14)
        }
        return colorTheme.neutralTone(for: colorScheme).opacity(colorScheme == .dark ? 0.22 : 0.15)
    }
}

private struct EditTaskSheetView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dueeColorTheme) private var colorTheme

    @Binding var taskText: String
    @Binding var dueDate: Date
    @Binding var hasDueDate: Bool

    let onSave: () -> Void
    let onCancel: () -> Void

    private var canSave: Bool {
        !taskText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Edit task")
                .font(.system(size: 18, weight: .semibold))

            TextField("Task text", text: $taskText)
                .textFieldStyle(.roundedBorder)

            Toggle("Set due date", isOn: $hasDueDate)
                .toggleStyle(.switch)
                .controlSize(.small)

            if hasDueDate {
#if os(macOS)
                DatePicker("Due date", selection: $dueDate, displayedComponents: [.date])
                    .datePickerStyle(.field)
                    .controlSize(.small)
#else
                DatePicker("Due date", selection: $dueDate, displayedComponents: [.date])
                    .datePickerStyle(.compact)
#endif
            }

            HStack {
                Spacer(minLength: 0)

                Button("Cancel", action: onCancel)

                Button("Save", action: onSave)
                    .keyboardShortcut(.defaultAction)
                    .disabled(!canSave)
            }
        }
        .padding(18)
        .frame(width: 320)
        .tint(sheetAccent)
    }

    private var sheetAccent: Color {
        if colorTheme.isCurrent {
            return colorScheme == .dark ? .white.opacity(0.9) : .black.opacity(0.86)
        }
        return colorTheme.accentTone(for: colorScheme).opacity(0.96)
    }
}

#Preview("Duee") {
    DueeRootView()
        .modelContainer(PreviewSeed.container)
        .frame(width: 390, height: 470)
}

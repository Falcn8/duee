import SwiftUI

#if os(macOS)
import AppKit

struct DueeWebRootView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dueeColorTheme) private var colorTheme

    @StateObject private var store = DueeWebStore()

    @AppStorage("minimalMode") private var minimalMode = false
    @AppStorage(DueePreferenceKeys.unfocusedBackgroundAlpha) private var unfocusedBackgroundAlpha = 0.78
    @AppStorage(DueePreferenceKeys.appearanceMode) private var appearanceModeRaw = DueeAppearanceMode.system.rawValue
    @AppStorage(DueePreferenceKeys.colorThemeID) private var colorThemeID = DueeColorThemeCatalog.defaultThemeID
    @AppStorage(DueePreferenceKeys.customThemeHexes) private var customThemeHexes = DueeColorThemeCatalog.defaultCustomThemeRawValue
    @AppStorage(DueePreferenceKeys.apiBaseURL) private var apiBaseURL = "http://localhost:8000"

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
                content
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
        .task(id: apiBaseURL) {
            await store.bootstrap(baseURL: apiBaseURL)
        }
        .sheet(isPresented: $isShowingSettings) {
            DueeSettingsView(
                minimalMode: $minimalMode,
                unfocusedBackgroundAlpha: $unfocusedBackgroundAlpha,
                appearanceMode: appearanceModeBinding,
                colorThemeID: $colorThemeID,
                customThemeHexes: $customThemeHexes,
                apiBaseURL: $apiBaseURL
            )
        }
        .sheet(item: $editingTask) { _ in
            DueeWebEditTaskSheetView(
                taskText: $editingTaskText,
                dueDate: $editingDueDate,
                hasDueDate: $editingHasDueDate,
                onSave: saveEditedTask,
                onCancel: { editingTask = nil }
            )
        }
    }

    @ViewBuilder
    private var content: some View {
        if !store.isSignedIn {
            DueeWebAuthCard(store: store)

            if !store.statusMessage.isEmpty {
                DueeWebStatusBanner(message: store.statusMessage, kind: store.statusKind)
            }
        } else {
            if !store.statusMessage.isEmpty {
                DueeWebStatusBanner(message: store.statusMessage, kind: store.statusKind)
            }

            TaskComposerView(
                dueDate: $draftDueDate,
                hasDueDate: $draftHasDueDate,
                taskText: $draftText,
                onAdd: createTask
            )
            .opacity(store.isMutating ? 0.92 : 1)

            Divider()
                .opacity(0.35)

            if store.isBootstrapping && activeTasks.isEmpty && completedTasks.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
            } else {
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
    }

    private var tasks: [DueeTask] {
        store.tasks
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
        if !store.isSignedIn {
            return "sign in to sync"
        }

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

                if store.isSignedIn {
                    headerCircleButton(
                        systemImage: "arrow.clockwise",
                        accessibilityText: "Refresh tasks"
                    ) {
                        Task {
                            await store.refreshTasks()
                        }
                    }

                    headerCircleButton(
                        systemImage: "rectangle.portrait.and.arrow.right",
                        accessibilityText: "Sign out"
                    ) {
                        Task {
                            await store.signOut()
                        }
                    }
                }

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
        EmptyView()
#endif
    }

    private var activeSection: some View {
        Group {
            if activeTasks.isEmpty {
                DueeWebEmptyStateCard(
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

        let dueDate = draftHasDueDate ? draftDueDate : nil

        Task {
            let created = await store.createTask(text: cleaned, dueDate: dueDate)
            if created {
                draftText = ""
            }
        }
    }

    private func toggleCompletion(for task: DueeTask) {
        clearInputFocus()
        Task {
            await store.setTaskCompletion(taskID: task.id, isCompleted: !task.isCompleted)
        }
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

        let dueDate = editingHasDueDate ? editingDueDate : nil
        self.editingTask = nil

        Task {
            await store.updateTask(taskID: editingTask.id, text: cleaned, dueDate: dueDate)
        }
    }

    private func deleteTask(_ task: DueeTask) {
        clearInputFocus()
        Task {
            await store.deleteTask(taskID: task.id)
        }
    }

    private func clearInputFocus() {
#if os(macOS)
        NSApp.keyWindow?.makeFirstResponder(nil)
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

private struct DueeWebAuthCard: View {
    @ObservedObject var store: DueeWebStore

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(store.authMode == .signIn ? "Sign in" : "Create account")
                .font(.system(size: 16, weight: .semibold))

            Text(store.authMode == .signIn
                 ? "Connect this macOS app to your duee web account."
                 : "Create a duee web account to sync tasks.")
                .font(.caption)
                .foregroundStyle(.secondary)

            Picker("Mode", selection: $store.authMode) {
                ForEach(DueeWebAuthMode.allCases) { mode in
                    Text(mode.title).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .disabled(store.isMutating)

            if store.authMode == .register {
                TextField("Display name", text: $store.authDisplayName)
                    .textFieldStyle(.roundedBorder)
                    .disabled(store.isMutating)
            }

            TextField("Email", text: $store.authEmail)
                .textFieldStyle(.roundedBorder)
                .disabled(store.isMutating)

            SecureField("Password", text: $store.authPassword)
                .textFieldStyle(.roundedBorder)
                .disabled(store.isMutating)

            Button {
                Task {
                    await store.submitAuth()
                }
            } label: {
                HStack(spacing: 8) {
                    if store.isMutating {
                        ProgressView()
                            .controlSize(.small)
                    }
                    Text(store.authMode == .signIn ? "Sign in" : "Create account")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(!store.canSubmitAuth || store.isMutating)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 11)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(.secondary.opacity(0.08))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(.secondary.opacity(0.18), lineWidth: 0.5)
        )
    }
}

private struct DueeWebStatusBanner: View {
    let message: String
    let kind: DueeWebStatusKind

    var body: some View {
        Text(message)
            .font(.caption)
            .foregroundStyle(foregroundColor)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(backgroundColor)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(foregroundColor.opacity(0.26), lineWidth: 0.5)
            )
    }

    private var foregroundColor: Color {
        switch kind {
        case .info:
            return .secondary
        case .warning:
            return .orange
        case .error:
            return .red
        }
    }

    private var backgroundColor: Color {
        switch kind {
        case .info:
            return .secondary.opacity(0.08)
        case .warning:
            return .orange.opacity(0.12)
        case .error:
            return .red.opacity(0.12)
        }
    }
}

private struct DueeWebEmptyStateCard: View {
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
                .fill(.secondary.opacity(0.08))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(.secondary.opacity(0.18), lineWidth: 0.5)
        )
    }
}

private struct DueeWebEditTaskSheetView: View {
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
                DatePicker("Due date", selection: $dueDate, displayedComponents: [.date])
                    .datePickerStyle(.field)
                    .controlSize(.small)
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
    }
}

#Preview("duee web mac") {
    DueeWebRootView()
        .frame(width: 390, height: 470)
}
#endif

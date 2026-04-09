import AppKit
import SwiftData
import SwiftUI

struct DueeRootView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.colorScheme) private var colorScheme
    @Query private var tasks: [DueeTask]

    @AppStorage("minimalMode") private var minimalMode = false
    @AppStorage(DueePreferenceKeys.unfocusedBackgroundAlpha) private var unfocusedBackgroundAlpha = 0.78
    @AppStorage(DueePreferenceKeys.appearanceMode) private var appearanceModeRaw = DueeAppearanceMode.system.rawValue

    @State private var draftDueDate = Date()
    @State private var draftText = ""
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

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header

            if !isCollapsed {
                TaskComposerView(
                    dueDate: $draftDueDate,
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
            alignment: isCollapsed ? .leading : .topLeading
        )
        .padding(.top, isCollapsed ? 4 : 11)
        .padding(.leading, 18)
        .padding(.trailing, 18)
        .padding(.bottom, isCollapsed ? 4 : 18)
        .background(.clear)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(rootStrokeColor, lineWidth: 0.5)
        )
        .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .ignoresSafeArea(.container, edges: .top)
        .onTapGesture {
            if isCollapsed {
                toggleCollapsedMode()
            }
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
                appearanceMode: appearanceModeBinding
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
        colorScheme == .dark ? .white.opacity(0.22) : .black.opacity(0.14)
    }

    private var headerButtonFill: Color {
        colorScheme == .dark ? .white.opacity(0.3) : .black.opacity(0.16)
    }

    private var headerButtonStroke: Color {
        colorScheme == .dark ? .white.opacity(0.34) : .black.opacity(0.22)
    }

    private var collapsedSummaryText: String {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: .now)

        let dueTodayCount = activeTasks.filter { task in
            calendar.isDate(task.dueDate, inSameDayAs: today)
        }.count

        if dueTodayCount > 0 {
            return "\(dueTodayCount) \(taskWord(for: dueTodayCount)) left to do today"
        }

        if activeTasks.isEmpty {
            return "all tasks done"
        }

        let overdueCount = activeTasks.filter { $0.dueDate < today }.count
        if overdueCount > 0 {
            return "\(overdueCount) overdue \(taskWord(for: overdueCount))"
        }

        return "\(activeTasks.count) \(taskWord(for: activeTasks.count)) left"
    }

    private func taskWord(for count: Int) -> String {
        count == 1 ? "task" : "tasks"
    }

    private var header: some View {
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
            let item = DueeTask(dueDate: draftDueDate, text: cleaned)
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
        NSApp.keyWindow?.makeFirstResponder(nil)
    }

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
}

private struct EmptyStateCard: View {
    @Environment(\.colorScheme) private var colorScheme

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
        colorScheme == .dark ? .white.opacity(0.14) : .black.opacity(0.06)
    }

    private var cardStroke: Color {
        colorScheme == .dark ? .white.opacity(0.2) : .black.opacity(0.14)
    }
}

#Preview("Duee") {
    DueeRootView()
        .modelContainer(PreviewSeed.container)
        .frame(width: 390, height: 470)
}

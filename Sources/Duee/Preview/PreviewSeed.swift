import Foundation
import SwiftData

enum PreviewSeed {
    @MainActor
    static let container: ModelContainer = {
        let configuration = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try! ModelContainer(for: DueeTask.self, configurations: configuration)
        let context = container.mainContext

        let calendar = Calendar.current
        let today = calendar.startOfDay(for: .now)

        let tasks = [
            DueeTask(
                dueDate: calendar.date(byAdding: .day, value: 1, to: today) ?? today,
                text: "英語プレゼン資料を提出する"
            ),
            DueeTask(
                dueDate: calendar.date(byAdding: .day, value: 3, to: today) ?? today,
                text: "統計学の課題 4 を仕上げる"
            ),
            DueeTask(
                dueDate: calendar.date(byAdding: .day, value: -1, to: today) ?? today,
                text: "ゼミの読書メモを送る",
                isCompleted: true,
                createdAt: calendar.date(byAdding: .day, value: -4, to: today) ?? today,
                completedAt: calendar.date(byAdding: .hour, value: -5, to: .now)
            ),
            DueeTask(
                text: "来週の買い出しメモを作る"
            ),
        ]

        for task in tasks {
            context.insert(task)
        }

        return container
    }()
}

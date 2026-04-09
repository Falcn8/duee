import Foundation
import SwiftData

@Model
final class DueeTask {
    @Attribute(.unique) var id: UUID
    var dueDate: Date
    var text: String
    var isCompleted: Bool
    var createdAt: Date
    var completedAt: Date?

    init(
        id: UUID = UUID(),
        dueDate: Date,
        text: String,
        isCompleted: Bool = false,
        createdAt: Date = .now,
        completedAt: Date? = nil
    ) {
        self.id = id
        self.dueDate = Calendar.current.startOfDay(for: dueDate)
        self.text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        self.isCompleted = isCompleted
        self.createdAt = createdAt
        self.completedAt = completedAt
    }

    func markCompleted(at date: Date = .now) {
        isCompleted = true
        completedAt = date
    }

    func markActive() {
        isCompleted = false
        completedAt = nil
    }
}

extension DueeTask: Identifiable {}

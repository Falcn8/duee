import Foundation
import SwiftUI

enum DueeWebAuthMode: String, CaseIterable, Identifiable {
    case signIn
    case register

    var id: String { rawValue }

    var title: String {
        switch self {
        case .signIn:
            return "Sign in"
        case .register:
            return "Create account"
        }
    }
}

enum DueeWebStatusKind: Equatable {
    case info
    case warning
    case error
}

struct DueeWebUser: Codable, Equatable {
    let id: String
    let email: String
    let displayName: String
    let createdAt: String?
    let emailVerified: Bool
    let emailVerifiedAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case email
        case displayName
        case createdAt
        case emailVerified
        case emailVerifiedAt
    }

    init(
        id: String,
        email: String,
        displayName: String,
        createdAt: String?,
        emailVerified: Bool,
        emailVerifiedAt: String?
    ) {
        self.id = id
        self.email = email
        self.displayName = displayName
        self.createdAt = createdAt
        self.emailVerified = emailVerified
        self.emailVerifiedAt = emailVerifiedAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        email = try container.decode(String.self, forKey: .email)
        displayName = try container.decode(String.self, forKey: .displayName)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt)
        emailVerifiedAt = try container.decodeIfPresent(String.self, forKey: .emailVerifiedAt)
        emailVerified = try container.decodeIfPresent(Bool.self, forKey: .emailVerified) ?? (emailVerifiedAt != nil)
    }
}

struct DueeWebTaskPayload: Decodable {
    let id: String
    let text: String
    let hasDueDate: Bool
    let dueDate: String?
    let isPinned: Bool
    let isCompleted: Bool
    let createdAt: String?
    let completedAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case text
        case hasDueDate
        case dueDate
        case isPinned
        case isCompleted
        case createdAt
        case completedAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        text = try container.decode(String.self, forKey: .text)
        hasDueDate = try container.decode(Bool.self, forKey: .hasDueDate)
        dueDate = try container.decodeIfPresent(String.self, forKey: .dueDate)
        isPinned = try container.decodeIfPresent(Bool.self, forKey: .isPinned) ?? false
        isCompleted = try container.decode(Bool.self, forKey: .isCompleted)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt)
        completedAt = try container.decodeIfPresent(String.self, forKey: .completedAt)
    }
}

struct DueeWebSessionPayload: Decodable {
    let authenticated: Bool
    let user: DueeWebUser?
}

struct DueeWebRegisterPayload: Decodable {
    let ok: Bool
    let pendingVerification: Bool
    let email: String?
    let verificationEmailSent: Bool?
}

struct DueeWebVerificationRequestPayload: Decodable {
    let ok: Bool?
    let alreadyVerified: Bool?
}

private struct DueeDeveloperTaskRecord: Codable {
    let text: String
    let hasDueDate: Bool
    let dueDate: String?
    let isPinned: Bool
    let isCompleted: Bool
    let createdAt: String?
    let completedAt: String?
}

private struct DueeDeveloperTaskExportPayload: Codable {
    let version: Int
    let exportedAt: String
    let taskCount: Int
    let tasks: [DueeDeveloperTaskRecord]
}

private struct DueeDeveloperSnapshotCounts: Codable {
    let total: Int
    let active: Int
    let completed: Int
}

private struct DueeDeveloperSnapshotPayload: Codable {
    let version: Int
    let exportedAt: String
    let user: DueeWebUser?
    let authMode: String
    let showVerifySentPage: Bool
    let postRegisterEmail: String
    let postRegisterVerificationEmailSent: Bool
    let statusMessage: String
    let statusKind: String
    let tasks: [DueeDeveloperTaskRecord]
    let counts: DueeDeveloperSnapshotCounts
}

private struct DueeDeveloperImportedTask {
    let text: String
    let hasDueDate: Bool
    let dueDate: Date?
    let isPinned: Bool
    let isCompleted: Bool
}

@MainActor
final class DueeWebStore: ObservableObject {
    @Published private(set) var tasks: [DueeTask] = []
    @Published private(set) var sessionUser: DueeWebUser?
    @Published var authMode: DueeWebAuthMode = .signIn
    @Published var authDisplayName = ""
    @Published var authEmail = ""
    @Published var authPassword = ""
    @Published private(set) var showVerifySentPage = false
    @Published private(set) var postRegisterEmail = ""
    @Published private(set) var postRegisterVerificationEmailSent = true
    @Published private(set) var isBootstrapping = false
    @Published private(set) var isMutating = false
    @Published private(set) var statusMessage = ""
    @Published private(set) var statusKind: DueeWebStatusKind = .info

    private var client: DueeWebAPIClient?
    private var activeBaseURLString = ""

    var isSignedIn: Bool {
        sessionUser != nil
    }

    var requiresEmailVerification: Bool {
        guard let sessionUser else { return false }
        return !sessionUser.emailVerified
    }

    var isSignedInAndUnverified: Bool {
        sessionUser != nil && requiresEmailVerification
    }

    var verifyPageEmail: String {
        let signedInEmail = sessionUser?.email.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !signedInEmail.isEmpty {
            return signedInEmail
        }

        return postRegisterEmail.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var canSubmitAuth: Bool {
        let email = authEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        let password = authPassword
        guard !email.isEmpty, !password.isEmpty, password.count >= 8 else {
            return false
        }

        if authMode == .register {
            return !authDisplayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }

        return true
    }

    func bootstrap(baseURL: String) async {
        let cleanedURL = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let resolvedURL = normalizeBaseURL(cleanedURL) else {
            sessionUser = nil
            tasks = []
            setStatus(
                "Invalid API URL. Set a full URL such as \(DueeServerConfiguration.defaultAPIBaseURL).",
                kind: .error
            )
            return
        }

        if client == nil || activeBaseURLString != resolvedURL.absoluteString {
            client = DueeWebAPIClient(baseURL: resolvedURL)
            activeBaseURLString = resolvedURL.absoluteString
            sessionUser = nil
            tasks = []
            showVerifySentPage = false
            postRegisterEmail = ""
            postRegisterVerificationEmailSent = true
        }

        guard let client else { return }

        isBootstrapping = true
        defer { isBootstrapping = false }

        do {
            _ = try await client.fetchConfig()
            let session = try await client.fetchSession()

            guard session.authenticated, let user = session.user else {
                sessionUser = nil
                tasks = []
                showVerifySentPage = false
                postRegisterEmail = ""
                postRegisterVerificationEmailSent = true
                setStatus("Sign in to sync tasks from your web account.", kind: .info)
                return
            }

            sessionUser = user
            if !user.emailVerified {
                tasks = []
                showVerifySentPage = true
                postRegisterEmail = user.email
                postRegisterVerificationEmailSent = true
                setStatus("Verify your email before using duee.", kind: .warning)
                return
            }

            showVerifySentPage = false
            postRegisterEmail = ""
            postRegisterVerificationEmailSent = true
            try await loadTasks(using: client)
            clearStatus()
        } catch {
            applyError(error, fallback: "Could not connect to the web API.")
        }
    }

    func submitAuth() async {
        guard canSubmitAuth else {
            setStatus("Enter a valid email and password before continuing.", kind: .warning)
            return
        }

        guard let client else {
            setStatus("Web API is not configured.", kind: .error)
            return
        }

        isMutating = true
        defer { isMutating = false }

        let email = authEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        let password = authPassword

        do {
            try await client.ensureCsrfToken()

            switch authMode {
            case .signIn:
                let user = try await client.login(email: email, password: password)
                authPassword = ""
                sessionUser = user

                if !user.emailVerified {
                    tasks = []
                    showVerifySentPage = true
                    postRegisterEmail = user.email
                    postRegisterVerificationEmailSent = true
                    setStatus("Verify your email before using duee.", kind: .warning)
                    return
                }

                showVerifySentPage = false
                postRegisterEmail = ""
                postRegisterVerificationEmailSent = true
                try await loadTasks(using: client)
                clearStatus()
            case .register:
                let displayName = authDisplayName.trimmingCharacters(in: .whitespacesAndNewlines)
                let response = try await client.register(email: email, password: password, displayName: displayName)
                authMode = .signIn
                authPassword = ""
                sessionUser = nil
                tasks = []
                showVerifySentPage = true
                postRegisterEmail = (response.email ?? email).trimmingCharacters(in: .whitespacesAndNewlines)
                postRegisterVerificationEmailSent = response.verificationEmailSent ?? true
                if postRegisterVerificationEmailSent {
                    setStatus("Verification email sent. Check your inbox, then sign in.", kind: .info)
                } else {
                    setStatus("Account created, but verification email delivery failed. Resend it now.", kind: .warning)
                }
            }
        } catch {
            applyError(error, fallback: "Authentication failed.")
        }
    }

    func signOut() async {
        guard let client else {
            sessionUser = nil
            tasks = []
            showVerifySentPage = false
            postRegisterEmail = ""
            postRegisterVerificationEmailSent = true
            return
        }

        isMutating = true
        defer { isMutating = false }

        do {
            try await client.ensureCsrfToken()
            try await client.logout()
        } catch {
            // Best effort sign-out: clear local state regardless.
        }

        sessionUser = nil
        tasks = []
        authPassword = ""
        showVerifySentPage = false
        postRegisterEmail = ""
        postRegisterVerificationEmailSent = true
        setStatus("Signed out.", kind: .info)
    }

    func refreshTasks() async {
        guard let client else {
            setStatus("Web API is not configured.", kind: .error)
            return
        }

        guard sessionUser != nil else {
            setStatus("Sign in to load tasks.", kind: .info)
            return
        }

        guard !requiresEmailVerification else {
            tasks = []
            setStatus("Verify your email before using duee.", kind: .warning)
            return
        }

        isMutating = true
        defer { isMutating = false }

        do {
            try await loadTasks(using: client)
            clearStatus()
        } catch {
            applyError(error, fallback: "Could not refresh tasks.")
        }
    }

    func createTask(text: String, dueDate: Date?) async -> Bool {
        let cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else {
            setStatus("Task text cannot be empty.", kind: .warning)
            return false
        }

        guard let client else {
            setStatus("Web API is not configured.", kind: .error)
            return false
        }

        guard sessionUser != nil else {
            setStatus("Please sign in to add tasks.", kind: .warning)
            return false
        }

        guard !requiresEmailVerification else {
            setStatus("Verify your email before creating tasks.", kind: .warning)
            return false
        }

        isMutating = true
        defer { isMutating = false }

        do {
            try await client.ensureCsrfToken()
            _ = try await client.createTask(text: cleaned, dueDate: dueDate.map(Self.isoDayString(from:)))
            try await loadTasks(using: client)
            clearStatus()
            return true
        } catch {
            applyError(error, fallback: "Could not create task.")
            return false
        }
    }

    func setTaskCompletion(taskID: UUID, isCompleted: Bool) async {
        guard let client else {
            setStatus("Web API is not configured.", kind: .error)
            return
        }

        guard sessionUser != nil else {
            setStatus("Please sign in to update tasks.", kind: .warning)
            return
        }

        guard !requiresEmailVerification else {
            setStatus("Verify your email before updating tasks.", kind: .warning)
            return
        }

        isMutating = true
        defer { isMutating = false }

        do {
            try await client.ensureCsrfToken()
            _ = try await client.updateTask(
                id: taskID.uuidString.lowercased(),
                text: nil,
                hasDueDate: nil,
                dueDate: nil,
                isPinned: nil,
                isCompleted: isCompleted
            )
            try await loadTasks(using: client)
            clearStatus()
        } catch {
            applyError(error, fallback: "Could not update task.")
        }
    }

    func setTaskPinned(taskID: UUID, isPinned: Bool) async {
        guard let client else {
            setStatus("Web API is not configured.", kind: .error)
            return
        }

        guard sessionUser != nil else {
            setStatus("Please sign in to update tasks.", kind: .warning)
            return
        }

        guard !requiresEmailVerification else {
            setStatus("Verify your email before updating tasks.", kind: .warning)
            return
        }

        isMutating = true
        defer { isMutating = false }

        do {
            try await client.ensureCsrfToken()
            _ = try await client.updateTask(
                id: taskID.uuidString.lowercased(),
                text: nil,
                hasDueDate: nil,
                dueDate: nil,
                isPinned: isPinned,
                isCompleted: nil
            )
            try await loadTasks(using: client)
            clearStatus()
        } catch {
            applyError(error, fallback: "Could not update task pin status.")
        }
    }

    func updateTask(taskID: UUID, text: String, dueDate: Date?) async {
        let cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else {
            setStatus("Task text cannot be empty.", kind: .warning)
            return
        }

        guard let client else {
            setStatus("Web API is not configured.", kind: .error)
            return
        }

        guard sessionUser != nil else {
            setStatus("Please sign in to edit tasks.", kind: .warning)
            return
        }

        guard !requiresEmailVerification else {
            setStatus("Verify your email before editing tasks.", kind: .warning)
            return
        }

        isMutating = true
        defer { isMutating = false }

        do {
            try await client.ensureCsrfToken()
            _ = try await client.updateTask(
                id: taskID.uuidString.lowercased(),
                text: cleaned,
                hasDueDate: dueDate != nil,
                dueDate: dueDate.map(Self.isoDayString(from:)),
                isPinned: nil,
                isCompleted: nil
            )
            try await loadTasks(using: client)
            clearStatus()
        } catch {
            applyError(error, fallback: "Could not save task changes.")
        }
    }

    func deleteTask(taskID: UUID) async {
        guard let client else {
            setStatus("Web API is not configured.", kind: .error)
            return
        }

        guard sessionUser != nil else {
            setStatus("Please sign in to delete tasks.", kind: .warning)
            return
        }

        guard !requiresEmailVerification else {
            setStatus("Verify your email before deleting tasks.", kind: .warning)
            return
        }

        isMutating = true
        defer { isMutating = false }

        do {
            try await client.ensureCsrfToken()
            try await client.deleteTask(id: taskID.uuidString.lowercased())
            try await loadTasks(using: client)
            clearStatus()
        } catch {
            applyError(error, fallback: "Could not delete task.")
        }
    }

    func dismissVerificationPromptToSignIn() {
        guard !isSignedInAndUnverified else {
            return
        }

        showVerifySentPage = false
        clearStatus()
    }

    func resendVerificationFromVerifyPage() async {
        guard let client else {
            setStatus("Web API is not configured.", kind: .error)
            return
        }

        let email = verifyPageEmail
        guard !email.isEmpty else {
            setStatus("We need your email to resend verification.", kind: .warning)
            return
        }

        isMutating = true
        defer { isMutating = false }

        do {
            try await client.ensureCsrfToken()
            if isSignedInAndUnverified {
                let payload = try await client.resendEmailVerification()
                if payload.alreadyVerified ?? false, let user = sessionUser {
                    sessionUser = DueeWebUser(
                        id: user.id,
                        email: user.email,
                        displayName: user.displayName,
                        createdAt: user.createdAt,
                        emailVerified: true,
                        emailVerifiedAt: user.emailVerifiedAt ?? Self.isoDateTimeString(from: .now)
                    )
                    showVerifySentPage = false
                    postRegisterEmail = ""
                    postRegisterVerificationEmailSent = true
                    try await loadTasks(using: client)
                    setStatus("Email is already verified. You can continue.", kind: .info)
                    return
                }
                setStatus("Verification email sent. Check your inbox.", kind: .info)
            } else {
                try await client.resendEmailVerification(email: email)
                setStatus("Verification email sent. Check your inbox, then sign in.", kind: .info)
            }

            postRegisterEmail = email
            postRegisterVerificationEmailSent = true
        } catch {
            applyError(error, fallback: "Could not resend verification email.")
        }
    }

    func deleteAccount(password: String) async {
        let cleanedPassword = password.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanedPassword.isEmpty else {
            setStatus("Password is required to delete your account.", kind: .warning)
            return
        }

        guard let client else {
            setStatus("Web API is not configured.", kind: .error)
            return
        }

        guard sessionUser != nil else {
            setStatus("Sign in to delete your account.", kind: .warning)
            return
        }

        isMutating = true
        defer { isMutating = false }

        do {
            try await client.ensureCsrfToken()
            try await client.deleteAccount(password: cleanedPassword)
            sessionUser = nil
            tasks = []
            authPassword = ""
            showVerifySentPage = false
            postRegisterEmail = ""
            postRegisterVerificationEmailSent = true
            setStatus("Your account has been deleted.", kind: .info)
        } catch {
            applyError(error, fallback: "Could not delete account.")
        }
    }

    func exportTodoListForDeveloperData() throws -> Data {
        try assertDeveloperToolsAvailable()
        let taskRecords = tasks.map(Self.developerRecord(from:))
        let payload = DueeDeveloperTaskExportPayload(
            version: 1,
            exportedAt: Self.isoDateTimeString(from: .now) ?? ISO8601DateFormatter().string(from: .now),
            taskCount: taskRecords.count,
            tasks: taskRecords
        )
        let data = try Self.developerJSONEncoder.encode(payload)
        setStatus("Todo list exported.", kind: .info)
        return data
    }

    func exportDebugSnapshotForDeveloperData() throws -> Data {
        try assertDeveloperToolsAvailable()
        let taskRecords = tasks.map(Self.developerRecord(from:))
        let completedCount = taskRecords.filter(\.isCompleted).count
        let payload = DueeDeveloperSnapshotPayload(
            version: 1,
            exportedAt: Self.isoDateTimeString(from: .now) ?? ISO8601DateFormatter().string(from: .now),
            user: sessionUser,
            authMode: authMode.rawValue,
            showVerifySentPage: showVerifySentPage,
            postRegisterEmail: postRegisterEmail,
            postRegisterVerificationEmailSent: postRegisterVerificationEmailSent,
            statusMessage: statusMessage,
            statusKind: Self.statusKindRawValue(statusKind),
            tasks: taskRecords,
            counts: DueeDeveloperSnapshotCounts(
                total: taskRecords.count,
                active: taskRecords.count - completedCount,
                completed: completedCount
            )
        )
        let data = try Self.developerJSONEncoder.encode(payload)
        setStatus("Debug snapshot exported.", kind: .info)
        return data
    }

    func importTodoListForDeveloper(data: Data, replace: Bool) async {
        guard let client else {
            setStatus("Web API is not configured.", kind: .error)
            return
        }

        do {
            try assertDeveloperToolsAvailable()
            let importedTasks = try Self.parseImportedTasksForDeveloper(data)

            isMutating = true
            defer { isMutating = false }

            try await client.ensureCsrfToken()
            if replace {
                let existingTaskIDs = tasks.map { $0.id.uuidString.lowercased() }
                for taskID in existingTaskIDs {
                    try await client.deleteTask(id: taskID)
                }
            }

            for importedTask in importedTasks {
                let created = try await client.createTask(
                    text: importedTask.text,
                    dueDate: importedTask.hasDueDate ? importedTask.dueDate.map(Self.isoDayString(from:)) : nil,
                    isPinned: importedTask.isPinned
                )

                if importedTask.isCompleted {
                    _ = try await client.updateTask(
                        id: created.id,
                        text: nil,
                        hasDueDate: nil,
                        dueDate: nil,
                        isPinned: nil,
                        isCompleted: true
                    )
                }
            }

            try await loadTasks(using: client)
            if replace {
                setStatus("Imported \(importedTasks.count) tasks and replaced existing tasks.", kind: .info)
            } else {
                setStatus("Imported \(importedTasks.count) tasks.", kind: .info)
            }
        } catch {
            applyError(error, fallback: "Could not import todo list.")
        }
    }

    func clearCompletedTasksForDeveloper() async {
        guard let client else {
            setStatus("Web API is not configured.", kind: .error)
            return
        }

        do {
            try assertDeveloperToolsAvailable()
            let completedTaskIDs = tasks
                .filter(\.isCompleted)
                .map { $0.id.uuidString.lowercased() }

            guard !completedTaskIDs.isEmpty else {
                setStatus("No completed tasks to clear.", kind: .info)
                return
            }

            isMutating = true
            defer { isMutating = false }

            try await client.ensureCsrfToken()
            for taskID in completedTaskIDs {
                try await client.deleteTask(id: taskID)
            }
            try await loadTasks(using: client)
            setStatus("Cleared \(completedTaskIDs.count) completed tasks.", kind: .info)
        } catch {
            applyError(error, fallback: "Could not clear completed tasks.")
        }
    }

    func forceSyncForDeveloper() async {
        setStatus("Syncing...", kind: .info)
        await refreshTasks()
        if statusKind == .info || statusMessage.isEmpty {
            setStatus("Sync complete.", kind: .info)
        }
    }

    private func loadTasks(using client: DueeWebAPIClient) async throws {
        let payloads = try await client.fetchTasks()
        tasks = payloads.compactMap(Self.mapTaskPayload)
    }

    private static func mapTaskPayload(_ payload: DueeWebTaskPayload) -> DueeTask? {
        guard let taskID = UUID(uuidString: payload.id) else {
            return nil
        }

        let createdAt = parseISODateTime(payload.createdAt) ?? .now
        let completedAt = parseISODateTime(payload.completedAt)
        let parsedDueDate = payload.hasDueDate ? parseIsoDay(payload.dueDate) : nil

        return DueeTask(
            id: taskID,
            dueDate: parsedDueDate,
            text: payload.text,
            isPinned: payload.isPinned,
            isCompleted: payload.isCompleted,
            createdAt: createdAt,
            completedAt: completedAt
        )
    }

    private func applyError(_ error: Error, fallback: String) {
        if let apiError = error as? DueeWebAPIError {
            if apiError.statusCode == 401 {
                sessionUser = nil
                tasks = []
                showVerifySentPage = false
                postRegisterEmail = ""
                postRegisterVerificationEmailSent = true
                setStatus("Session expired. Sign in again.", kind: .warning)
                return
            }

            if apiError.statusCode == 403,
               let user = sessionUser,
               !user.emailVerified,
               apiError.message.localizedCaseInsensitiveContains("verify your email") {
                tasks = []
                showVerifySentPage = true
                postRegisterEmail = user.email
                postRegisterVerificationEmailSent = true
                setStatus("Verify your email before using duee.", kind: .warning)
                return
            }

            let kind: DueeWebStatusKind = apiError.statusCode == 429 ? .warning : .error
            setStatus(apiError.message, kind: kind)
            return
        }

        let text = error.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
        setStatus(text.isEmpty ? fallback : text, kind: .error)
    }

    private func setStatus(_ message: String, kind: DueeWebStatusKind) {
        statusMessage = message
        statusKind = kind
    }

    private func clearStatus() {
        statusMessage = ""
        statusKind = .info
    }

    private func normalizeBaseURL(_ value: String) -> URL? {
        guard !value.isEmpty else {
            return nil
        }

        if let direct = URL(string: value), direct.scheme != nil, direct.host != nil {
            return direct
        }

        if let withHTTP = URL(string: "http://\(value)"), withHTTP.host != nil {
            return withHTTP
        }

        return nil
    }

    private static func parseIsoDay(_ value: String?) -> Date? {
        guard let value else { return nil }
        let parts = value.split(separator: "-")
        guard parts.count == 3,
              let year = Int(parts[0]),
              let month = Int(parts[1]),
              let day = Int(parts[2]) else {
            return nil
        }

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        let components = DateComponents(year: year, month: month, day: day)
        guard let date = calendar.date(from: components) else {
            return nil
        }
        return calendar.startOfDay(for: date)
    }

    private static let isoDateFormatterWithFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let isoDateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private static let isoDateFormatterOut: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let developerJSONEncoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }()

    private static func parseISODateTime(_ value: String?) -> Date? {
        guard let value else { return nil }
        return isoDateFormatterWithFractional.date(from: value)
            ?? isoDateFormatter.date(from: value)
    }

    private static func isoDateTimeString(from date: Date?) -> String? {
        guard let date else {
            return nil
        }
        return isoDateFormatterOut.string(from: date)
    }

    private static func isoDayString(from date: Date) -> String {
        let calendar = Calendar.current
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        let year = components.year ?? 1970
        let month = components.month ?? 1
        let day = components.day ?? 1
        return String(format: "%04d-%02d-%02d", year, month, day)
    }

    private func assertDeveloperToolsAvailable() throws {
        guard sessionUser != nil else {
            throw DueeWebAPIError(message: "Sign in to use developer tools.", statusCode: nil)
        }
        guard !requiresEmailVerification else {
            throw DueeWebAPIError(message: "Verify your email before using developer tools.", statusCode: 403)
        }
    }

    private static func statusKindRawValue(_ kind: DueeWebStatusKind) -> String {
        switch kind {
        case .info:
            return "info"
        case .warning:
            return "warning"
        case .error:
            return "error"
        }
    }

    private static func developerRecord(from task: DueeTask) -> DueeDeveloperTaskRecord {
        DueeDeveloperTaskRecord(
            text: task.text,
            hasDueDate: task.hasDueDate,
            dueDate: task.hasDueDate ? isoDayString(from: task.dueDate) : nil,
            isPinned: task.isPinned,
            isCompleted: task.isCompleted,
            createdAt: isoDateTimeString(from: task.createdAt),
            completedAt: isoDateTimeString(from: task.completedAt)
        )
    }

    private static func parseImportedTasksForDeveloper(_ data: Data) throws -> [DueeDeveloperImportedTask] {
        let parsed = try JSONSerialization.jsonObject(with: data)

        let taskCandidates: [Any]
        if let array = parsed as? [Any] {
            taskCandidates = array
        } else if let object = parsed as? [String: Any], let tasks = object["tasks"] as? [Any] {
            taskCandidates = tasks
        } else {
            throw DueeWebAPIError(
                message: "Import file must be a JSON array or an object with a tasks array.",
                statusCode: nil
            )
        }

        let normalized = taskCandidates.compactMap(Self.normalizeImportedTaskForDeveloper(_:))
        guard !normalized.isEmpty else {
            throw DueeWebAPIError(message: "Import file does not contain any valid tasks.", statusCode: nil)
        }

        return normalized
    }

    private static func normalizeImportedTaskForDeveloper(_ candidate: Any) -> DueeDeveloperImportedTask? {
        guard let task = candidate as? [String: Any] else {
            return nil
        }

        let text = (task["text"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !text.isEmpty else {
            return nil
        }

        let rawDueDate = (task["dueDate"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let hasDueDate = task["hasDueDate"] != nil
            ? boolValue(task["hasDueDate"])
            : ((rawDueDate?.isEmpty == false))

        let dueDate = hasDueDate ? parseIsoDay(rawDueDate) : nil
        let isCompleted = boolValue(task["isCompleted"])
        let isPinned = boolValue(task["isPinned"])

        return DueeDeveloperImportedTask(
            text: text,
            hasDueDate: dueDate != nil,
            dueDate: dueDate,
            isPinned: isPinned,
            isCompleted: isCompleted
        )
    }

    private static func boolValue(_ value: Any?) -> Bool {
        if let bool = value as? Bool {
            return bool
        }

        if let number = value as? NSNumber {
            return number.boolValue
        }

        if let string = value as? String {
            switch string.lowercased() {
            case "1", "true", "yes", "on":
                return true
            default:
                return false
            }
        }

        return false
    }
}

actor DueeWebAPIClient {
    private var baseURL: URL
    private let session: URLSession
    private let cookieStorage: HTTPCookieStorage
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    init(baseURL: URL) {
        self.baseURL = Self.normalized(baseURL: baseURL)

        let configuration = URLSessionConfiguration.default
        configuration.httpShouldSetCookies = true
        configuration.httpCookieAcceptPolicy = .always
        configuration.httpCookieStorage = HTTPCookieStorage.shared
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData

        self.session = URLSession(configuration: configuration)
        self.cookieStorage = configuration.httpCookieStorage ?? .shared
    }

    func fetchConfig() async throws -> DueeConfigPayload {
        let data = try await request(path: "/config", method: "GET", body: nil, includeCSRF: false)
        return try decoder.decode(DueeConfigPayload.self, from: data)
    }

    func ensureCsrfToken() async throws {
        _ = try await fetchConfig()
    }

    func fetchSession() async throws -> DueeWebSessionPayload {
        let data = try await request(path: "/auth/session", method: "GET", body: nil, includeCSRF: false)
        return try decoder.decode(DueeWebSessionPayload.self, from: data)
    }

    func login(email: String, password: String) async throws -> DueeWebUser {
        let payload = DueeAuthRequest(email: email, password: password, displayName: nil)
        let data = try await request(path: "/auth/login", method: "POST", body: try encoder.encode(payload))
        let envelope = try decoder.decode(DueeUserEnvelope.self, from: data)
        guard let user = envelope.user else {
            throw DueeWebAPIError(message: "Login response was invalid.", statusCode: nil)
        }
        return user
    }

    func register(email: String, password: String, displayName: String) async throws -> DueeWebRegisterPayload {
        let payload = DueeAuthRequest(email: email, password: password, displayName: displayName)
        let data = try await request(path: "/auth/register", method: "POST", body: try encoder.encode(payload))
        return try decoder.decode(DueeWebRegisterPayload.self, from: data)
    }

    func logout() async throws {
        _ = try await request(path: "/auth/logout", method: "POST", body: nil)
    }

    func resendEmailVerification() async throws -> DueeWebVerificationRequestPayload {
        let data = try await request(path: "/auth/email-verification/request", method: "POST", body: nil)
        return try decoder.decode(DueeWebVerificationRequestPayload.self, from: data)
    }

    func resendEmailVerification(email: String) async throws {
        let payload = DueeEmailVerificationRequest(email: email)
        _ = try await request(
            path: "/auth/email-verification/request",
            method: "POST",
            body: try encoder.encode(payload)
        )
    }

    func deleteAccount(password: String) async throws {
        let payload = DueeAccountDeleteRequest(password: password)
        _ = try await request(path: "/auth/account", method: "DELETE", body: try encoder.encode(payload))
    }

    func fetchTasks() async throws -> [DueeWebTaskPayload] {
        let data = try await request(path: "/tasks", method: "GET", body: nil, includeCSRF: false)
        let payload = try decoder.decode(DueeTasksEnvelope.self, from: data)
        return payload.tasks
    }

    func createTask(text: String, dueDate: String?, isPinned: Bool? = nil) async throws -> DueeWebTaskPayload {
        let payload = DueeTaskMutationRequest(
            text: text,
            hasDueDate: dueDate != nil,
            dueDate: dueDate,
            isPinned: isPinned,
            isCompleted: nil
        )
        let data = try await request(path: "/tasks", method: "POST", body: try encoder.encode(payload))
        let envelope = try decoder.decode(DueeTaskEnvelope.self, from: data)
        guard let task = envelope.task else {
            throw DueeWebAPIError(message: "Task response was invalid.", statusCode: nil)
        }
        return task
    }

    func updateTask(
        id: String,
        text: String?,
        hasDueDate: Bool?,
        dueDate: String?,
        isPinned: Bool?,
        isCompleted: Bool?
    ) async throws -> DueeWebTaskPayload {
        let payload = DueeTaskMutationRequest(
            text: text,
            hasDueDate: hasDueDate,
            dueDate: dueDate,
            isPinned: isPinned,
            isCompleted: isCompleted
        )
        let data = try await request(path: "/tasks/\(id)", method: "PATCH", body: try encoder.encode(payload))
        let envelope = try decoder.decode(DueeTaskEnvelope.self, from: data)
        guard let task = envelope.task else {
            throw DueeWebAPIError(message: "Task response was invalid.", statusCode: nil)
        }
        return task
    }

    func deleteTask(id: String) async throws {
        _ = try await request(path: "/tasks/\(id)", method: "DELETE", body: nil)
    }

    private func request(
        path: String,
        method: String,
        body: Data?,
        includeCSRF: Bool? = nil
    ) async throws -> Data {
        let uppercasedMethod = method.uppercased()
        var request = URLRequest(url: apiURL(path: path))
        request.httpMethod = uppercasedMethod
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 20

        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let shouldAttachCSRF = includeCSRF ?? ["POST", "PUT", "PATCH", "DELETE"].contains(uppercasedMethod)
        if shouldAttachCSRF,
           let csrfToken = csrfToken(for: request.url) {
            request.setValue(csrfToken, forHTTPHeaderField: "x-csrf-token")
        }

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw DueeWebAPIError(message: "Server returned an invalid response.", statusCode: nil)
        }

        guard (200 ... 299).contains(httpResponse.statusCode) else {
            throw parseAPIError(data: data, statusCode: httpResponse.statusCode)
        }

        return data
    }

    private func apiURL(path: String) -> URL {
        let normalizedPath = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if normalizedPath.isEmpty {
            return baseURL.appendingPathComponent("api", isDirectory: true)
        }

        let components = normalizedPath.split(separator: "/").map(String.init)
        return components.reduce(baseURL.appendingPathComponent("api", isDirectory: true)) { partial, component in
            partial.appendingPathComponent(component)
        }
    }

    private func csrfToken(for url: URL?) -> String? {
        guard let url else { return nil }
        return cookieStorage.cookies(for: url)?.first(where: { $0.name == "duee_csrf" })?.value
    }

    private func parseAPIError(data: Data, statusCode: Int) -> DueeWebAPIError {
        if let payload = try? decoder.decode(DueeErrorEnvelope.self, from: data),
           let message = payload.error,
           !message.isEmpty {
            return DueeWebAPIError(message: message, statusCode: statusCode)
        }

        return DueeWebAPIError(
            message: "Request failed with status \(statusCode).",
            statusCode: statusCode
        )
    }

    private static func normalized(baseURL: URL) -> URL {
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
        var normalizedPath = components?.path ?? ""
        while normalizedPath.count > 1 && normalizedPath.hasSuffix("/") {
            normalizedPath.removeLast()
        }
        if normalizedPath == "/" {
            normalizedPath = ""
        }
        components?.path = normalizedPath
        if let result = components?.url {
            return result
        }
        return baseURL
    }
}

struct DueeWebAPIError: LocalizedError {
    let message: String
    let statusCode: Int?

    var errorDescription: String? { message }
}

struct DueeConfigPayload: Decodable {
    let mode: String
    let debugLocalStorage: Bool
    let authRequired: Bool
}

private struct DueeErrorEnvelope: Decodable {
    let error: String?
}

private struct DueeUserEnvelope: Decodable {
    let user: DueeWebUser?
}

private struct DueeTaskEnvelope: Decodable {
    let task: DueeWebTaskPayload?
}

private struct DueeTasksEnvelope: Decodable {
    let tasks: [DueeWebTaskPayload]
}

private struct DueeAuthRequest: Encodable {
    let email: String
    let password: String
    let displayName: String?
}

private struct DueeTaskMutationRequest: Encodable {
    let text: String?
    let hasDueDate: Bool?
    let dueDate: String?
    let isPinned: Bool?
    let isCompleted: Bool?
}

private struct DueeEmailVerificationRequest: Encodable {
    let email: String
}

private struct DueeAccountDeleteRequest: Encodable {
    let password: String
}

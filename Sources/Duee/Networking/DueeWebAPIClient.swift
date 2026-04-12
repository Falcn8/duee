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

enum DueeWebStatusKind {
    case info
    case warning
    case error
}

struct DueeWebUser: Decodable, Equatable {
    let id: String
    let email: String
    let displayName: String
    let createdAt: String?
}

struct DueeWebTaskPayload: Decodable {
    let id: String
    let text: String
    let hasDueDate: Bool
    let dueDate: String?
    let isCompleted: Bool
    let createdAt: String?
    let completedAt: String?
}

struct DueeWebSessionPayload: Decodable {
    let authenticated: Bool
    let user: DueeWebUser?
}

@MainActor
final class DueeWebStore: ObservableObject {
    @Published private(set) var tasks: [DueeTask] = []
    @Published private(set) var sessionUser: DueeWebUser?
    @Published var authMode: DueeWebAuthMode = .signIn
    @Published var authDisplayName = ""
    @Published var authEmail = ""
    @Published var authPassword = ""
    @Published private(set) var isBootstrapping = false
    @Published private(set) var isMutating = false
    @Published private(set) var statusMessage = ""
    @Published private(set) var statusKind: DueeWebStatusKind = .info

    private var client: DueeWebAPIClient?
    private var activeBaseURLString = ""

    var isSignedIn: Bool {
        sessionUser != nil
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
            setStatus("Invalid API URL. Set a full URL such as http://localhost:8000.", kind: .error)
            return
        }

        if client == nil || activeBaseURLString != resolvedURL.absoluteString {
            client = DueeWebAPIClient(baseURL: resolvedURL)
            activeBaseURLString = resolvedURL.absoluteString
            sessionUser = nil
            tasks = []
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
                setStatus("Sign in to sync tasks from your web account.", kind: .info)
                return
            }

            sessionUser = user
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

            let user: DueeWebUser
            switch authMode {
            case .signIn:
                user = try await client.login(email: email, password: password)
            case .register:
                let displayName = authDisplayName.trimmingCharacters(in: .whitespacesAndNewlines)
                user = try await client.register(email: email, password: password, displayName: displayName)
                authMode = .signIn
            }

            sessionUser = user
            authPassword = ""
            try await loadTasks(using: client)
            clearStatus()
        } catch {
            applyError(error, fallback: "Authentication failed.")
        }
    }

    func signOut() async {
        guard let client else {
            sessionUser = nil
            tasks = []
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

        isMutating = true
        defer { isMutating = false }

        do {
            try await client.ensureCsrfToken()
            _ = try await client.updateTask(
                id: taskID.uuidString.lowercased(),
                text: nil,
                hasDueDate: nil,
                dueDate: nil,
                isCompleted: isCompleted
            )
            try await loadTasks(using: client)
            clearStatus()
        } catch {
            applyError(error, fallback: "Could not update task.")
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

        isMutating = true
        defer { isMutating = false }

        do {
            try await client.ensureCsrfToken()
            _ = try await client.updateTask(
                id: taskID.uuidString.lowercased(),
                text: cleaned,
                hasDueDate: dueDate != nil,
                dueDate: dueDate.map(Self.isoDayString(from:)),
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
                setStatus("Session expired. Sign in again.", kind: .warning)
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

    private static func parseISODateTime(_ value: String?) -> Date? {
        guard let value else { return nil }
        return isoDateFormatterWithFractional.date(from: value)
            ?? isoDateFormatter.date(from: value)
    }

    private static func isoDayString(from date: Date) -> String {
        let calendar = Calendar.current
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        let year = components.year ?? 1970
        let month = components.month ?? 1
        let day = components.day ?? 1
        return String(format: "%04d-%02d-%02d", year, month, day)
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

    func register(email: String, password: String, displayName: String) async throws -> DueeWebUser {
        let payload = DueeAuthRequest(email: email, password: password, displayName: displayName)
        let data = try await request(path: "/auth/register", method: "POST", body: try encoder.encode(payload))
        let envelope = try decoder.decode(DueeUserEnvelope.self, from: data)
        guard let user = envelope.user else {
            throw DueeWebAPIError(message: "Registration response was invalid.", statusCode: nil)
        }
        return user
    }

    func logout() async throws {
        _ = try await request(path: "/auth/logout", method: "POST", body: nil)
    }

    func fetchTasks() async throws -> [DueeWebTaskPayload] {
        let data = try await request(path: "/tasks", method: "GET", body: nil, includeCSRF: false)
        let payload = try decoder.decode(DueeTasksEnvelope.self, from: data)
        return payload.tasks
    }

    func createTask(text: String, dueDate: String?) async throws -> DueeWebTaskPayload {
        let payload = DueeTaskMutationRequest(
            text: text,
            hasDueDate: dueDate != nil,
            dueDate: dueDate,
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
        isCompleted: Bool?
    ) async throws -> DueeWebTaskPayload {
        let payload = DueeTaskMutationRequest(
            text: text,
            hasDueDate: hasDueDate,
            dueDate: dueDate,
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
    let isCompleted: Bool?
}

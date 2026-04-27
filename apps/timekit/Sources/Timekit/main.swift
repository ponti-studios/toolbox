import SwiftData
import EventKit
import Foundation

@main
struct TimekitApp {
    static func main() async {
        do {
            let cli = try CLI(arguments: Array(CommandLine.arguments.dropFirst()))
            try await run(cli.command)
        } catch let error as CLIError {
            fputs("error: \(error.description)\n", stderr)
            CLI.printUsageIfNeeded(for: error)
            exit(1)
        } catch {
            fputs("error: \(error.localizedDescription)\n", stderr)
            exit(1)
        }
    }

    private static func run(_ command: CLICommand) async throws {
        let calendarService = CalendarService()

        switch command {
        case .help:
            CLI.printUsage()
        case .doctor:
            print(doctorReport(calendarService: calendarService))
        case .auth(let login):
            try await runAuth(login: login, calendarService: calendarService)
        case .sync:
            try calendarService.requireAccess()
            let snapshotStore = try SnapshotStore()
            let snapshot = try calendarService.fetchSnapshot()
            try snapshotStore.save(snapshot)
            print(syncSummary(snapshot: snapshot))
        case .preview(let limit):
            let snapshotStore = try SnapshotStore()
            try preview(limit: limit, snapshotStore: snapshotStore)
        case .export(let format, let outputPath):
            let snapshotStore = try SnapshotStore()
            try export(format: format, outputPath: outputPath, snapshotStore: snapshotStore)
        case .dedupe(let options):
            try runDedupe(options: options, calendarService: calendarService)
        }
    }

    private static func runAuth(login: Bool, calendarService: CalendarService) async throws {
        let status = calendarService.authorizationStatus()
        print("Calendar access: \(calendarService.statusDescription(status))")

        guard login else {
            return
        }

        if calendarService.isAuthorized(status) {
            print("Calendar access is already granted.")
            return
        }

        print("Requesting calendar access...")
        let granted = try await calendarService.requestAccess()
        if granted {
            print("Calendar access granted.")
        } else {
            throw CLIError.calendarAccessDenied
        }
    }

    private static func runDedupe(options: DedupeOptions, calendarService: CalendarService) throws {
        try calendarService.requireAccess()

        let dateRange = try resolveDedupeRange(from: options.from, to: options.to)
        let liveEvents = try calendarService.fetchLiveEvents(
            start: dateRange.start,
            end: dateRange.end,
            calendarTitle: options.calendarTitle
        )

        let recurringEvents = liveEvents.filter(isRecurringEvent)
        let plan = buildDedupePlan(events: liveEvents, strictness: options.strictness)

        print(
            dedupeSummary(
                plan: plan,
                options: options,
                scannedEvents: liveEvents.count,
                recurringEvents: recurringEvents.count,
                dateRange: dateRange
            )
        )

        guard !plan.groups.isEmpty else {
            return
        }

        if options.apply {
            try calendarService.remove(events: plan.eventsToDelete)
            print("Deleted \(plan.eventsToDelete.count) duplicate event\(plan.eventsToDelete.count == 1 ? "" : "s") from Apple Calendar.")
        } else {
            print("Dry run only. Re-run with --apply to delete \(plan.eventsToDelete.count) event\(plan.eventsToDelete.count == 1 ? "" : "s").")
        }
    }

    private static func preview(limit: Int, snapshotStore: SnapshotStore) throws {
        guard let snapshot = try snapshotStore.loadSnapshot() else {
            throw CLIError.snapshotMissing
        }

        let previewEvents = snapshot.events.sorted { $0.startDate < $1.startDate }.prefix(limit)
        guard !previewEvents.isEmpty else {
            print("No events found in the local SwiftData store.")
            return
        }

        print("Timekit Preview (showing \(previewEvents.count) of \(snapshot.events.count))")
        print("DATE\tTIME\tCALENDAR\tTITLE\tLOCATION")
        for event in previewEvents {
            let datePart = previewDateFormatter.string(from: event.startDate)
            let timePart = event.isAllDay ? "all day" : previewTimeFormatter.string(from: event.startDate)
            let location = event.location ?? ""
            print("\(datePart)\t\(timePart)\t\(event.calendarTitle)\t\(event.title)\t\(location)")
        }
    }

    private static func export(format: ExportFormat, outputPath: String?, snapshotStore: SnapshotStore) throws {
        guard let snapshot = try snapshotStore.loadSnapshot() else {
            throw CLIError.snapshotMissing
        }

        let destination = TimekitPaths.exportDestination(for: format, outputPath: outputPath)
        try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true, attributes: nil)

        switch format {
        case .jsonl:
            try exportJSONL(snapshot: snapshot, destination: destination)
        case .csv:
            try exportCSV(snapshot: snapshot, destination: destination)
        case .ics:
            try exportICS(snapshot: snapshot, destination: destination)
        }

        print("Exported to \(destination.path)")
    }

    private static func exportJSONL(snapshot: TimekitSnapshot, destination: URL) throws {
        let encoder = TimekitCoders.makeEncoder(prettyPrinted: false)
        let payload = try snapshot.events.map { event -> String in
            let data = try encoder.encode(event)
            guard let line = String(data: data, encoding: .utf8) else {
                throw CLIError.encodingFailed
            }

            return line
        }.joined(separator: "\n")

        try payload.write(to: destination, atomically: true, encoding: .utf8)
    }

    private static func exportCSV(snapshot: TimekitSnapshot, destination: URL) throws {
        var rows = ["calendar_title,title,start_date,end_date,is_all_day,location,notes,url,time_zone_identifier,is_recurring,attendee_count"]
        rows.append(contentsOf: snapshot.events.map { event in
            [
                csvEscape(event.calendarTitle),
                csvEscape(event.title),
                csvEscape(exportDateFormatter.string(from: event.startDate)),
                csvEscape(exportDateFormatter.string(from: event.endDate)),
                csvEscape(event.isAllDay ? "true" : "false"),
                csvEscape(event.location ?? ""),
                csvEscape(event.notes ?? ""),
                csvEscape(event.url ?? ""),
                csvEscape(event.timeZoneIdentifier ?? ""),
                csvEscape(event.isRecurring ? "true" : "false"),
                csvEscape(String(event.attendeeCount))
            ].joined(separator: ",")
        })

        try rows.joined(separator: "\n").write(to: destination, atomically: true, encoding: .utf8)
    }

    private static func exportICS(snapshot: TimekitSnapshot, destination: URL) throws {
        var lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Timekit//Swift Calendar CLI//EN",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH"
        ]

        for event in snapshot.events {
            lines.append("BEGIN:VEVENT")
            lines.append("UID:\(icsEscape(event.identifier))@timekit")
            if event.isAllDay {
                lines.append("DTSTART;VALUE=DATE:\(icsDayFormatter.string(from: event.startDate))")
                lines.append("DTEND;VALUE=DATE:\(icsDayFormatter.string(from: event.endDate))")
            } else {
                lines.append("DTSTART:\(icsDateTimeFormatter.string(from: event.startDate))")
                lines.append("DTEND:\(icsDateTimeFormatter.string(from: event.endDate))")
            }
            lines.append("SUMMARY:\(icsEscape(event.title))")
            if let location = event.location, !location.isEmpty {
                lines.append("LOCATION:\(icsEscape(location))")
            }
            if let notes = event.notes, !notes.isEmpty {
                lines.append("DESCRIPTION:\(icsEscape(notes))")
            }
            lines.append("END:VEVENT")
        }

        lines.append("END:VCALENDAR")
        try lines.joined(separator: "\n").write(to: destination, atomically: true, encoding: .utf8)
    }
}

enum CLICommand {
    case help
    case doctor
    case auth(login: Bool)
    case sync
    case preview(limit: Int)
    case export(format: ExportFormat, outputPath: String?)
    case dedupe(DedupeOptions)
}

enum ExportFormat: String {
    case jsonl
    case csv
    case ics
}

enum DedupeStrictness: String, CaseIterable {
    case strict
    case medium
    case loose

    init?(cliValue: String) {
        self.init(rawValue: cliValue.lowercased())
    }
}

struct DedupeOptions {
    let strictness: DedupeStrictness
    let apply: Bool
    let calendarTitle: String?
    let from: String?
    let to: String?
}

struct CLI {
    let command: CLICommand

    init(arguments: [String]) throws {
        let normalizedArguments = arguments.first == "--" ? Array(arguments.dropFirst()) : arguments

        guard let first = normalizedArguments.first else {
            self.command = .help
            return
        }

        switch first {
        case "--help", "-h", "help":
            self.command = .help
        case "doctor":
            self.command = .doctor
        case "auth":
            self.command = try Self.parseAuth(Array(normalizedArguments.dropFirst()))
        case "sync":
            self.command = .sync
        case "preview":
            self.command = try Self.parsePreview(Array(normalizedArguments.dropFirst()))
        case "export":
            self.command = try Self.parseExport(Array(normalizedArguments.dropFirst()))
        case "dedupe":
            self.command = try Self.parseDedupe(Array(normalizedArguments.dropFirst()))
        default:
            throw CLIError.unknownCommand(first)
        }
    }

    private static func parseAuth(_ arguments: [String]) throws -> CLICommand {
        var login = false

        for argument in arguments {
            switch argument {
            case "--help", "-h":
                return .help
            case "--login", "-l":
                login = true
            case "--":
                continue
            default:
                throw CLIError.unknownOption(argument)
            }
        }

        return .auth(login: login)
    }

    private static func parsePreview(_ arguments: [String]) throws -> CLICommand {
        var limit = 50
        var index = 0

        while index < arguments.count {
            let argument = arguments[index]
            switch argument {
            case "--help", "-h":
                return .help
            case "--limit", "-l":
                index += 1
                guard index < arguments.count else {
                    throw CLIError.missingValue("--limit")
                }
                guard let parsed = Int(arguments[index]), parsed > 0 else {
                    throw CLIError.invalidLimit
                }
                limit = parsed
            case "--":
                break
            default:
                throw CLIError.unknownOption(argument)
            }
            index += 1
        }

        return .preview(limit: limit)
    }

    private static func parseExport(_ arguments: [String]) throws -> CLICommand {
        var format: ExportFormat?
        var outputPath: String?
        var index = 0

        while index < arguments.count {
            let argument = arguments[index]
            switch argument {
            case "--help", "-h":
                return .help
            case "--format", "-f":
                index += 1
                guard index < arguments.count else {
                    throw CLIError.missingValue("--format")
                }
                guard let parsed = ExportFormat(rawValue: arguments[index]) else {
                    throw CLIError.invalidFormat(arguments[index])
                }
                format = parsed
            case "--output", "-o":
                index += 1
                guard index < arguments.count else {
                    throw CLIError.missingValue("--output")
                }
                outputPath = arguments[index]
            case "--":
                break
            default:
                throw CLIError.unknownOption(argument)
            }
            index += 1
        }

        guard let format else {
            throw CLIError.missingValue("--format")
        }

        return .export(format: format, outputPath: outputPath)
    }

    private static func parseDedupe(_ arguments: [String]) throws -> CLICommand {
        var strictness: DedupeStrictness = .strict
        var apply = false
        var calendarTitle: String?
        var from: String?
        var to: String?
        var index = 0

        while index < arguments.count {
            let argument = arguments[index]
            switch argument {
            case "--help", "-h":
                return .help
            case "--strictness", "-s":
                index += 1
                guard index < arguments.count else {
                    throw CLIError.missingValue("--strictness")
                }
                guard let parsed = DedupeStrictness(cliValue: arguments[index]) else {
                    throw CLIError.invalidStrictness(arguments[index])
                }
                strictness = parsed
            case "--calendar", "-c":
                index += 1
                guard index < arguments.count else {
                    throw CLIError.missingValue("--calendar")
                }
                calendarTitle = arguments[index]
            case "--from":
                index += 1
                guard index < arguments.count else {
                    throw CLIError.missingValue("--from")
                }
                from = arguments[index]
            case "--to":
                index += 1
                guard index < arguments.count else {
                    throw CLIError.missingValue("--to")
                }
                to = arguments[index]
            case "--apply":
                apply = true
            case "--":
                break
            default:
                throw CLIError.unknownOption(argument)
            }
            index += 1
        }

        return .dedupe(
            DedupeOptions(
                strictness: strictness,
                apply: apply,
                calendarTitle: calendarTitle,
                from: from,
                to: to
            )
        )
    }

    static func printUsage() {
        let usage = """
        usage:
            timekit doctor
            timekit auth [--login]
            timekit sync
            timekit preview [--limit N]
            timekit export --format <jsonl|csv|ics> [--output PATH]
            timekit dedupe [--strictness <strict|medium|loose>] [--calendar NAME] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--apply]

        examples:
            timekit doctor
            timekit auth --login
            timekit sync
            timekit preview --limit 25
            timekit export --format jsonl
            timekit dedupe --strictness strict
            timekit dedupe --strictness medium --calendar "Personal"
            timekit dedupe --strictness loose --from 2026-01-01 --to 2026-12-31 --apply

        notes:
            - timekit uses macOS EventKit to access Apple Calendar.
            - sync writes into ~/.hominem/db.sqlite.
            - preview and export read the local SwiftData store.
            - dedupe reads and deletes real Apple Calendar events.
            - dedupe is a dry run unless you pass --apply.
            - dedupe includes recurring occurrences in the scan.
            - when recurring duplicates are applied, duplicate occurrences are removed with EventKit using `.thisEvent`.

        """
        fputs(usage, stdout)
    }

    static func printUsageIfNeeded(for error: CLIError) {
        switch error {
        case .unknownCommand,
             .unknownOption,
             .missingValue,
             .invalidLimit,
             .invalidFormat,
             .invalidStrictness,
             .invalidDate,
             .invalidDateRange:
            print("\n")
            printUsage()
        case .calendarAccessDenied, .snapshotMissing, .encodingFailed:
            break
        }
    }
}

enum CLIError: Error, CustomStringConvertible {
    case unknownCommand(String)
    case unknownOption(String)
    case missingValue(String)
    case invalidLimit
    case invalidFormat(String)
    case invalidStrictness(String)
    case invalidDate(String)
    case invalidDateRange
    case calendarAccessDenied
    case snapshotMissing
    case encodingFailed

    var description: String {
        switch self {
        case .unknownCommand(let command):
            return "unknown command: \(command)"
        case .unknownOption(let option):
            return "unknown option: \(option)"
        case .missingValue(let option):
            return "missing value for \(option)"
        case .invalidLimit:
            return "--limit must be a positive integer"
        case .invalidFormat(let format):
            return "invalid format: \(format)"
        case .invalidStrictness(let strictness):
            return "invalid strictness: \(strictness) (expected strict, medium, or loose)"
        case .invalidDate(let value):
            return "invalid date: \(value) (expected YYYY-MM-DD)"
        case .invalidDateRange:
            return "--from must be earlier than or equal to --to"
        case .calendarAccessDenied:
            return "calendar access was denied"
        case .snapshotMissing:
            return "no local events found; run `timekit sync` first"
        case .encodingFailed:
            return "failed to encode export data"
        }
    }
}

struct TimekitSnapshot: Codable {
    let createdAt: Date
    let rangeStart: Date
    let rangeEnd: Date
    let calendars: [CalendarSnapshot]
    let events: [EventSnapshot]
}

@Model
final class EventRecord {
    @Attribute(.unique) var identifier: String
    var calendarIdentifier: String
    var calendarTitle: String
    var title: String
    var startDate: Date
    var endDate: Date
    var isAllDay: Bool
    var location: String?
    var notes: String?
    var url: String?
    var timeZoneIdentifier: String?
    var isRecurring: Bool
    var attendeeCount: Int
    var syncedAt: Date

    init(snapshot: EventSnapshot, syncedAt: Date) {
        self.identifier = snapshot.identifier
        self.calendarIdentifier = snapshot.calendarIdentifier
        self.calendarTitle = snapshot.calendarTitle
        self.title = snapshot.title
        self.startDate = snapshot.startDate
        self.endDate = snapshot.endDate
        self.isAllDay = snapshot.isAllDay
        self.location = snapshot.location
        self.notes = snapshot.notes
        self.url = snapshot.url
        self.timeZoneIdentifier = snapshot.timeZoneIdentifier
        self.isRecurring = snapshot.isRecurring
        self.attendeeCount = snapshot.attendeeCount
        self.syncedAt = syncedAt
    }

    func update(from snapshot: EventSnapshot, syncedAt: Date) {
        calendarIdentifier = snapshot.calendarIdentifier
        calendarTitle = snapshot.calendarTitle
        title = snapshot.title
        startDate = snapshot.startDate
        endDate = snapshot.endDate
        isAllDay = snapshot.isAllDay
        location = snapshot.location
        notes = snapshot.notes
        url = snapshot.url
        timeZoneIdentifier = snapshot.timeZoneIdentifier
        isRecurring = snapshot.isRecurring
        attendeeCount = snapshot.attendeeCount
        self.syncedAt = syncedAt
    }

    func snapshot() -> EventSnapshot {
        EventSnapshot(
            identifier: identifier,
            calendarIdentifier: calendarIdentifier,
            calendarTitle: calendarTitle,
            title: title,
            startDate: startDate,
            endDate: endDate,
            isAllDay: isAllDay,
            location: location,
            notes: notes,
            url: url,
            timeZoneIdentifier: timeZoneIdentifier,
            isRecurring: isRecurring,
            attendeeCount: attendeeCount
        )
    }
}

struct CalendarSnapshot: Codable {
    let identifier: String
    let title: String
    let type: String
    let sourceTitle: String?
}

struct EventSnapshot: Codable {
    let identifier: String
    let calendarIdentifier: String
    let calendarTitle: String
    let title: String
    let startDate: Date
    let endDate: Date
    let isAllDay: Bool
    let location: String?
    let notes: String?
    let url: String?
    let timeZoneIdentifier: String?
    let isRecurring: Bool
    let attendeeCount: Int
}

final class CalendarService {
    private let store = EKEventStore()

    func authorizationStatus() -> EKAuthorizationStatus {
        EKEventStore.authorizationStatus(for: .event)
    }

    func isAuthorized(_ status: EKAuthorizationStatus) -> Bool {
        if #available(macOS 14.0, *) {
            switch status {
            case .fullAccess:
                return true
            case .writeOnly, .notDetermined, .restricted, .denied:
                return false
            @unknown default:
                return false
            }
        }

        return false
    }

    func statusDescription(_ status: EKAuthorizationStatus) -> String {
        if #available(macOS 14.0, *) {
            switch status {
            case .notDetermined:
                return "not determined"
            case .restricted:
                return "restricted"
            case .denied:
                return "denied"
            case .writeOnly:
                return "write only"
            case .fullAccess:
                return "full access"
            @unknown default:
                return "unknown"
            }
        }

        return "unknown"
    }

    func requireAccess() throws {
        let status = authorizationStatus()
        guard isAuthorized(status) else {
            throw CLIError.calendarAccessDenied
        }
    }

    func requestAccess() async throws -> Bool {
        let currentStatus = authorizationStatus()
        if isAuthorized(currentStatus) {
            return true
        }

        return try await withCheckedThrowingContinuation { continuation in
            store.requestFullAccessToEvents { granted, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }

                continuation.resume(returning: granted)
            }
        }
    }

    func defaultRange(referenceDate: Date = Date()) -> (start: Date, end: Date) {
        let calendar = Calendar.autoupdatingCurrent
        let start = calendar.date(byAdding: .month, value: -12, to: referenceDate) ?? referenceDate
        let end = calendar.date(byAdding: .month, value: 6, to: referenceDate) ?? referenceDate
        return (start, end)
    }

    func fetchSnapshot() throws -> TimekitSnapshot {
        try requireAccess()

        let now = Date()
        let range = defaultRange(referenceDate: now)
        let calendars = store.calendars(for: .event)
        let snapshots = calendars.map(CalendarSnapshot.init).sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
        let events = fetchEventSnapshots(start: range.start, end: range.end, calendars: calendars)

        return TimekitSnapshot(
            createdAt: now,
            rangeStart: range.start,
            rangeEnd: range.end,
            calendars: snapshots,
            events: events
        )
    }

    func fetchLiveEvents(start: Date, end: Date, calendarTitle: String?) throws -> [EKEvent] {
        try requireAccess()

        let calendars = store.calendars(for: .event)
            .filter(\.allowsContentModifications)
            .filter { calendar in
                guard let calendarTitle, !calendarTitle.isEmpty else {
                    return true
                }
                return calendar.title.localizedCaseInsensitiveCompare(calendarTitle) == .orderedSame
            }

        guard !calendars.isEmpty, start < end else {
            return []
        }

        var results: [EKEvent] = []
        var seenOccurrences = Set<String>()
        var cursor = start
        let calendar = Calendar(identifier: .gregorian)

        while cursor < end {
            let next = calendar.date(byAdding: .year, value: 1, to: cursor) ?? end
            let chunkEnd = min(next, end)
            let predicate = store.predicateForEvents(withStart: cursor, end: chunkEnd, calendars: calendars)

            for event in store.events(matching: predicate) {
                let occurrenceKey = liveEventOccurrenceKey(event)
                if seenOccurrences.insert(occurrenceKey).inserted {
                    results.append(event)
                }
            }

            cursor = chunkEnd
        }

        return results.sorted {
            if $0.startDate != $1.startDate {
                return $0.startDate < $1.startDate
            }
            return ($0.title ?? "").localizedCaseInsensitiveCompare($1.title ?? "") == .orderedAscending
        }
    }

    func remove(events: [EKEvent]) throws {
        guard !events.isEmpty else {
            return
        }

        do {
            for event in events {
                try store.remove(event, span: .thisEvent, commit: false)
            }
            try store.commit()
        } catch {
            store.reset()
            throw error
        }
    }

    private func fetchEventSnapshots(start: Date, end: Date, calendars: [EKCalendar]) -> [EventSnapshot] {
        guard !calendars.isEmpty else {
            return []
        }

        let predicate = store.predicateForEvents(withStart: start, end: end, calendars: calendars)
        return store.events(matching: predicate)
            .sorted { $0.startDate < $1.startDate }
            .map(EventSnapshot.init)
    }
}

struct SnapshotStore {
    private let container: ModelContainer
    private let context: ModelContext

    init() throws {
        try TimekitPaths.ensureDirectories()
        let configuration = ModelConfiguration(url: TimekitPaths.databaseURL, cloudKitDatabase: .none)
        container = try ModelContainer(for: EventRecord.self, configurations: configuration)
        context = ModelContext(container)
        context.autosaveEnabled = false
    }

    func loadSnapshot() throws -> TimekitSnapshot? {
        let descriptor = FetchDescriptor<EventRecord>(sortBy: [SortDescriptor(\EventRecord.startDate)])
        let records = try context.fetch(descriptor)
        guard !records.isEmpty else {
            return nil
        }

        let events = records.map { $0.snapshot() }
        let latestSync = records.map(\.syncedAt).max() ?? Date()
        let earliestStart = events.map(\.startDate).min() ?? latestSync
        let latestEnd = events.map(\.endDate).max() ?? latestSync
        let calendars = Dictionary(grouping: records, by: \EventRecord.calendarIdentifier)
            .compactMap { _, grouped in grouped.first }
            .map { CalendarSnapshot(identifier: $0.calendarIdentifier, title: $0.calendarTitle, type: "event", sourceTitle: nil) }
            .sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }

        return TimekitSnapshot(
            createdAt: latestSync,
            rangeStart: earliestStart,
            rangeEnd: latestEnd,
            calendars: calendars,
            events: events
        )
    }

    func save(_ snapshot: TimekitSnapshot) throws {
        try mergeRecords(with: snapshot.events, syncedAt: snapshot.createdAt)
    }

    private func mergeRecords(with events: [EventSnapshot], syncedAt: Date) throws {
        let fetchDescriptor = FetchDescriptor<EventRecord>()
        let existingRecords = try context.fetch(fetchDescriptor)
        var recordsByIdentifier = Dictionary(uniqueKeysWithValues: existingRecords.map { ($0.identifier, $0) })

        for event in events {
            if let record = recordsByIdentifier[event.identifier] {
                record.update(from: event, syncedAt: syncedAt)
            } else {
                let record = EventRecord(snapshot: event, syncedAt: syncedAt)
                context.insert(record)
                recordsByIdentifier[event.identifier] = record
            }
        }

        try context.save()
    }
}

enum TimekitPaths {
    static let supportRoot = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".hominem", isDirectory: true)
    static let cacheRoot = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Caches/timekit", isDirectory: true)
    static let exportsRoot = supportRoot.appendingPathComponent("exports", isDirectory: true)
    static let databaseURL = supportRoot.appendingPathComponent("db.sqlite")

    static func ensureDirectories() throws {
        try FileManager.default.createDirectory(at: supportRoot, withIntermediateDirectories: true, attributes: nil)
        try FileManager.default.createDirectory(at: cacheRoot, withIntermediateDirectories: true, attributes: nil)
        try FileManager.default.createDirectory(at: exportsRoot, withIntermediateDirectories: true, attributes: nil)
    }

    static func exportDestination(for format: ExportFormat, outputPath: String?) -> URL {
        if let outputPath, !outputPath.isEmpty {
            return URL(fileURLWithPath: outputPath)
        }

        switch format {
        case .jsonl:
            return exportsRoot.appendingPathComponent("timekit_events.jsonl")
        case .csv:
            return exportsRoot.appendingPathComponent("timekit_events.csv")
        case .ics:
            return exportsRoot.appendingPathComponent("timekit_events.ics")
        }
    }
}

enum TimekitCoders {
    static func makeEncoder(prettyPrinted: Bool) -> JSONEncoder {
        let encoder = JSONEncoder()
        if prettyPrinted {
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        } else {
            encoder.outputFormatting = [.sortedKeys]
        }
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(TimekitDateCoder.string(from: date))
        }
        return encoder
    }

    static func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)
            guard let date = TimekitDateCoder.date(from: string) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid ISO-8601 date: \(string)")
            }

            return date
        }
        return decoder
    }
}

enum TimekitDateCoder {
    static func encodingFormatter() -> ISO8601DateFormatter {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }

    static func decodingFormatters() -> [ISO8601DateFormatter] {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        let standard = ISO8601DateFormatter()
        standard.formatOptions = [.withInternetDateTime]

        return [fractional, standard]
    }

    static func string(from date: Date) -> String {
        encodingFormatter().string(from: date)
    }

    static func date(from string: String) -> Date? {
        for formatter in decodingFormatters() {
            if let date = formatter.date(from: string) {
                return date
            }
        }

        return legacyDayFormatter.date(from: string)
    }
}

private let legacyDayFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
}()

private let previewDateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = .autoupdatingCurrent
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
}()

private let previewTimeFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = .autoupdatingCurrent
    formatter.dateFormat = "HH:mm"
    return formatter
}()

private let exportDateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss'Z'"
    return formatter
}()

private let icsDateTimeFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
    return formatter
}()

private let icsDayFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyyMMdd"
    return formatter
}()

private let dedupeDayFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = .autoupdatingCurrent
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
}()

private struct DedupeDateRange {
    let start: Date
    let end: Date
    let usedDefaultStart: Bool
    let usedDefaultEnd: Bool
}

private struct DedupeGroup {
    let key: String
    let keeper: EKEvent
    let duplicates: [EKEvent]
}

private struct DedupePlan {
    let groups: [DedupeGroup]

    var eventsToDelete: [EKEvent] {
        groups.flatMap(\.duplicates)
    }
}

private func resolveDedupeRange(from: String?, to: String?) throws -> DedupeDateRange {
    let start = try from.map(parseCLIStartDate) ?? defaultDedupeStartDate()
    let end = try to.map(parseCLIInclusiveEndDate) ?? defaultDedupeEndDateExclusive()

    guard start <= end else {
        throw CLIError.invalidDateRange
    }

    return DedupeDateRange(
        start: start,
        end: end,
        usedDefaultStart: from == nil,
        usedDefaultEnd: to == nil
    )
}

private func defaultDedupeStartDate() -> Date {
    makeFixedGregorianDate(year: 1900, month: 1, day: 1)
}

private func defaultDedupeEndDateExclusive() -> Date {
    makeFixedGregorianDate(year: 2101, month: 1, day: 1)
}

private func makeFixedGregorianDate(year: Int, month: Int, day: Int) -> Date {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .autoupdatingCurrent

    return calendar.date(from: DateComponents(year: year, month: month, day: day)) ?? Date()
}

private func parseCLIStartDate(_ value: String) throws -> Date {
    guard let day = legacyDayFormatter.date(from: value) else {
        throw CLIError.invalidDate(value)
    }
    return day
}

private func parseCLIInclusiveEndDate(_ value: String) throws -> Date {
    let day = try parseCLIStartDate(value)
    guard let end = Calendar.autoupdatingCurrent.date(byAdding: .day, value: 1, to: day) else {
        throw CLIError.invalidDate(value)
    }
    return end
}

private func isRecurringEvent(_ event: EKEvent) -> Bool {
    !(event.recurrenceRules?.isEmpty ?? true)
}

private func liveEventOccurrenceKey(_ event: EKEvent) -> String {
    [
        event.calendarItemIdentifier,
        TimekitDateCoder.string(from: event.startDate),
        TimekitDateCoder.string(from: event.endDate),
        normalizedDedupeText(event.title)
    ].joined(separator: "|")
}

private func buildDedupePlan(events: [EKEvent], strictness: DedupeStrictness) -> DedupePlan {
    let grouped = Dictionary(grouping: events, by: { dedupeKey(for: $0, strictness: strictness) })

    let groups = grouped
        .filter { $0.value.count > 1 }
        .map { key, events -> DedupeGroup in
            let ordered = events.sorted(by: dedupeKeeperSort)
            return DedupeGroup(key: key, keeper: ordered[0], duplicates: Array(ordered.dropFirst()))
        }
        .sorted { lhs, rhs in
            if lhs.keeper.startDate != rhs.keeper.startDate {
                return lhs.keeper.startDate < rhs.keeper.startDate
            }
            if lhs.keeper.calendar.title != rhs.keeper.calendar.title {
                return lhs.keeper.calendar.title.localizedCaseInsensitiveCompare(rhs.keeper.calendar.title) == .orderedAscending
            }
            return (lhs.keeper.title ?? "").localizedCaseInsensitiveCompare(rhs.keeper.title ?? "") == .orderedAscending
        }

    return DedupePlan(groups: groups)
}

private func dedupeSummary(
    plan: DedupePlan,
    options: DedupeOptions,
    scannedEvents: Int,
    recurringEvents: Int,
    dateRange: DedupeDateRange
) -> String {
    let formatter = exportDateFormatter
    var lines = [
        "Timekit Dedupe",
        "Strictness: \(options.strictness.rawValue)",
        "Mode: \(options.apply ? "apply" : "dry-run")",
        "Calendar filter: \(options.calendarTitle ?? "all writable calendars")",
        "Range: \(formatter.string(from: dateRange.start)) to \(formatter.string(from: dateRange.end))"
    ]

    if dateRange.usedDefaultStart || dateRange.usedDefaultEnd {
        lines.append("Range defaults: start=\(dateRange.usedDefaultStart ? "default" : "explicit"), end=\(dateRange.usedDefaultEnd ? "default" : "explicit")")
    }

    lines.append("Scanned writable events: \(scannedEvents)")
    if recurringEvents > 0 {
        lines.append("Recurring occurrences in scan: \(recurringEvents)")
    }

    let duplicateCount = plan.eventsToDelete.count
    lines.append("Duplicate groups: \(plan.groups.count)")
    lines.append("Duplicate events to delete: \(duplicateCount)")

    if plan.groups.isEmpty {
        lines.append("No duplicates found.")
        return lines.joined(separator: "\n")
    }

    for (index, group) in plan.groups.enumerated() {
        lines.append("")
        lines.append("Group \(index + 1): \(dedupeEventSummary(group.keeper))")
        lines.append("  keep   \(dedupeEventIdentity(group.keeper))")
        for duplicate in group.duplicates {
            lines.append("  delete \(dedupeEventIdentity(duplicate))")
        }
    }

    return lines.joined(separator: "\n")
}

private func dedupeKeeperSort(_ lhs: EKEvent, _ rhs: EKEvent) -> Bool {
    let lhsScore = dedupeRetentionScore(lhs)
    let rhsScore = dedupeRetentionScore(rhs)
    if lhsScore != rhsScore {
        return lhsScore > rhsScore
    }
    if lhs.startDate != rhs.startDate {
        return lhs.startDate < rhs.startDate
    }
    return lhs.calendarItemIdentifier < rhs.calendarItemIdentifier
}

private func dedupeRetentionScore(_ event: EKEvent) -> Int {
    var score = 0
    if !normalizedDedupeText(event.location).isEmpty {
        score += 3
    }
    if !normalizedDedupeText(event.notes).isEmpty {
        score += 3
    }
    if let url = event.url?.absoluteString, !normalizedDedupeText(url).isEmpty {
        score += 2
    }
    if !(event.attendees?.isEmpty ?? true) {
        score += 1
    }
    return score
}

private func dedupeKey(for event: EKEvent, strictness: DedupeStrictness) -> String {
    let calendarIdentifier = event.calendar.calendarIdentifier
    let title = normalizedDedupeText(event.title)
    let start = TimekitDateCoder.string(from: event.startDate)
    let end = TimekitDateCoder.string(from: event.endDate)
    let isAllDay = event.isAllDay ? "1" : "0"

    switch strictness {
    case .strict:
        let location = normalizedDedupeText(event.location)
        let notes = normalizedDedupeText(event.notes)
        let url = normalizedDedupeText(event.url?.absoluteString)
        return [calendarIdentifier, title, start, end, isAllDay, location, notes, url].joined(separator: "|")
    case .medium:
        return [calendarIdentifier, title, start, end, isAllDay].joined(separator: "|")
    case .loose:
        let day = dedupeDayFormatter.string(from: event.startDate)
        return [calendarIdentifier, title, day, isAllDay].joined(separator: "|")
    }
}

private func normalizedDedupeText(_ value: String?) -> String {
    let collapsed = (value ?? "")
        .components(separatedBy: .whitespacesAndNewlines)
        .filter { !$0.isEmpty }
        .joined(separator: " ")
        .trimmingCharacters(in: .whitespacesAndNewlines)

    return collapsed
        .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .autoupdatingCurrent)
        .lowercased()
}

private func dedupeEventSummary(_ event: EKEvent) -> String {
    let title = event.title?.isEmpty == false ? event.title! : "Untitled"
    let date = event.isAllDay
        ? dedupeDayFormatter.string(from: event.startDate)
        : exportDateFormatter.string(from: event.startDate)
    let recurringMarker = isRecurringEvent(event) ? " [recurring]" : ""
    return "[\(event.calendar.title)] \(title) @ \(date)\(recurringMarker)"
}

private func dedupeEventIdentity(_ event: EKEvent) -> String {
    let title = event.title?.isEmpty == false ? event.title! : "Untitled"
    let date = event.isAllDay
        ? dedupeDayFormatter.string(from: event.startDate)
        : exportDateFormatter.string(from: event.startDate)
    let recurringMarker = isRecurringEvent(event) ? " | recurring" : ""
    return "\(event.calendarItemIdentifier) | \(event.calendar.title) | \(title) | \(date)\(recurringMarker)"
}

private func doctorReport(calendarService: CalendarService) -> String {
    let status = calendarService.authorizationStatus()
    let databaseExists = FileManager.default.fileExists(atPath: TimekitPaths.databaseURL.path)
    let databaseLabel = databaseExists ? "present" : "missing"

    return """
    Timekit Health Check
    Platform: \(ProcessInfo.processInfo.operatingSystemVersionString)
    EventKit: available
    Calendar access: \(calendarService.statusDescription(status))
    SwiftData store: \(databaseLabel)
    Support root: \(TimekitPaths.supportRoot.path)
    Cache root: \(TimekitPaths.cacheRoot.path)
    Exports root: \(TimekitPaths.exportsRoot.path)
    """
}

private func syncSummary(snapshot: TimekitSnapshot) -> String {
    let groupedEvents = Dictionary(grouping: snapshot.events, by: { $0.calendarTitle })
    let sortedCalendars = groupedEvents.keys.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    let calendarCount = snapshot.calendars.count
    let eventCount = snapshot.events.count

    var lines = [
        "Synced \(eventCount) events from \(calendarCount) calendars.",
        "Cached range: \(exportDateFormatter.string(from: snapshot.rangeStart)) to \(exportDateFormatter.string(from: snapshot.rangeEnd))"
    ]

    for calendarTitle in sortedCalendars {
        lines.append("- \(calendarTitle): \(groupedEvents[calendarTitle]?.count ?? 0) events")
    }

    lines.append("SwiftData store at \(TimekitPaths.databaseURL.path)")
    return lines.joined(separator: "\n")
}

private func csvEscape(_ value: String) -> String {
    if value.contains(",") || value.contains("\"") || value.contains("\n") || value.contains("\r") {
        let escaped = value.replacingOccurrences(of: "\"", with: "\"\"")
        return "\"\(escaped)\""
    }

    return value
}

private func icsEscape(_ value: String) -> String {
    value
        .replacingOccurrences(of: "\\", with: "\\\\")
        .replacingOccurrences(of: ";", with: "\\;")
        .replacingOccurrences(of: ",", with: "\\,")
        .replacingOccurrences(of: "\n", with: "\\n")
        .replacingOccurrences(of: "\r", with: "")
}

private extension CalendarSnapshot {
    init(_ calendar: EKCalendar) {
        self.identifier = calendar.calendarIdentifier
        self.title = calendar.title
        self.type = String(describing: calendar.type)
        self.sourceTitle = calendar.source.title
    }
}

private extension EventSnapshot {
    init(_ event: EKEvent) {
        self.identifier = event.calendarItemIdentifier
        self.calendarIdentifier = event.calendar.calendarIdentifier
        self.calendarTitle = event.calendar.title
        self.title = event.title ?? "Untitled"
        self.startDate = event.startDate
        self.endDate = event.endDate
        self.isAllDay = event.isAllDay
        self.location = event.location
        self.notes = event.notes
        self.url = event.url?.absoluteString
        self.timeZoneIdentifier = event.timeZone?.identifier
        self.isRecurring = !(event.recurrenceRules?.isEmpty ?? true)
        self.attendeeCount = event.attendees?.count ?? 0
    }
}

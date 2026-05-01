import SwiftData
import EventKit
import Foundation
import Darwin

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
        let searchProgress = ProgressBar(label: "Search", total: 1)
        let liveEvents = try calendarService.fetchLiveEvents(
            start: dateRange.start,
            end: dateRange.end,
            calendarTitle: options.calendarTitle,
            progress: { snapshot in
                searchProgress.setTotal(max(snapshot.totalSteps, 1))
                let detail = "\(snapshot.currentCalendarTitle) \(snapshot.currentCalendarIndex)/\(snapshot.totalCalendars) · \(snapshot.currentChunkLabel) · \(snapshot.eventCount) events"
                searchProgress.update(current: snapshot.processedSteps, detail: detail)
                if snapshot.processedSteps == snapshot.totalSteps {
                    searchProgress.finish(detail: detail)
                }
            }
        )

        print(searchCalendarCountsSummary(events: liveEvents))

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
            let applyProgress = ProgressBar(label: "Apply", total: max(plan.eventsToDelete.count, 1))
            try calendarService.remove(events: plan.eventsToDelete) { snapshot in
                let detail = "\(snapshot.currentCalendarTitle) · \(snapshot.processed)/\(snapshot.total) deleted"
                applyProgress.update(current: snapshot.processed, detail: detail)
                if snapshot.processed == snapshot.total {
                    applyProgress.finish(detail: detail)
                }
            }
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

struct TimekitSnapshot: Codable {
    let createdAt: Date
    let rangeStart: Date
    let rangeEnd: Date
    let calendars: [CalendarSnapshot]
    let events: [EventSnapshot]
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

    func fetchLiveEvents(
        start: Date,
        end: Date,
        calendarTitle: String?,
        progress: ((SearchProgressSnapshot) -> Void)? = nil
    ) throws -> [EKEvent] {
        try requireAccess()

        let calendars = store.calendars(for: .event)
            .filter(\.allowsContentModifications)
            .filter { calendar in
                guard let calendarTitle, !calendarTitle.isEmpty else {
                    return true
                }
                return calendar.title.localizedCaseInsensitiveCompare(calendarTitle) == .orderedSame
            }
            .sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }

        guard !calendars.isEmpty, start < end else {
            progress?(
                SearchProgressSnapshot(
                    processedSteps: 0,
                    totalSteps: 0,
                    eventCount: 0,
                    currentCalendarTitle: "no calendars",
                    currentCalendarIndex: 0,
                    totalCalendars: 0,
                    currentChunkLabel: "n/a"
                )
            )
            return []
        }

        let chunks = makeYearChunks(start: start, end: end)
        let totalSteps = calendars.count * max(chunks.count, 1)
        var results: [EKEvent] = []
        var seenOccurrences = Set<String>()
        var processedSteps = 0

        for (calendarIndex, calendar) in calendars.enumerated() {
            for chunk in chunks {
                let predicate = store.predicateForEvents(withStart: chunk.start, end: chunk.end, calendars: [calendar])

                for event in store.events(matching: predicate) {
                    let occurrenceKey = liveEventOccurrenceKey(event)
                    if seenOccurrences.insert(occurrenceKey).inserted {
                        results.append(event)
                    }
                }

                processedSteps += 1
                progress?(
                    SearchProgressSnapshot(
                        processedSteps: processedSteps,
                        totalSteps: totalSteps,
                        eventCount: results.count,
                        currentCalendarTitle: calendar.title,
                        currentCalendarIndex: calendarIndex + 1,
                        totalCalendars: calendars.count,
                        currentChunkLabel: chunkRangeLabel(start: chunk.start, endExclusive: chunk.end)
                    )
                )
            }
        }

        return results.sorted {
            if $0.startDate != $1.startDate {
                return $0.startDate < $1.startDate
            }
            return ($0.title ?? "").localizedCaseInsensitiveCompare($1.title ?? "") == .orderedAscending
        }
    }

    func remove(events: [EKEvent], progress: ((ApplyProgressSnapshot) -> Void)? = nil) throws {
        guard !events.isEmpty else {
            progress?(ApplyProgressSnapshot(processed: 0, total: 0, currentCalendarTitle: "no calendars"))
            return
        }

        do {
            for (index, event) in events.enumerated() {
                try store.remove(event, span: .thisEvent, commit: false)
                progress?(
                    ApplyProgressSnapshot(
                        processed: index + 1,
                        total: events.count,
                        currentCalendarTitle: event.calendar.title
                    )
                )
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


private final class ProgressBar {
    private let label: String
    private let width: Int
    private let interactive: Bool
    private let startedAt = Date()
    private var total: Int
    private var finished = false

    init(label: String, total: Int, width: Int = 28) {
        self.label = label
        self.total = max(total, 1)
        self.width = max(width, 10)
        self.interactive = isatty(STDOUT_FILENO) != 0
    }

    func setTotal(_ total: Int) {
        guard !finished else {
            return
        }
        self.total = max(total, 1)
    }

    func update(current: Int, detail: String? = nil) {
        guard !finished else {
            return
        }

        let clamped = min(max(current, 0), total)
        let ratio = Double(clamped) / Double(total)
        let filled = min(width, Int((ratio * Double(width)).rounded(.down)))
        let bar = String(repeating: "#", count: filled) + String(repeating: "-", count: max(width - filled, 0))
        let percent = Int((ratio * 100).rounded(.down))
        let etaSuffix = progressTimingSuffix(current: clamped)
        let suffixParts = [detail, etaSuffix].compactMap { $0 }.filter { !$0.isEmpty }
        let suffix = suffixParts.isEmpty ? "" : " " + suffixParts.joined(separator: " · ")
        let line = String(format: "%@ [%@] %3d%% (%d/%d)%@", label, bar, percent, clamped, total, suffix)

        if interactive {
            fputs("\r\(line)", stdout)
            fflush(stdout)
        } else {
            print(line)
        }
    }

    func finish(detail: String? = nil) {
        guard !finished else {
            return
        }
        finished = true
        updateFinalLine(detail: detail)
    }

    private func progressTimingSuffix(current: Int) -> String? {
        guard current > 0, current < total else {
            return current >= total ? elapsedLabel() : nil
        }

        let elapsed = Date().timeIntervalSince(startedAt)
        guard elapsed > 0 else {
            return nil
        }

        let rate = elapsed / Double(current)
        let remaining = max(Double(total - current) * rate, 0)
        return "eta \(formatDuration(remaining))"
    }

    private func elapsedLabel() -> String {
        "elapsed \(formatDuration(Date().timeIntervalSince(startedAt)))"
    }

    private func updateFinalLine(detail: String?) {
        let suffixParts = [detail, elapsedLabel()].compactMap { $0 }.filter { !$0.isEmpty }
        let suffix = suffixParts.isEmpty ? "" : " " + suffixParts.joined(separator: " · ")
        let line = String(format: "%@ [%@] 100%% (%d/%d)%@", label, String(repeating: "#", count: width), total, total, suffix)
        if interactive {
            fputs("\r\(line)\n", stdout)
            fflush(stdout)
        } else {
            print(line)
        }
    }
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

await TimekitApp.main()

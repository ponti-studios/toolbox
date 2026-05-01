import Foundation
import EventKit

func formatDuration(_ interval: TimeInterval) -> String {
    let seconds = max(Int(interval.rounded()), 0)
    let hours = seconds / 3600
    let minutes = (seconds % 3600) / 60
    let remainingSeconds = seconds % 60

    if hours > 0 {
        return String(format: "%dh %02dm", hours, minutes)
    }
    if minutes > 0 {
        return String(format: "%dm %02ds", minutes, remainingSeconds)
    }
    return String(format: "%ds", remainingSeconds)
}

func chunkRangeLabel(start: Date, endExclusive: Date) -> String {
    let inclusiveEnd = endExclusive.addingTimeInterval(-1)
    return "\(progressChunkDateFormatter.string(from: start))→\(progressChunkDateFormatter.string(from: inclusiveEnd))"
}

func searchCalendarCountsSummary(events: [EKEvent]) -> String {
    let grouped = Dictionary(grouping: events, by: { $0.calendar.title })
    let sortedTitles = grouped.keys.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }

    guard !sortedTitles.isEmpty else {
        return "Search calendar totals:\n- none"
    }

    var lines = ["Search calendar totals:"]
    for title in sortedTitles {
        lines.append("- \(title): \(grouped[title]?.count ?? 0) events")
    }
    return lines.joined(separator: "\n")
}

func yearChunkCount(start: Date, end: Date) -> Int {
    makeYearChunks(start: start, end: end).count
}

func makeYearChunks(start: Date, end: Date) -> [DateChunk] {
    guard start < end else {
        return []
    }

    var chunks: [DateChunk] = []
    var cursor = start
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .autoupdatingCurrent

    while cursor < end {
        let next = calendar.date(byAdding: .year, value: 1, to: cursor) ?? end
        let chunkEnd = min(next, end)
        chunks.append(DateChunk(start: cursor, end: chunkEnd))
        cursor = chunkEnd
    }

    return chunks
}

func resolveDedupeRange(from: String?, to: String?) throws -> DedupeDateRange {
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

func defaultDedupeStartDate() -> Date {
    makeFixedGregorianDate(year: 1900, month: 1, day: 1)
}

func defaultDedupeEndDateExclusive() -> Date {
    makeFixedGregorianDate(year: 2101, month: 1, day: 1)
}

func makeFixedGregorianDate(year: Int, month: Int, day: Int) -> Date {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .autoupdatingCurrent

    return calendar.date(from: DateComponents(year: year, month: month, day: day)) ?? Date()
}

func parseCLIStartDate(_ value: String) throws -> Date {
    guard let day = legacyDayFormatter.date(from: value) else {
        throw CLIError.invalidDate(value)
    }
    return day
}

func parseCLIInclusiveEndDate(_ value: String) throws -> Date {
    let day = try parseCLIStartDate(value)
    guard let end = Calendar.autoupdatingCurrent.date(byAdding: .day, value: 1, to: day) else {
        throw CLIError.invalidDate(value)
    }
    return end
}

func isRecurringEvent(_ event: EKEvent) -> Bool {
    !(event.recurrenceRules?.isEmpty ?? true)
}

func liveEventOccurrenceKey(_ event: EKEvent) -> String {
    [
        event.calendarItemIdentifier,
        TimekitDateCoder.string(from: event.startDate),
        TimekitDateCoder.string(from: event.endDate),
        normalizedDedupeText(event.title)
    ].joined(separator: "|")
}

func buildDedupePlan(events: [EKEvent], strictness: DedupeStrictness) -> DedupePlan {
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

func dedupeSummary(
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

func dedupeKeeperSort(_ lhs: EKEvent, _ rhs: EKEvent) -> Bool {
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

func dedupeRetentionScore(_ event: EKEvent) -> Int {
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

func dedupeKey(for event: EKEvent, strictness: DedupeStrictness) -> String {
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

func normalizedDedupeText(_ value: String?) -> String {
    let collapsed = (value ?? "")
        .components(separatedBy: .whitespacesAndNewlines)
        .filter { !$0.isEmpty }
        .joined(separator: " ")
        .trimmingCharacters(in: .whitespacesAndNewlines)

    return collapsed
        .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .autoupdatingCurrent)
        .lowercased()
}

func dedupeEventSummary(_ event: EKEvent) -> String {
    let title = event.title?.isEmpty == false ? event.title! : "Untitled"
    let date = event.isAllDay
        ? dedupeDayFormatter.string(from: event.startDate)
        : exportDateFormatter.string(from: event.startDate)
    let recurringMarker = isRecurringEvent(event) ? " [recurring]" : ""
    return "[\(event.calendar.title)] \(title) @ \(date)\(recurringMarker)"
}

func dedupeEventIdentity(_ event: EKEvent) -> String {
    let title = event.title?.isEmpty == false ? event.title! : "Untitled"
    let date = event.isAllDay
        ? dedupeDayFormatter.string(from: event.startDate)
        : exportDateFormatter.string(from: event.startDate)
    let recurringMarker = isRecurringEvent(event) ? " | recurring" : ""
    return "\(event.calendarItemIdentifier) | \(event.calendar.title) | \(title) | \(date)\(recurringMarker)"
}

func doctorReport(calendarService: CalendarService) -> String {
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

func syncSummary(snapshot: TimekitSnapshot) -> String {
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

func csvEscape(_ value: String) -> String {
    if value.contains(",") || value.contains("\"") || value.contains("\n") || value.contains("\r") {
        let escaped = value.replacingOccurrences(of: "\"", with: "\"\"")
        return "\"\(escaped)\""
    }

    return value
}

func icsEscape(_ value: String) -> String {
    value
        .replacingOccurrences(of: "\\", with: "\\\\")
        .replacingOccurrences(of: ";", with: "\\;")
        .replacingOccurrences(of: ",", with: "\\,")
        .replacingOccurrences(of: "\n", with: "\\n")
        .replacingOccurrences(of: "\r", with: "")
}
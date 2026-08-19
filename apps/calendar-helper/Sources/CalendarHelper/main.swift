import EventKit
import Foundation

private enum JSONValue: Codable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(Double.self) { self = .number(value) }
        else if let value = try? container.decode(String.self) { self = .string(value) }
        else if let value = try? container.decode([String: JSONValue].self) { self = .object(value) }
        else { self = .array(try container.decode([JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }

    var string: String? { if case .string(let value) = self { return value }; return nil }
    var bool: Bool? { if case .bool(let value) = self { return value }; return nil }
    var int: Int? { if case .number(let value) = self { return Int(value) }; return nil }
    var array: [JSONValue]? { if case .array(let value) = self { return value }; return nil }
}

private struct Request: Codable {
    let script: String
    let args: [String: JSONValue]
}

private struct CalendarInfo {
    let calendar: EKCalendar
    let id: String
    let name: String
    let source: String
    let writable: Bool
}

private struct CalendarLookupError: Error {
    let response: [String: JSONValue]
}

private let calendarAccessMessage = "Calendar access not granted. Enable Full Access (not Add Only) in System Settings > Privacy & Security > Calendars (Options… button) for the responsible app."
private let addOnlyMessage = "Calendar access is set to Add Only (write-only). Change it to Full Access in System Settings > Privacy & Security > Calendars (Options… button)."

@main
struct CalendarHelper {
    static func main() async {
        do {
            let input = FileHandle.standardInput.readDataToEndOfFile()
            let request = try JSONDecoder().decode(Request.self, from: input)
            let response = try await handle(request)
            try write(response)
        } catch {
            try? write(errorResponse(code: "HELPER_ERROR", message: error.localizedDescription))
            Foundation.exit(1)
        }
    }

    private static func handle(_ request: Request) async throws -> [String: JSONValue] {
        let store = EKEventStore()
        if let accessError = await ensureAccess(store) { return accessError }

        switch request.script {
        case "setup": return ["ok": .bool(true), "message": .string("Calendar access granted")]
        case "calendars": return calendars(store)
        case "events": return events(store, args: request.args)
        case "event": return event(store, args: request.args)
        case "create": return create(store, args: request.args)
        case "update": return update(store, args: request.args)
        case "delete": return delete(store, args: request.args)
        case "freebusy": return freebusy(store, args: request.args)
        case "scan": return scan(store, args: request.args)
        case "mutate": return mutate(store, args: request.args)
        default: return errorResponse(code: "JXA_ERROR", message: "Unknown calendar operation: \(request.script)")
        }
    }

    private static func ensureAccess(_ store: EKEventStore) async -> [String: JSONValue]? {
        let status = EKEventStore.authorizationStatus(for: .event)
        if status == .fullAccess { return nil }
        if status == .writeOnly { return errorResponse(code: "NOT_AUTHORIZED", message: addOnlyMessage) }
        if status == .notDetermined {
            do {
                let granted = try await store.requestFullAccessToEvents()
                if granted { return nil }
            } catch { }
        }
        return errorResponse(code: "NOT_AUTHORIZED", message: calendarAccessMessage)
    }

    private static func calendars(_ store: EKEventStore) -> [String: JSONValue] {
        let values: [[String: JSONValue]] = calendarInfos(store).map { info in
            ["id": .string(info.id), "name": .string(info.name), "source": .string(info.source), "writable": .bool(info.writable)]
        }
        let indexed = values.enumerated().map { index, value -> JSONValue in
            var value = value
            value["index"] = .string(String(index))
            return .object(value)
        }
        return ["calendars": .array(indexed)]
    }

    private static func calendarInfos(_ store: EKEventStore) -> [CalendarInfo] {
        store.calendars(for: .event).map {
            CalendarInfo(calendar: $0, id: $0.calendarIdentifier, name: $0.title, source: $0.source.title, writable: $0.allowsContentModifications)
        }.sorted { ($0.source, $0.name, $0.id) < ($1.source, $1.name, $1.id) }
    }

    private static func findCalendar(_ store: EKEventStore, args: [String: JSONValue]) -> Result<CalendarInfo, CalendarLookupError> {
        let infos = calendarInfos(store)
        if let id = args["calendarId"]?.string {
            if let info = infos.first(where: { $0.id == id }) { return .success(info) }
            return .failure(CalendarLookupError(response: errorResponse(code: "CALENDAR_NOT_FOUND", message: "Calendar with ID \"\(id)\" not found")))
        }
        if let index = args["calendarIndex"]?.int {
            if infos.indices.contains(index) { return .success(infos[index]) }
            return .failure(CalendarLookupError(response: errorResponse(code: "CALENDAR_NOT_FOUND", message: "Calendar with index \"\(index)\" not found")))
        }
        let name = args["calendarName"]?.string ?? ""
        let matches = infos.filter { $0.name == name }
        if matches.count == 1 { return .success(matches[0]) }
        if matches.count > 1 {
            return .failure(CalendarLookupError(response: errorResponse(code: "AMBIGUOUS_CALENDAR", message: "Multiple calendars named \"\(name)\". Use --calendar-id with one of: \(matches.map(\.id).joined(separator: ", "))")))
        }
        return .failure(CalendarLookupError(response: errorResponse(code: "CALENDAR_NOT_FOUND", message: "Calendar \"\(name)\" not found")))
    }

    private static func events(_ store: EKEventStore, args: [String: JSONValue]) -> [String: JSONValue] {
        guard case .success(let info) = findCalendar(store, args: args) else { return findCalendarError(store, args: args) }
        let from = parseDate(args["from"]?.string) ?? Date()
        let to = parseDate(args["to"]?.string) ?? Calendar.current.date(byAdding: .day, value: 7, to: from)!
        let max = args["max"]?.int ?? 50
        let query = args["query"]?.string?.lowercased()
        var current = from
        var events: [EKEvent] = []
        var seen = Set<String>()
        while current < to {
            let next = min(Calendar.current.date(byAdding: .year, value: 1, to: current) ?? to, to)
            for event in store.events(matching: store.predicateForEvents(withStart: current, end: next, calendars: [info.calendar])) {
                let key = "\(event.eventIdentifier ?? event.calendarItemIdentifier)|\(event.startDate?.timeIntervalSinceReferenceDate ?? 0)"
                if seen.insert(key).inserted { events.append(event) }
            }
            current = next
        }
        let values = events.compactMap { event -> JSONValue? in
            let text = "\(event.title ?? "") \(event.location ?? "") \(event.notes ?? "")".lowercased()
            guard query == nil || text.contains(query!) else { return nil }
            return .object(eventValue(event, calendar: info))
        }.sorted { ($0.objectValue?["start"]?.string ?? "") < ($1.objectValue?["start"]?.string ?? "") }
        return ["events": .array(Array(values.prefix(max))), "count": .number(Double(min(values.count, max))), "truncated": .bool(values.count > max)]
    }

    private static func scan(_ store: EKEventStore, args: [String: JSONValue]) -> [String: JSONValue] {
        guard case .success(let info) = findCalendar(store, args: args) else { return findCalendarError(store, args: args) }
        let from = parseDate(args["from"]?.string) ?? Date(timeIntervalSince1970: 0)
        let to = parseDate(args["to"]?.string) ?? Date()
        var current = from
        var events: [EKEvent] = []
        var seen = Set<String>()
        while current < to {
            let next = min(Calendar.current.date(byAdding: .year, value: 1, to: current) ?? to, to)
            let window = store.events(matching: store.predicateForEvents(withStart: current, end: next, calendars: [info.calendar]))
            for event in window {
                let key = "\(event.eventIdentifier ?? event.calendarItemIdentifier)|\(event.startDate?.timeIntervalSinceReferenceDate ?? 0)"
                if seen.insert(key).inserted { events.append(event) }
            }
            current = next
        }
        let values = events
            .map { JSONValue.object(eventValue($0, calendar: info)) }
            .sorted { ($0.objectValue?["start"]?.string ?? "") < ($1.objectValue?["start"]?.string ?? "") }
        return ["events": .array(values), "count": .number(Double(values.count))]
    }

    private static func mutate(_ store: EKEventStore, args: [String: JSONValue]) -> [String: JSONValue] {
        guard case .success(let info) = findCalendar(store, args: args) else { return findCalendarError(store, args: args) }
        var changes: [JSONValue] = []
        var skipped: [JSONValue] = []
        for rawChange in args["changes"]?.array ?? [] {
            guard let change = rawChange.objectValue,
                  let id = change["id"]?.string,
                  let event = store.event(withIdentifier: id),
                  event.calendar?.calendarIdentifier == info.id else {
                skipped.append(.object(["reason": .string("event not found")]))
                continue
            }
            let expected = change["expectedSummary"]?.string
            guard expected == nil || event.title == expected else {
                skipped.append(.object(["id": .string(id), "reason": .string("title changed since preview")]))
                continue
            }
            let action = change["action"]?.string
            do {
                if action == "rename", let summary = change["summary"]?.string {
                    let previous = event.title ?? ""
                    event.title = summary
                    try store.save(event, span: change["series"]?.bool == true ? .futureEvents : .thisEvent)
                    changes.append(.object(["action": .string("rename"), "id": .string(event.eventIdentifier), "uid": .string(event.calendarItemIdentifier), "previousSummary": .string(previous), "summary": .string(summary), "series": .bool(change["series"]?.bool == true)]))
                } else if action == "delete" {
                    let previous = eventValue(event, calendar: info)
                    try store.remove(event, span: .thisEvent)
                    changes.append(.object(["action": .string("delete"), "id": .string(id), "uid": .string(change["uid"]?.string ?? ""), "previous": .object(previous)]))
                } else {
                    skipped.append(.object(["id": .string(id), "reason": .string("unsupported mutation")]))
                }
            } catch {
                skipped.append(.object(["id": .string(id), "reason": .string(error.localizedDescription)]))
            }
        }
        return ["ok": .bool(true), "changes": .array(changes), "skipped": .array(skipped)]
    }

    private static func event(_ store: EKEventStore, args: [String: JSONValue]) -> [String: JSONValue] {
        guard case .success(let info) = findCalendar(store, args: args) else { return findCalendarError(store, args: args) }
        guard let id = args["eventId"]?.string, let value = store.event(withIdentifier: id), value.calendar?.calendarIdentifier == info.id else {
            return errorResponse(code: "EVENT_NOT_FOUND", message: "Event with ID \"\(args["eventId"]?.string ?? "")\" not found")
        }
        return ["event": .object(eventValue(value, calendar: info))]
    }

    private static func create(_ store: EKEventStore, args: [String: JSONValue]) -> [String: JSONValue] {
        guard case .success(let info) = findCalendar(store, args: args) else { return findCalendarError(store, args: args) }
        let allDay = args["allDay"]?.bool ?? false
        guard let start = parseDate(args["start"]?.string, allDay: allDay, end: false), let end = parseDate(args["end"]?.string, allDay: allDay, end: true), start < end else {
            return errorResponse(code: "INVALID_RANGE", message: allDay ? "Start date must not be after end date" : "Start must be before end")
        }
        let event = EKEvent(eventStore: store)
        event.calendar = info.calendar; event.title = args["summary"]?.string ?? ""; event.startDate = start; event.endDate = end; event.isAllDay = allDay
        event.location = args["location"]?.string; event.notes = args["description"]?.string
        do { try store.save(event, span: .thisEvent) } catch { return errorResponse(code: "JXA_ERROR", message: "Failed to create event: \(error.localizedDescription)") }
        var value: [String: JSONValue] = ["id": .string(event.eventIdentifier), "uid": .string(event.calendarItemIdentifier), "calendar": .string(info.name), "calendarId": .string(info.id), "summary": .string(event.title ?? ""), "allDay": .bool(allDay), "start": .string(displayDate(start, allDay: allDay)), "end": .string(displayDate(end, allDay: allDay, endDate: true))]
        if let location = event.location { value["location"] = .string(location) }; if let notes = event.notes { value["description"] = .string(notes) }
        return ["ok": .bool(true), "event": .object(value)]
    }

    private static func update(_ store: EKEventStore, args: [String: JSONValue]) -> [String: JSONValue] {
        guard case .success(let info) = findCalendar(store, args: args), let id = args["eventId"]?.string, let event = store.event(withIdentifier: id), event.calendar?.calendarIdentifier == info.id else { return errorResponse(code: "EVENT_NOT_FOUND", message: "Event not found") }
        let targetAllDay = args["allDay"]?.bool == true ? true : (args["noAllDay"]?.bool == true ? false : event.isAllDay)
        var start = event.startDate!; var end = event.endDate!
        if let value = args["start"]?.string { start = parseDate(value, allDay: targetAllDay, end: false) ?? start }
        if let value = args["end"]?.string { end = parseDate(value, allDay: targetAllDay, end: true) ?? end }
        if (args["allDay"]?.bool == true || args["noAllDay"]?.bool == true) && args["start"] == nil && args["end"] == nil { start = targetAllDay ? Calendar.current.startOfDay(for: start) : startOfHour(start, hour: 9); end = targetAllDay ? Calendar.current.date(byAdding: .day, value: 1, to: start)! : startOfHour(start, hour: 10) }
        guard start < end else { return errorResponse(code: "INVALID_RANGE", message: targetAllDay ? "Start date must be on or before end date" : "Start must be before end") }
        if let value = args["summary"]?.string { event.title = value }; if let value = args["location"]?.string { event.location = value }; if let value = args["description"]?.string { event.notes = value }
        event.isAllDay = targetAllDay; event.startDate = start; event.endDate = end
        do { try store.save(event, span: .thisEvent) } catch { return errorResponse(code: "JXA_ERROR", message: "Failed to update event: \(error.localizedDescription)") }
        return ["ok": .bool(true), "event": .object(["id": .string(event.eventIdentifier ?? id), "calendar": .string(info.name), "calendarId": .string(info.id), "summary": .string(event.title ?? ""), "allDay": .bool(targetAllDay), "start": .string(displayDate(start, allDay: targetAllDay)), "end": .string(displayDate(end, allDay: targetAllDay, endDate: true))]), "warning": .null]
    }

    private static func delete(_ store: EKEventStore, args: [String: JSONValue]) -> [String: JSONValue] {
        guard case .success(let info) = findCalendar(store, args: args), let id = args["eventId"]?.string, let event = store.event(withIdentifier: id), event.calendar?.calendarIdentifier == info.id else { return errorResponse(code: "EVENT_NOT_FOUND", message: "Event not found") }
        do { try store.remove(event, span: .thisEvent) } catch { return errorResponse(code: "JXA_ERROR", message: "Failed to delete event: \(error.localizedDescription)") }
        return ["ok": .bool(true), "deleted": .object(["id": .string(id), "calendar": .string(info.name), "calendarId": .string(info.id)]), "warning": .null]
    }

    private static func freebusy(_ store: EKEventStore, args: [String: JSONValue]) -> [String: JSONValue] {
        let infos = calendarInfos(store)
        let names = Set(args["calendars"]?.array?.compactMap(\.string) ?? [])
        let ids = Set(args["calendarIds"]?.array?.compactMap(\.string) ?? [])
        let indexes = Set(args["calendarIndexes"]?.array?.compactMap { $0.string ?? $0.int.map(String.init) } ?? [])
        let selected = infos.enumerated().filter { index, info in
            ids.contains(info.id) || names.contains(info.name) || indexes.contains(String(index))
        }.map(\.element)
        let from = parseDate(args["from"]?.string) ?? Date()
        let to = parseDate(args["to"]?.string) ?? from
        let matching = store.events(matching: store.predicateForEvents(withStart: from, end: to, calendars: selected.map(\.calendar)))
        let busyEvents = matching.filter { $0.status != .canceled && $0.availability != .free }
        let busy: [JSONValue] = busyEvents.map { event in
            .object([
                "calendar": .string(event.calendar?.title ?? ""),
                "calendarId": .string(event.calendar?.calendarIdentifier ?? ""),
                "summary": .string(event.title ?? "(No title)"),
                "start": .string(formatLocal(event.startDate!)),
                "end": .string(formatLocal(event.endDate!)),
                "startISO": .string(event.startDate!.ISO8601Format()),
                "endISO": .string(event.endDate!.ISO8601Format())
            ])
        }.sorted { left, right in
            (left.objectValue?["start"]?.string ?? "") < (right.objectValue?["start"]?.string ?? "")
        }
        let requested = names.union(ids)
        let missing = requested.filter { value in !infos.contains { $0.id == value || $0.name == value } }.sorted()
        var result: [String: JSONValue] = ["busy": .array(busy)]
        if !missing.isEmpty { result["calendarsNotFound"] = .array(missing.map(JSONValue.string)) }
        return result
    }

    private static func findCalendarError(_ store: EKEventStore, args: [String: JSONValue]) -> [String: JSONValue] { if case .failure(let error) = findCalendar(store, args: args) { return error.response }; return errorResponse(code: "CALENDAR_NOT_FOUND", message: "Calendar not found") }
    private static func eventValue(_ event: EKEvent, calendar: CalendarInfo) -> [String: JSONValue] { let start = event.startDate!; let end = event.endDate!; let displayEnd = event.isAllDay ? Calendar.current.date(byAdding: .day, value: -1, to: end)! : end; return ["id": .string(event.eventIdentifier), "uid": .string(event.calendarItemIdentifier), "calendar": .string(calendar.name), "calendarId": .string(calendar.id), "summary": .string(event.title ?? ""), "location": .string(event.location ?? ""), "description": .string(event.notes ?? ""), "allDay": .bool(event.isAllDay), "start": .string(displayDate(start, allDay: event.isAllDay)), "end": .string(displayDate(displayEnd, allDay: event.isAllDay)), "startISO": .string(start.ISO8601Format()), "endISO": .string(displayEnd.ISO8601Format()), "isRecurring": .bool(event.hasRecurrenceRules)] }
    private static func parseDate(_ value: String?, allDay: Bool = false, end: Bool = false) -> Date? { guard let value else { return nil }; let formatter = ISO8601DateFormatter(); if value.count == 10 { let parts = value.split(separator: "-").compactMap { Int($0) }; guard parts.count == 3 else { return nil }; var components = DateComponents(); components.year = parts[0]; components.month = parts[1]; components.day = parts[2]; components.hour = 0; components.minute = 0; components.second = 0; guard let date = Calendar.current.date(from: components) else { return nil }; return allDay && end ? Calendar.current.date(byAdding: .day, value: 1, to: date) : date }; return formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
    private static func displayDate(_ date: Date, allDay: Bool, endDate: Bool = false) -> String { allDay ? formatDateOnly(date) : formatLocal(date) }
    private static func formatDateOnly(_ date: Date) -> String { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = .current; return f.string(from: date) }
    private static func formatLocal(_ date: Date) -> String { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"; f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = .current; return f.string(from: date) }
    private static func startOfHour(_ date: Date, hour: Int) -> Date { var c = Calendar.current.dateComponents([.year, .month, .day], from: date); c.hour = hour; return Calendar.current.date(from: c)! }
    private static func errorResponse(code: String, message: String) -> [String: JSONValue] { ["ok": .bool(false), "error": .object(["code": .string(code), "message": .string(message)])] }
    private static func write(_ value: [String: JSONValue]) throws { let data = try JSONEncoder().encode(value); FileHandle.standardOutput.write(data); FileHandle.standardOutput.write(Data([10])) }
}

private extension JSONValue {
    var objectValue: [String: JSONValue]? { if case .object(let value) = self { return value }; return nil }
}

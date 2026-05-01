import SwiftData
import Foundation

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
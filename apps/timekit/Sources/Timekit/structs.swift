import Foundation
import EventKit

struct SearchProgressSnapshot {
    let processedSteps: Int
    let totalSteps: Int
    let eventCount: Int
    let currentCalendarTitle: String
    let currentCalendarIndex: Int
    let totalCalendars: Int
    let currentChunkLabel: String
}

struct ApplyProgressSnapshot {
    let processed: Int
    let total: Int
    let currentCalendarTitle: String
}

struct DateChunk {
    let start: Date
    let end: Date
}

struct DedupeDateRange {
    let start: Date
    let end: Date
    let usedDefaultStart: Bool
    let usedDefaultEnd: Bool
}

struct DedupeGroup {
    let key: String
    let keeper: EKEvent
    let duplicates: [EKEvent]
}

struct DedupePlan {
    let groups: [DedupeGroup]

    var eventsToDelete: [EKEvent] {
        groups.flatMap(\.duplicates)
    }
}
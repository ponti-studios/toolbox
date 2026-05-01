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
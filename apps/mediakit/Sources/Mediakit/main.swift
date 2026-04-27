@preconcurrency import AVFoundation
@preconcurrency import Foundation
@preconcurrency import Speech

@main
struct MediakitApp {
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
        switch command {
        case .help:
            CLI.printUsage()
        case .transcribe(let inputPath, let outputPath, let language, let includeTimestamps, let overwrite):
            try await transcribe(
                inputPath: inputPath,
                outputPath: outputPath,
                language: language,
                includeTimestamps: includeTimestamps,
                overwrite: overwrite
            )
        }
    }

    private static func transcribe(
        inputPath: String,
        outputPath: String?,
        language: String,
        includeTimestamps: Bool,
        overwrite: Bool
    ) async throws {
        let inputURL = URL(fileURLWithPath: inputPath)
        guard FileManager.default.fileExists(atPath: inputURL.path) else {
            throw CLIError.inputMissing(inputPath)
        }

        try await requestSpeechAuthorization()

        let audioURL = try await exportAudioTrack(from: inputURL)
        defer { try? FileManager.default.removeItem(at: audioURL) }

        let transcription = try await transcribeAudio(at: audioURL, language: language)
        let destination = outputDestination(for: inputURL, outputPath: outputPath)

        if FileManager.default.fileExists(atPath: destination.path), !overwrite {
            throw CLIError.outputExists(destination.path)
        }

        let parentDirectory = destination.deletingLastPathComponent()
        if parentDirectory.path != "." && parentDirectory.path != "/" {
            try FileManager.default.createDirectory(
                at: parentDirectory,
                withIntermediateDirectories: true,
                attributes: nil
            )
        }

        let markdown = renderMarkdown(
            sourceURL: inputURL,
            transcription: transcription,
            language: language,
            includeTimestamps: includeTimestamps
        )
        try markdown.write(to: destination, atomically: true, encoding: .utf8)

        print("Wrote \(destination.path)")
    }

    private static func requestSpeechAuthorization() async throws {
        let status = SFSpeechRecognizer.authorizationStatus()
        switch status {
        case .authorized:
            return
        case .denied, .restricted:
            throw CLIError.speechAccessDenied
        case .notDetermined:
            let granted = try await withCheckedThrowingContinuation { continuation in
                SFSpeechRecognizer.requestAuthorization { status in
                    continuation.resume(returning: status == .authorized)
                }
            }

            guard granted else {
                throw CLIError.speechAccessDenied
            }
        @unknown default:
            throw CLIError.speechAccessDenied
        }
    }

    private static func exportAudioTrack(from inputURL: URL) async throws -> URL {
        let asset = AVURLAsset(url: inputURL)
        let audioTracks = try await asset.loadTracks(withMediaType: .audio)
        guard !audioTracks.isEmpty else {
            throw CLIError.noAudioTrack(inputURL.path)
        }

        guard let exportSession = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
            throw CLIError.audioExportFailed("Unable to create an audio export session.")
        }

        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("m4a")

        let duration = try await asset.load(.duration)
        exportSession.shouldOptimizeForNetworkUse = true
        exportSession.timeRange = CMTimeRange(start: .zero, duration: duration)

        try await exportSession.export(to: tempURL, as: .m4a)
        return tempURL
    }

    private static func transcribeAudio(at audioURL: URL, language: String) async throws -> SFTranscription {
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language)) else {
            throw CLIError.unsupportedLanguage(language)
        }

        let request = SFSpeechURLRecognitionRequest(url: audioURL)
        request.shouldReportPartialResults = false

        let taskBox = RecognitionTaskBox()

        return try await withCheckedThrowingContinuation { continuation in
            taskBox.task = recognizer.recognitionTask(with: request) { result, error in
                guard !taskBox.didResume else {
                    return
                }

                if let error {
                    taskBox.didResume = true
                    taskBox.task?.cancel()
                    taskBox.task = nil
                    continuation.resume(throwing: error)
                    return
                }

                guard let result else {
                    return
                }

                if result.isFinal {
                    taskBox.didResume = true
                    taskBox.task?.cancel()
                    taskBox.task = nil
                    continuation.resume(returning: result.bestTranscription)
                }
            }
        }
    }

    private static func outputDestination(for inputURL: URL, outputPath: String?) -> URL {
        if let outputPath, !outputPath.isEmpty {
            return URL(fileURLWithPath: outputPath)
        }

        return inputURL.deletingPathExtension().appendingPathExtension("md")
    }

    private static func renderMarkdown(
        sourceURL: URL,
        transcription: SFTranscription,
        language: String,
        includeTimestamps: Bool
    ) -> String {
        let title = sourceURL.deletingPathExtension().lastPathComponent
        let generatedAt = generatedDateFormatter.string(from: Date())
        let transcriptBody = includeTimestamps
            ? timestampedTranscript(from: transcription)
            : transcription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines)

        let body = transcriptBody.isEmpty ? "No speech was detected." : transcriptBody

        return """
        # \(title)

        - Source: `\(escapeBackticks(sourceURL.path))`
        - Language: `\(escapeBackticks(language))`
        - Generated: \(generatedAt)
        - Timestamps: \(includeTimestamps ? "enabled" : "disabled")

        ## Transcript

        \(body)
        """
    }

    private static func timestampedTranscript(from transcription: SFTranscription) -> String {
        let segments = transcription.segments
        guard !segments.isEmpty else {
            return ""
        }

        var paragraphs: [(timestamp: TimeInterval, text: String)] = []
        var words: [String] = []
        var paragraphStart = segments[0].timestamp
        var previousEnd = segments[0].timestamp + segments[0].duration

        for segment in segments {
            let gap = segment.timestamp - previousEnd
            if !words.isEmpty, (gap > 1.5 || words.count >= 16) {
                paragraphs.append((paragraphStart, normalizedWords(words)))
                words = []
                paragraphStart = segment.timestamp
            }

            if words.isEmpty {
                paragraphStart = segment.timestamp
            }

            words.append(segment.substring)
            previousEnd = segment.timestamp + segment.duration
        }

        if !words.isEmpty {
            paragraphs.append((paragraphStart, normalizedWords(words)))
        }

        return paragraphs
            .map { "[\(timecodeString(from: $0.timestamp))] \($0.text)" }
            .joined(separator: "\n\n")
    }

    private static func normalizedWords(_ words: [String]) -> String {
        var text = words.joined(separator: " ")
        let fixes = [
            " ,": ",",
            " .": ".",
            " !": "!",
            " ?": "?",
            " ;": ";",
            " :": ":",
            " )": ")",
            " ]": "]",
            " }": "}",
            "' ": "'",
            " \"": "\""
        ]

        for (needle, replacement) in fixes {
            text = text.replacingOccurrences(of: needle, with: replacement)
        }

        return text
    }

    private static func timecodeString(from timeInterval: TimeInterval) -> String {
        let totalMilliseconds = max(0, Int((timeInterval * 1000).rounded()))
        let hours = totalMilliseconds / 3_600_000
        let minutes = (totalMilliseconds % 3_600_000) / 60_000
        let seconds = (totalMilliseconds % 60_000) / 1_000
        let milliseconds = totalMilliseconds % 1_000

        if hours > 0 {
            return String(format: "%02d:%02d:%02d.%03d", hours, minutes, seconds, milliseconds)
        }

        return String(format: "%02d:%02d.%03d", minutes, seconds, milliseconds)
    }

    private static func escapeBackticks(_ value: String) -> String {
        value.replacingOccurrences(of: "`", with: "\\`")
    }

}

final class RecognitionTaskBox {
    var task: SFSpeechRecognitionTask?
    var didResume = false
}

enum CLICommand {
    case help
    case transcribe(inputPath: String, outputPath: String?, language: String, includeTimestamps: Bool, overwrite: Bool)
}

enum CLIError: Error, CustomStringConvertible {
    case unknownCommand(String)
    case unknownOption(String)
    case missingValue(String)
    case missingInput
    case inputMissing(String)
    case outputExists(String)
    case speechAccessDenied
    case unsupportedLanguage(String)
    case noAudioTrack(String)
    case audioExportFailed(String)

    var description: String {
        switch self {
        case .unknownCommand(let command):
            return "unknown command: \(command)"
        case .unknownOption(let option):
            return "unknown option: \(option)"
        case .missingValue(let option):
            return "missing value for \(option)"
        case .missingInput:
            return "missing input video path"
        case .inputMissing(let path):
            return "input file does not exist: \(path)"
        case .outputExists(let path):
            return "output file already exists: \(path) (use --overwrite to replace it)"
        case .speechAccessDenied:
            return "speech recognition access was denied"
        case .unsupportedLanguage(let language):
            return "unsupported speech language: \(language)"
        case .noAudioTrack(let path):
            return "no audio track found in input file: \(path)"
        case .audioExportFailed(let message):
            return message
        }
    }
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
        case "transcribe":
            self.command = try Self.parseTranscribe(Array(normalizedArguments.dropFirst()))
        default:
            throw CLIError.unknownCommand(first)
        }
    }

    private static func parseTranscribe(_ arguments: [String]) throws -> CLICommand {
        var inputPath: String?
        var outputPath: String?
        var language = "en-US"
        var includeTimestamps = true
        var overwrite = false
        var index = 0

        while index < arguments.count {
            let argument = arguments[index]
            switch argument {
            case "--help", "-h":
                return .help
            case "--output", "-o":
                index += 1
                guard index < arguments.count else {
                    throw CLIError.missingValue("--output")
                }
                outputPath = arguments[index]
            case "--language", "-l":
                index += 1
                guard index < arguments.count else {
                    throw CLIError.missingValue("--language")
                }
                language = arguments[index]
            case "--timestamps":
                includeTimestamps = true
            case "--no-timestamps":
                includeTimestamps = false
            case "--overwrite", "-f":
                overwrite = true
            case "--":
                index += 1
                while index < arguments.count {
                    guard inputPath == nil else {
                        throw CLIError.unknownOption(arguments[index])
                    }
                    inputPath = arguments[index]
                    index += 1
                }
                continue
            default:
                if argument.hasPrefix("-") {
                    throw CLIError.unknownOption(argument)
                }

                guard inputPath == nil else {
                    throw CLIError.missingInput
                }
                inputPath = argument
            }

            index += 1
        }

        guard let inputPath else {
            throw CLIError.missingInput
        }

        return .transcribe(
            inputPath: inputPath,
            outputPath: outputPath,
            language: language,
            includeTimestamps: includeTimestamps,
            overwrite: overwrite
        )
    }

    static func printUsage() {
        let usage = """
        usage:
            mediakit transcribe <input-video> [--output PATH] [--language LOCALE] [--timestamps|--no-timestamps] [--overwrite]

        examples:
            mediakit transcribe interview.mov
            mediakit transcribe clip.mp4 --output clip.md
            mediakit transcribe lecture.mov --language en-US --timestamps
            mediakit transcribe video.mov --no-timestamps --overwrite

        notes:
            - mediakit extracts audio from the input file, then uses Apple's Speech framework to transcribe it.
            - Speech recognition permission must be granted to the terminal or shell app.
            - The default output path is the same file name with a .md extension.

        """
        fputs(usage, stdout)
    }

    static func printUsageIfNeeded(for error: CLIError) {
        switch error {
        case .unknownCommand, .unknownOption, .missingValue, .missingInput, .unsupportedLanguage:
            print("\n")
            printUsage()
        case .inputMissing, .outputExists, .speechAccessDenied, .noAudioTrack, .audioExportFailed:
            break
        }
    }
}

private let generatedDateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = .autoupdatingCurrent
    formatter.dateStyle = .medium
    formatter.timeStyle = .medium
    return formatter
}()

import Contacts
import Foundation
import MapKit
import SwiftUI

struct ReviewCandidate: Identifiable, Codable, Hashable {
    let id: Int
    let placeId: Int
    let name: String
    let eventCount: Int
    let reviewReason: String
    let currentQuery: String?
    let suggestedQueries: String?
    let currentResultSummary: String?
    let expectedCountry: String?
    let formattedAddress: String?
    let city: String?
    let state: String?
    let country: String?
    let latitude: Double?
    let longitude: Double?
    let metadata: String?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case placeId = "place_id"
        case name
        case eventCount = "event_count"
        case reviewReason = "review_reason"
        case currentQuery = "current_query"
        case suggestedQueries = "suggested_queries"
        case currentResultSummary = "current_result_summary"
        case expectedCountry = "expected_country"
        case formattedAddress = "formatted_address"
        case city
        case state
        case country
        case latitude
        case longitude
        case metadata
        case createdAt = "created_at"
    }
}

struct ReviewAppConfig {
    let dbPath: String

    static func fromCommandLine() -> ReviewAppConfig {
        let arguments = Array(CommandLine.arguments.dropFirst())
        var dbPath = FileManager.default.currentDirectoryPath + "/db.sqlite"
        var index = 0

        while index < arguments.count {
            let argument = arguments[index]
            switch argument {
            case "--db", "-d":
                index += 1
                if index < arguments.count {
                    dbPath = NSString(string: arguments[index]).expandingTildeInPath
                }
            default:
                break
            }
            index += 1
        }

        return ReviewAppConfig(dbPath: dbPath)
    }
}

struct GeocodePreviewResponse: Hashable {
    let query: String
    let requestedLimit: Int
    let resultCount: Int
    let results: [GeocodePreviewResult]
}

struct GeocodePreviewResult: Identifiable, Hashable {
    let id = UUID()
    let name: String?
    let displayTitle: String
    let phoneNumber: String?
    let url: String?
    let pointOfInterestCategory: String?
    let locality: String?
    let administrativeArea: String?
    let country: String?
    let formattedAddress: String?
    let latitude: Double
    let longitude: Double
}

enum AppleMapsGeocoder {
    static func preview(query: String, limit: Int = 5) async throws -> GeocodePreviewResponse {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = trimmed
        request.resultTypes = [.address, .pointOfInterest]

        let response = try await MKLocalSearch(request: request).start()
        let results = Array(response.mapItems.prefix(limit)).map(mapItemToPreview)

        return GeocodePreviewResponse(
            query: trimmed,
            requestedLimit: limit,
            resultCount: results.count,
            results: results
        )
    }

    static func mapItemToPreview(_ item: MKMapItem) -> GeocodePreviewResult {
        let placemark = item.placemark
        let formattedAddress = placemark.postalAddress.map {
            CNPostalAddressFormatter.string(from: $0, style: .mailingAddress)
                .replacingOccurrences(of: "\n", with: ", ")
        }

        return GeocodePreviewResult(
            name: item.name,
            displayTitle: displayTitle(for: item),
            phoneNumber: item.phoneNumber,
            url: item.url?.absoluteString,
            pointOfInterestCategory: item.pointOfInterestCategory?.rawValue,
            locality: placemark.locality ?? placemark.subLocality,
            administrativeArea: placemark.administrativeArea,
            country: placemark.country,
            formattedAddress: formattedAddress,
            latitude: placemark.coordinate.latitude,
            longitude: placemark.coordinate.longitude
        )
    }

    static func displayTitle(for item: MKMapItem) -> String {
        let placemark = item.placemark

        let postalParts = [
            placemark.subThoroughfare,
            placemark.thoroughfare
        ]
        .compactMap { $0 }
        .joined(separator: " ")

        let localityParts = [
            placemark.locality,
            placemark.administrativeArea,
            placemark.postalCode,
            placemark.country
        ]
        .compactMap { $0 }

        let addressParts = [
            postalParts.isEmpty ? nil : postalParts,
            localityParts.isEmpty ? nil : localityParts.joined(separator: ", ")
        ]
        .compactMap { $0 }

        if let name = item.name, !name.isEmpty {
            if addressParts.isEmpty {
                return name
            }
            return ([name] + addressParts).joined(separator: ", ")
        }

        if let title = placemark.title, !title.isEmpty {
            return title
        }

        if !addressParts.isEmpty {
            return addressParts.joined(separator: ", ")
        }

        return "Unnamed location"
    }
}

enum SQLiteCLIError: Error, LocalizedError {
    case sqlite3NotFound
    case commandFailed(String)
    case invalidJSON(String)

    var errorDescription: String? {
        switch self {
        case .sqlite3NotFound:
            return "sqlite3 CLI not found at /usr/bin/sqlite3"
        case .commandFailed(let message):
            return message
        case .invalidJSON(let payload):
            return "failed to decode sqlite JSON output: \(payload.prefix(500))"
        }
    }
}

enum SQLiteCLI {
    static func fetchCandidates(dbPath: String) throws -> [ReviewCandidate] {
        let sql = """
        SELECT
          prd.id,
          prd.place_id,
          prd.name,
          COALESCE(pd.event_count, 0) AS event_count,
          prd.review_reason,
          prd.current_query,
          prd.suggested_queries,
          prd.current_result_summary,
          prd.expected_country,
          prd.formatted_address,
          prd.city,
          prd.state,
          prd.country,
          prd.latitude,
          prd.longitude,
          prd.metadata,
          prd.created_at
        FROM place_review_details prd
        LEFT JOIN place_details pd ON pd.id = prd.place_id
        ORDER BY COALESCE(pd.event_count, 0) DESC, prd.place_id ASC;
        """

        let data = try run(dbPath: dbPath, arguments: ["-json", dbPath, sql])
        guard !data.isEmpty else { return [] }

        do {
            return try JSONDecoder().decode([ReviewCandidate].self, from: data)
        } catch {
            let payload = String(data: data, encoding: .utf8) ?? "<non-utf8>"
            throw SQLiteCLIError.invalidJSON(payload)
        }
    }

    static func updateCurrentQuery(dbPath: String, candidateID: Int, currentQuery: String) throws {
        let escaped = currentQuery.replacingOccurrences(of: "'", with: "''")
        let sql = """
        UPDATE place_review_candidates
        SET current_query = '\(escaped)'
        WHERE id = \(candidateID);
        """
        _ = try run(dbPath: dbPath, arguments: [dbPath, sql])
    }

    private static func run(dbPath _: String, arguments: [String]) throws -> Data {
        let sqlite3Path = "/usr/bin/sqlite3"
        guard FileManager.default.fileExists(atPath: sqlite3Path) else {
            throw SQLiteCLIError.sqlite3NotFound
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: sqlite3Path)
        process.arguments = arguments

        let stdout = Pipe()
        let stderr = Pipe()
        process.standardOutput = stdout
        process.standardError = stderr

        try process.run()
        process.waitUntilExit()

        let output = stdout.fileHandleForReading.readDataToEndOfFile()
        let errorOutput = stderr.fileHandleForReading.readDataToEndOfFile()

        guard process.terminationStatus == 0 else {
            let message = String(data: errorOutput, encoding: .utf8) ?? "sqlite3 exited with status \(process.terminationStatus)"
            throw SQLiteCLIError.commandFailed(message)
        }

        return output
    }
}

@MainActor
final class ReviewStore: ObservableObject {
    @Published var dbPath: String
    @Published var candidates: [ReviewCandidate] = []
    @Published var selectedCandidateID: ReviewCandidate.ID?
    @Published var searchText = ""
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var saveMessage: String?

    init(dbPath: String) {
        self.dbPath = dbPath
    }

    var filteredCandidates: [ReviewCandidate] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return candidates }

        return candidates.filter { candidate in
            [
                candidate.name,
                candidate.currentQuery ?? "",
                candidate.reviewReason,
                candidate.expectedCountry ?? "",
                candidate.formattedAddress ?? "",
                candidate.city ?? "",
                candidate.state ?? "",
                candidate.country ?? ""
            ]
            .joined(separator: "\n")
            .localizedCaseInsensitiveContains(query)
        }
    }

    var selectedCandidate: ReviewCandidate? {
        guard let selectedCandidateID else { return filteredCandidates.first ?? candidates.first }
        return candidates.first { $0.id == selectedCandidateID }
    }

    func loadCandidates() {
        isLoading = true
        errorMessage = nil
        saveMessage = nil

        let dbPath = self.dbPath
        Task {
            do {
                let rows = try SQLiteCLI.fetchCandidates(dbPath: dbPath)
                await MainActor.run {
                    self.candidates = rows
                    if self.selectedCandidateID == nil {
                        self.selectedCandidateID = rows.first?.id
                    } else if !rows.contains(where: { $0.id == self.selectedCandidateID }) {
                        self.selectedCandidateID = rows.first?.id
                    }
                    self.isLoading = false
                }
            } catch {
                await MainActor.run {
                    self.errorMessage = error.localizedDescription
                    self.isLoading = false
                }
            }
        }
    }

    func saveCurrentQuery(candidateID: Int, newQuery: String) {
        saveMessage = nil
        errorMessage = nil

        let trimmed = newQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            errorMessage = "current_query cannot be blank"
            return
        }

        let dbPath = self.dbPath
        Task {
            do {
                try SQLiteCLI.updateCurrentQuery(dbPath: dbPath, candidateID: candidateID, currentQuery: trimmed)
                let rows = try SQLiteCLI.fetchCandidates(dbPath: dbPath)
                await MainActor.run {
                    self.candidates = rows
                    self.selectedCandidateID = candidateID
                    self.saveMessage = "Saved current_query for candidate #\(candidateID)"
                }
            } catch {
                await MainActor.run {
                    self.errorMessage = error.localizedDescription
                }
            }
        }
    }
}

struct CandidateListRow: View {
    let candidate: ReviewCandidate
    let isSelected: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                Text(candidate.name)
                    .font(.headline)
                    .lineLimit(2)
                Spacer()
                Text("\(candidate.eventCount)")
                    .font(.caption.monospacedDigit())
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.secondary.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            }

            Text(candidate.currentQuery ?? "")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(2)

            Text(candidate.reviewReason)
                .font(.caption)
                .foregroundStyle(isSelected ? .primary : .secondary)
        }
        .padding(.vertical, 4)
    }
}

struct CandidateDetailView: View {
    @EnvironmentObject private var store: ReviewStore
    let candidate: ReviewCandidate

    @State private var editedQuery = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(candidate.name)
                            .font(.title2)
                            .fontWeight(.semibold)
                        Text("place_id: \(candidate.placeId) • candidate_id: \(candidate.id)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(candidate.reviewReason)
                        .font(.caption)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.orange.opacity(0.18))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }

                LabeledContent("Event count", value: String(candidate.eventCount))
                if let expectedCountry = candidate.expectedCountry, !expectedCountry.isEmpty {
                    LabeledContent("Expected country", value: expectedCountry)
                }
                if let formattedAddress = candidate.formattedAddress, !formattedAddress.isEmpty {
                    LabeledContent("Formatted address", value: formattedAddress)
                }
                if let city = candidate.city, !city.isEmpty || (candidate.state?.isEmpty == false) || (candidate.country?.isEmpty == false) {
                    LabeledContent("Location", value: [city, candidate.state, candidate.country].compactMap { value in
                        guard let value, !value.isEmpty else { return nil }
                        return value
                    }.joined(separator: ", "))
                }
                if let latitude = candidate.latitude, let longitude = candidate.longitude {
                    LabeledContent("Coordinates", value: "\(latitude), \(longitude)")
                }

                Divider()

                VStack(alignment: .leading, spacing: 8) {
                    Text("current_query")
                        .font(.headline)
                    TextEditor(text: $editedQuery)
                        .font(.body.monospaced())
                        .frame(minHeight: 90)
                        .padding(6)
                        .background(Color.secondary.opacity(0.06))
                        .clipShape(RoundedRectangle(cornerRadius: 8))

                    HStack {
                        Button("Reset") {
                            editedQuery = candidate.currentQuery ?? ""
                        }
                        Button("Save Query") {
                            store.saveCurrentQuery(candidateID: candidate.id, newQuery: editedQuery)
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }

                if let suggested = candidate.suggestedQueries, !suggested.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("suggested_queries")
                            .font(.headline)
                        CodeBlock(text: suggested)
                    }
                }

                if let resultSummary = candidate.currentResultSummary, !resultSummary.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("current_result_summary")
                            .font(.headline)
                        CodeBlock(text: resultSummary)
                    }
                }

                if let metadata = candidate.metadata, !metadata.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("metadata")
                            .font(.headline)
                        CodeBlock(text: metadata)
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Review Candidate")
        .onAppear {
            editedQuery = candidate.currentQuery ?? ""
        }
        .onChange(of: candidate.id) { _ in
            editedQuery = candidate.currentQuery ?? ""
        }
    }
}

struct CodeBlock: View {
    let text: String

    var body: some View {
        ScrollView(.horizontal) {
            Text(text)
                .font(.system(.body, design: .monospaced))
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(10)
        }
        .background(Color.secondary.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

struct ContentView: View {
    @EnvironmentObject private var store: ReviewStore

    var body: some View {
        NavigationSplitView {
            VStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("DB")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Button("Refresh") {
                            store.loadCandidates()
                        }
                        .disabled(store.isLoading)
                    }
                    Text(store.dbPath)
                        .font(.caption.monospaced())
                        .textSelection(.enabled)
                        .lineLimit(2)
                }
                .padding(.horizontal)
                .padding(.top, 10)

                TextField("Filter review candidates", text: $store.searchText)
                    .textFieldStyle(.roundedBorder)
                    .padding(.horizontal)

                HStack {
                    Text("\(store.filteredCandidates.count) candidates")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if store.isLoading {
                        ProgressView()
                            .controlSize(.small)
                    }
                    Spacer()
                }
                .padding(.horizontal)

                List(selection: $store.selectedCandidateID) {
                    ForEach(store.filteredCandidates) { candidate in
                        CandidateListRow(candidate: candidate, isSelected: store.selectedCandidateID == candidate.id)
                            .tag(candidate.id)
                    }
                }
                .listStyle(.sidebar)
            }
            .frame(minWidth: 360)
        } detail: {
            VStack(alignment: .leading, spacing: 12) {
                if let errorMessage = store.errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .padding(.horizontal)
                        .padding(.top)
                }
                if let saveMessage = store.saveMessage {
                    Text(saveMessage)
                        .foregroundStyle(.green)
                        .padding(.horizontal)
                        .padding(.top, store.errorMessage == nil ? 0 : -4)
                }
                if let candidate = store.selectedCandidate {
                    CandidateDetailView(candidate: candidate)
                } else if store.isLoading {
                    VStack(spacing: 12) {
                        ProgressView()
                        Text("Loading review candidates…")
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    VStack(spacing: 12) {
                        Image(systemName: "checkmark.circle")
                            .font(.system(size: 32))
                            .foregroundStyle(.secondary)
                        Text("No review candidates")
                            .font(.headline)
                        Text("Try refreshing or point the app at a different db.sqlite file.")
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
        }
        .task {
            if store.candidates.isEmpty && !store.isLoading {
                store.loadCandidates()
            }
        }
    }
}

@main
struct GeoReviewApp: App {
    @StateObject private var store = ReviewStore(dbPath: ReviewAppConfig.fromCommandLine().dbPath)

    var body: some Scene {
        WindowGroup("Geo Review") {
            ContentView()
                .environmentObject(store)
                .frame(minWidth: 1100, minHeight: 700)
        }
        .defaultSize(width: 1280, height: 820)
    }
}

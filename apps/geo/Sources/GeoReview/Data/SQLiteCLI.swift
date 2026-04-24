import Foundation

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
    static func fetchPlaces(dbPath: String) throws -> [PlaceRecord] {
        guard try tableExists(dbPath: dbPath, name: "places") else {
            GeoReviewLogger.log("places table not found; returning empty list")
            return []
        }

        GeoReviewLogger.log("Loading places from SQLite")
        let sql = """
        SELECT
          p.id,
          p.name,
          p.place_type,
          p.url,
          p.latitude,
          p.longitude,
          p.formatted_address,
          p.city,
          p.state,
          p.postal_code,
          p.country,
          p.country_code,
          p.geocoded_at,
          NULL AS metadata,
          p.created_at,
          p.updated_at,
          p.review_status,
          p.review_reason,
          p.review_query,
          p.review_updated_at,
          p.review_decision_at,
          p.review_decision_source,
          p.last_geocode_status,
          p.last_geocode_query,
          NULL AS last_geocode_result_summary,
          (
            SELECT COUNT(*)
            FROM calendar_events ce
            WHERE ce.place_id = p.id
          ) AS event_count
        FROM places p
        ORDER BY
          CASE p.review_status
            WHEN 'needs_review' THEN 0
            WHEN 'no_match' THEN 1
            WHEN 'not_a_place' THEN 2
            WHEN NULL THEN 3
            ELSE 4
          END,
          event_count DESC,
          p.id ASC;
        """

        let data = try run(arguments: ["-json", dbPath, sql])
        guard !data.isEmpty else { return [] }

        do {
            let decoded = try JSONDecoder().decode([PlaceRecord].self, from: data)
            GeoReviewLogger.log("Loaded \(decoded.count) place summaries")
            return decoded
        } catch {
            let payload = String(data: data, encoding: .utf8) ?? "<non-utf8>"
            throw SQLiteCLIError.invalidJSON(payload)
        }
    }

    static func fetchPlaceDetail(dbPath: String, placeID: Int) throws -> PlaceRecord? {
        let sql = """
        SELECT
          p.id,
          p.name,
          p.place_type,
          p.url,
          p.latitude,
          p.longitude,
          p.formatted_address,
          p.city,
          p.state,
          p.postal_code,
          p.country,
          p.country_code,
          p.geocoded_at,
          p.metadata,
          p.created_at,
          p.updated_at,
          p.review_status,
          p.review_reason,
          p.review_query,
          p.review_updated_at,
          p.review_decision_at,
          p.review_decision_source,
          p.last_geocode_status,
          p.last_geocode_query,
          p.last_geocode_result_summary,
          (
            SELECT COUNT(*)
            FROM calendar_events ce
            WHERE ce.place_id = p.id
          ) AS event_count
        FROM places p
        WHERE p.id = \(placeID)
        LIMIT 1;
        """

        let data = try run(arguments: ["-json", dbPath, sql])
        guard !data.isEmpty else { return nil }

        do {
            return try JSONDecoder().decode([PlaceRecord].self, from: data).first
        } catch {
            let payload = String(data: data, encoding: .utf8) ?? "<non-utf8>"
            throw SQLiteCLIError.invalidJSON(payload)
        }
    }

    static func fetchAttempts(dbPath: String, placeID: Int) throws -> [PlaceGeocodeAttemptRecord] {
        guard try tableExists(dbPath: dbPath, name: "place_geocode_attempts") else {
            return []
        }

        let sql = """
        SELECT id, place_id, query, provider, status, result_summary, response_json, created_at
        FROM place_geocode_attempts
        WHERE place_id = \(placeID)
        ORDER BY datetime(created_at) DESC, id DESC;
        """

        let data = try run(arguments: ["-json", dbPath, sql])
        guard !data.isEmpty else { return [] }

        do {
            return try JSONDecoder().decode([PlaceGeocodeAttemptRecord].self, from: data)
        } catch {
            let payload = String(data: data, encoding: .utf8) ?? "<non-utf8>"
            throw SQLiteCLIError.invalidJSON(payload)
        }
    }

    static func updateReviewQuery(dbPath: String, placeID: Int, reviewQuery: String) throws {
        let escaped = sqlLiteral(reviewQuery)
        let sql = """
        UPDATE places
        SET review_query = '\(escaped)',
            review_updated_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = \(placeID);
        """
        _ = try run(arguments: [dbPath, sql])
    }

    static func acceptResult(dbPath: String, placeID: Int, query: String, result: GeocodePreviewResult) throws {
        let queryLiteral = sqlLiteral(query)
        let payloadJSON = try encodeJSONString(result.payload)
        let payloadLiteral = sqlLiteral(payloadJSON)
        let displayTitleLiteral = sqlLiteral(result.displayTitle)
        let nameLiteral = sqlLiteral((result.name?.isEmpty == false ? result.name! : result.displayTitle))
        let formattedAddressLiteral = sqlLiteral(result.formattedAddress ?? result.displayTitle)
        let cityLiteral = sqlLiteral(result.locality ?? "")
        let stateLiteral = sqlLiteral(result.administrativeArea ?? "")
        let postalCodeLiteral = sqlLiteral(result.postalCode ?? "")
        let countryLiteral = sqlLiteral(result.country ?? "")
        let countryCodeLiteral = sqlLiteral((result.countryCode ?? "").lowercased())

        let sql = """
        BEGIN;
        INSERT INTO place_geocode_attempts (
          place_id,
          query,
          provider,
          status,
          result_summary,
          response_json
        ) VALUES (
          \(placeID),
          '\(queryLiteral)',
          'apple_maps',
          'ok',
          '\(displayTitleLiteral)',
          '\(payloadLiteral)'
        );

        UPDATE places
        SET
          name = '\(nameLiteral)',
          latitude = \(result.latitude),
          longitude = \(result.longitude),
          formatted_address = '\(formattedAddressLiteral)',
          city = CASE WHEN '\(cityLiteral)' = '' THEN NULL ELSE '\(cityLiteral)' END,
          state = CASE WHEN '\(stateLiteral)' = '' THEN NULL ELSE '\(stateLiteral)' END,
          postal_code = CASE WHEN '\(postalCodeLiteral)' = '' THEN NULL ELSE '\(postalCodeLiteral)' END,
          country = CASE WHEN '\(countryLiteral)' = '' THEN NULL ELSE '\(countryLiteral)' END,
          country_code = CASE WHEN '\(countryCodeLiteral)' = '' THEN NULL ELSE '\(countryCodeLiteral)' END,
          geocoded_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP,
          review_status = 'ok',
          review_reason = NULL,
          review_query = '\(queryLiteral)',
          review_updated_at = CURRENT_TIMESTAMP,
          review_decision_at = CURRENT_TIMESTAMP,
          review_decision_source = 'manual_ui',
          last_geocode_status = 'ok',
          last_geocode_query = '\(queryLiteral)',
          last_geocode_result_summary = '\(displayTitleLiteral)',
          metadata = json_set(
            CASE
              WHEN metadata IS NOT NULL AND json_valid(metadata) THEN metadata
              ELSE '{}'
            END,
            '$.geocoding.status', 'ok',
            '$.geocoding.provider', 'apple_maps',
            '$.geocoding.search_query', '\(queryLiteral)',
            '$.geocoding.apple_maps.selected_query', '\(queryLiteral)',
            '$.geocoding.apple_maps.selected_at', CURRENT_TIMESTAMP,
            '$.geocoding.apple_maps.selected_result', json('\(payloadLiteral)'),
            '$.review.last_decision', 'accepted',
            '$.review.last_decision_at', CURRENT_TIMESTAMP,
            '$.review.last_decision_source', 'manual_ui'
          )
        WHERE id = \(placeID);
        COMMIT;
        """

        _ = try run(arguments: [dbPath, sql])
    }

    static func markNotAPlace(dbPath: String, placeID: Int, query: String) throws {
        let queryLiteral = sqlLiteral(query)
        let summaryLiteral = sqlLiteral("Marked not a place in manual review UI")
        let sql = """
        BEGIN;
        INSERT INTO place_geocode_attempts (
          place_id,
          query,
          provider,
          status,
          result_summary,
          response_json
        ) VALUES (
          \(placeID),
          '\(queryLiteral)',
          'apple_maps',
          'not_a_place',
          '\(summaryLiteral)',
          NULL
        );

        UPDATE places
        SET
          updated_at = CURRENT_TIMESTAMP,
          review_status = 'not_a_place',
          review_reason = 'manual_not_a_place',
          review_query = '\(queryLiteral)',
          review_updated_at = CURRENT_TIMESTAMP,
          review_decision_at = CURRENT_TIMESTAMP,
          review_decision_source = 'manual_ui',
          last_geocode_status = 'not_a_place',
          last_geocode_query = '\(queryLiteral)',
          last_geocode_result_summary = '\(summaryLiteral)',
          metadata = json_set(
            CASE
              WHEN metadata IS NOT NULL AND json_valid(metadata) THEN metadata
              ELSE '{}'
            END,
            '$.review.last_decision', 'not_a_place',
            '$.review.last_decision_at', CURRENT_TIMESTAMP,
            '$.review.last_decision_source', 'manual_ui'
          )
        WHERE id = \(placeID);
        COMMIT;
        """

        _ = try run(arguments: [dbPath, sql])
    }

    static func tableExists(dbPath: String, name: String) throws -> Bool {
        let escaped = sqlLiteral(name)
        let sql = "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '\(escaped)' LIMIT 1;"
        let data = try run(arguments: [dbPath, sql])
        let output = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return output == "1"
    }

    private static func run(arguments: [String]) throws -> Data {
        let sqlite3Path = "/usr/bin/sqlite3"
        guard FileManager.default.fileExists(atPath: sqlite3Path) else {
            throw SQLiteCLIError.sqlite3NotFound
        }

        let fileManager = FileManager.default
        let tempDirectory = fileManager.temporaryDirectory
        let stdoutURL = tempDirectory.appendingPathComponent("geo-review-sqlite-stdout-\(UUID().uuidString).tmp")
        let stderrURL = tempDirectory.appendingPathComponent("geo-review-sqlite-stderr-\(UUID().uuidString).tmp")
        fileManager.createFile(atPath: stdoutURL.path, contents: nil)
        fileManager.createFile(atPath: stderrURL.path, contents: nil)

        let stdoutHandle = try FileHandle(forWritingTo: stdoutURL)
        let stderrHandle = try FileHandle(forWritingTo: stderrURL)
        defer {
            try? stdoutHandle.close()
            try? stderrHandle.close()
            try? fileManager.removeItem(at: stdoutURL)
            try? fileManager.removeItem(at: stderrURL)
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: sqlite3Path)
        process.arguments = arguments
        process.standardOutput = stdoutHandle
        process.standardError = stderrHandle

        try process.run()
        process.waitUntilExit()

        let output = (try? Data(contentsOf: stdoutURL)) ?? Data()
        let errorOutput = (try? Data(contentsOf: stderrURL)) ?? Data()

        guard process.terminationStatus == 0 else {
            let message = String(data: errorOutput, encoding: .utf8) ?? "sqlite3 exited with status \(process.terminationStatus)"
            throw SQLiteCLIError.commandFailed(message)
        }

        return output
    }

    private static func sqlLiteral(_ value: String) -> String {
        value.replacingOccurrences(of: "'", with: "''")
    }

    private static func encodeJSONString<T: Encodable>(_ value: T) throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let data = try encoder.encode(value)
        guard let json = String(data: data, encoding: .utf8) else {
            throw SQLiteCLIError.commandFailed("failed to encode JSON payload")
        }
        return json
    }
}

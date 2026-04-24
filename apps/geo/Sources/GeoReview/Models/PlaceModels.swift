import Contacts
import CoreLocation
import Foundation

enum ReviewFilter: String, CaseIterable, Identifiable {
    case needsReview = "needs_review"
    case all = "all"
    case ok = "ok"
    case noMatch = "no_match"
    case notAPlace = "not_a_place"
    case unknown = "unknown"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .needsReview: return "Needs Review"
        case .all: return "All"
        case .ok: return "Resolved"
        case .noMatch: return "No Match"
        case .notAPlace: return "Not a Place"
        case .unknown: return "Unknown"
        }
    }
}

struct PlaceRecord: Identifiable, Codable, Hashable {
    let id: Int
    let name: String
    let placeType: String?
    let url: String?
    let latitude: Double?
    let longitude: Double?
    let formattedAddress: String?
    let city: String?
    let state: String?
    let postalCode: String?
    let country: String?
    let countryCode: String?
    let geocodedAt: String?
    let eventCount: Int
    let metadata: String?
    let createdAt: String?
    let updatedAt: String?
    let reviewStatus: String?
    let reviewReason: String?
    let reviewQuery: String?
    let reviewUpdatedAt: String?
    let reviewDecisionAt: String?
    let reviewDecisionSource: String?
    let lastGeocodeStatus: String?
    let lastGeocodeQuery: String?
    let lastGeocodeResultSummary: String?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case placeType = "place_type"
        case url
        case latitude
        case longitude
        case formattedAddress = "formatted_address"
        case city
        case state
        case postalCode = "postal_code"
        case country
        case countryCode = "country_code"
        case geocodedAt = "geocoded_at"
        case eventCount = "event_count"
        case metadata
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case reviewStatus = "review_status"
        case reviewReason = "review_reason"
        case reviewQuery = "review_query"
        case reviewUpdatedAt = "review_updated_at"
        case reviewDecisionAt = "review_decision_at"
        case reviewDecisionSource = "review_decision_source"
        case lastGeocodeStatus = "last_geocode_status"
        case lastGeocodeQuery = "last_geocode_query"
        case lastGeocodeResultSummary = "last_geocode_result_summary"
    }

    var coordinate: CLLocationCoordinate2D? {
        guard let latitude, let longitude else { return nil }
        return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    var locationLine: String {
        [city, state, country]
            .compactMap { value in
                guard let value, !value.isEmpty else { return nil }
                return value
            }
            .joined(separator: ", ")
    }

    var effectiveReviewQuery: String {
        let trimmed = reviewQuery?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? name : trimmed
    }

    var statusDisplay: String {
        switch reviewStatus {
        case "needs_review": return "Needs review"
        case "ok": return "Resolved"
        case "no_match": return "No match"
        case "not_a_place": return "Not a place"
        case nil, "": return "Unknown"
        default: return reviewStatus!.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }
}

struct PlaceGeocodeAttempt: Identifiable, Codable, Hashable {
    let id: Int
    let placeId: Int
    let query: String
    let provider: String
    let status: String
    let resultSummary: String?
    let responseJSON: String?
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case placeId = "place_id"
        case query
        case provider
        case status
        case resultSummary = "result_summary"
        case responseJSON = "response_json"
        case createdAt = "created_at"
    }
}

struct CoordinatePayload: Codable, Hashable {
    let latitude: Double
    let longitude: Double

    init(_ coordinate: CLLocationCoordinate2D) {
        self.latitude = coordinate.latitude
        self.longitude = coordinate.longitude
    }
}

struct PostalAddressPayload: Codable, Hashable {
    let street: String
    let subLocality: String
    let city: String
    let subAdministrativeArea: String
    let state: String
    let postalCode: String
    let country: String
    let isoCountryCode: String

    init(_ address: CNPostalAddress) {
        self.street = address.street
        self.subLocality = address.subLocality
        self.city = address.city
        self.subAdministrativeArea = address.subAdministrativeArea
        self.state = address.state
        self.postalCode = address.postalCode
        self.country = address.country
        self.isoCountryCode = address.isoCountryCode
    }
}

struct PlacemarkPayload: Codable, Hashable {
    let title: String?
    let subtitle: String?
    let coordinate: CoordinatePayload
    let name: String?
    let country: String?
    let isoCountryCode: String?
    let administrativeArea: String?
    let subAdministrativeArea: String?
    let locality: String?
    let subLocality: String?
    let thoroughfare: String?
    let subThoroughfare: String?
    let postalCode: String?
    let formattedAddressLines: [String]?
    let postalAddress: PostalAddressPayload?
}

struct MapItemPayload: Codable, Hashable {
    let name: String?
    let displayTitle: String
    let isCurrentLocation: Bool
    let phoneNumber: String?
    let url: String?
    let pointOfInterestCategory: String?
    let placemark: PlacemarkPayload
}

struct GeocodePreviewResponse: Hashable {
    let query: String
    let requestedLimit: Int
    let resultCount: Int
    let results: [GeocodePreviewResult]
}

struct GeocodePreviewResult: Identifiable, Hashable {
    let id = UUID()
    let payload: MapItemPayload

    var name: String? { payload.name }
    var displayTitle: String { payload.displayTitle }
    var phoneNumber: String? { payload.phoneNumber }
    var url: String? { payload.url }
    var pointOfInterestCategory: String? { payload.pointOfInterestCategory }
    var locality: String? { payload.placemark.locality ?? payload.placemark.subLocality }
    var administrativeArea: String? { payload.placemark.administrativeArea }
    var country: String? { payload.placemark.country }
    var formattedAddress: String? { payload.placemark.formattedAddressLines?.joined(separator: ", ") }
    var latitude: Double { payload.placemark.coordinate.latitude }
    var longitude: Double { payload.placemark.coordinate.longitude }
    var postalCode: String? { payload.placemark.postalCode ?? payload.placemark.postalAddress?.postalCode }
    var countryCode: String? { payload.placemark.isoCountryCode ?? payload.placemark.postalAddress?.isoCountryCode }
    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: latitude, longitude: longitude) }
}

struct MapMarkerItem: Identifiable {
    let id: Int
    let name: String
    let reviewStatus: String?
    let coordinate: CLLocationCoordinate2D
}

enum SelectionSource {
    case map
    case sidebar
}

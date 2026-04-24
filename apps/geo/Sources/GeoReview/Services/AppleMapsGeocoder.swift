import Contacts
import MapKit

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
        GeocodePreviewResult(payload: mapItemPayload(from: item))
    }

    static func mapItemPayload(from item: MKMapItem) -> MapItemPayload {
        MapItemPayload(
            name: item.name,
            displayTitle: displayTitle(for: item),
            isCurrentLocation: item.isCurrentLocation,
            phoneNumber: item.phoneNumber,
            url: item.url?.absoluteString,
            pointOfInterestCategory: item.pointOfInterestCategory?.rawValue,
            placemark: placemarkPayload(from: item.placemark)
        )
    }

    static func placemarkPayload(from placemark: MKPlacemark) -> PlacemarkPayload {
        let formattedAddressLines = placemark.postalAddress.map {
            CNPostalAddressFormatter.string(from: $0, style: .mailingAddress)
                .split(whereSeparator: \.isNewline)
                .map(String.init)
        }

        return PlacemarkPayload(
            title: placemark.title,
            subtitle: placemark.subtitle,
            coordinate: CoordinatePayload(placemark.coordinate),
            name: placemark.name,
            country: placemark.country,
            isoCountryCode: placemark.isoCountryCode,
            administrativeArea: placemark.administrativeArea,
            subAdministrativeArea: placemark.subAdministrativeArea,
            locality: placemark.locality,
            subLocality: placemark.subLocality,
            thoroughfare: placemark.thoroughfare,
            subThoroughfare: placemark.subThoroughfare,
            postalCode: placemark.postalCode,
            formattedAddressLines: formattedAddressLines,
            postalAddress: placemark.postalAddress.map(PostalAddressPayload.init)
        )
    }

    static func displayTitle(for item: MKMapItem) -> String {
        let placemark = item.placemark

        let postalParts = [placemark.subThoroughfare, placemark.thoroughfare]
            .compactMap { $0 }
            .joined(separator: " ")

        let localityParts = [placemark.locality, placemark.administrativeArea, placemark.postalCode, placemark.country]
            .compactMap { $0 }

        let addressParts = [
            postalParts.isEmpty ? nil : postalParts,
            localityParts.isEmpty ? nil : localityParts.joined(separator: ", ")
        ]
        .compactMap { $0 }

        if let name = item.name, !name.isEmpty {
            return ([name] + addressParts).joined(separator: ", ")
        }

        if let title = placemark.title, !title.isEmpty {
            return title
        }

        return addressParts.joined(separator: ", ")
    }
}

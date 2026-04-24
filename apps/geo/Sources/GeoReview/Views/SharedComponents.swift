import SwiftUI

struct GeocodeResultCard: View {
    let result: GeocodePreviewResult
    let isSaving: Bool
    let onUse: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [Color(red: 0.94, green: 0.93, blue: 0.90), Color(red: 0.87, green: 0.90, blue: 0.95)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(height: 128)
                .overlay(alignment: .topLeading) {
                    VStack(alignment: .leading, spacing: 8) {
                        if let category = result.pointOfInterestCategory, !category.isEmpty {
                            StatusChip(title: category.replacingOccurrences(of: ".", with: " "), color: .blue)
                        }
                        Spacer()
                        Text(result.name ?? result.displayTitle)
                            .font(.system(size: 26, weight: .semibold, design: .serif))
                            .foregroundStyle(.primary)
                            .lineLimit(2)
                    }
                    .padding(18)
                }

            VStack(alignment: .leading, spacing: 10) {
                if let formattedAddress = result.formattedAddress, !formattedAddress.isEmpty {
                    Text(formattedAddress)
                        .font(.body)
                }

                let localityLine = [result.locality, result.administrativeArea, result.country]
                    .compactMap { value in
                        guard let value, !value.isEmpty else { return nil }
                        return value
                    }
                    .joined(separator: ", ")
                if !localityLine.isEmpty {
                    Text(localityLine)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Text("\(result.latitude), \(result.longitude)")
                    .font(.system(size: 12, weight: .regular, design: .monospaced))
                    .foregroundStyle(.secondary)

                if let phoneNumber = result.phoneNumber, !phoneNumber.isEmpty {
                    Text(phoneNumber)
                        .font(.caption)
                }
            }

            HStack {
                if let url = result.url, let destination = URL(string: url) {
                    Link("Open Website", destination: destination)
                        .font(.caption)
                }
                Spacer()
                Button("Use This Place", action: onUse)
                    .buttonStyle(.borderedProminent)
                    .disabled(isSaving)
            }
        }
        .padding(20)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .shadow(color: .black.opacity(0.05), radius: 16, x: 0, y: 6)
    }
}

struct AttemptRowView: View {
    let attempt: PlaceGeocodeAttempt
    @State private var showResponse = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(attempt.query)
                        .font(.body)
                        .lineLimit(2)
                    Text(attempt.createdAt)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                StatusChip(title: attempt.status.replacingOccurrences(of: "_", with: " "), color: attemptColor(attempt.status))
            }

            if let summary = attempt.resultSummary, !summary.isEmpty {
                Text(summary)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if let responseJSON = attempt.responseJSON, !responseJSON.isEmpty {
                DisclosureGroup(isExpanded: $showResponse) {
                    CodeBlock(text: responseJSON)
                        .padding(.top, 8)
                } label: {
                    Text("Response JSON")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

struct EmptyResultsView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("No Apple Maps match")
                .font(.system(size: 22, weight: .semibold, design: .serif))
            Text("Try a simpler query, add a city or country, or mark the record as not a place if it represents a call, note, or URL.")
                .foregroundStyle(.secondary)
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

struct FactBlock: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold, design: .rounded))
                .kerning(0.9)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.body)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
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
                .padding(12)
        }
        .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

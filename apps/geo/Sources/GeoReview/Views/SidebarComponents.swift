import SwiftUI

struct SidebarRowView: View {
    let place: PlaceRecord
    let isSelected: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .top) {
                Text(place.name)
                    .font(.system(size: 15, weight: .semibold, design: .serif))
                    .lineLimit(2)
                Spacer(minLength: 12)
                Text("\(place.eventCount)")
                    .font(.caption.monospacedDigit())
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(Color.primary.opacity(0.06))
                    .clipShape(Capsule())
            }

            Text(place.effectiveReviewQuery)
                .font(.system(size: 12, weight: .regular, design: .monospaced))
                .foregroundStyle(.secondary)
                .lineLimit(2)

            HStack(spacing: 8) {
                StatusChip(title: place.statusDisplay, color: statusColor(place.reviewStatus))
                if let reason = place.reviewReason, !reason.isEmpty {
                    Text(reason.replacingOccurrences(of: "_", with: " "))
                        .font(.caption)
                        .foregroundStyle(isSelected ? .primary : .secondary)
                        .lineLimit(1)
                }
            }
        }
        .padding(.vertical, 6)
    }
}

struct StatusChip: View {
    let title: String
    let color: Color

    var body: some View {
        Text(title.uppercased())
            .font(.system(size: 10, weight: .semibold, design: .rounded))
            .kerning(0.8)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.12))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}

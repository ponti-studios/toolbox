// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "calendar-helper",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "calendar-helper", targets: ["CalendarHelper"])
    ],
    targets: [
        .executableTarget(
            name: "CalendarHelper",
            path: "Sources/CalendarHelper"
        )
    ]
)

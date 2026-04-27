// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "timekit",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "timekit", targets: ["Timekit"])
    ],
    targets: [
        .executableTarget(
            name: "Timekit",
            path: "Sources/Timekit"
        )
    ]
)

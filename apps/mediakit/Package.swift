// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "mediakit",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "mediakit", targets: ["Mediakit"])
    ],
    targets: [
        .executableTarget(
            name: "Mediakit",
            path: "Sources/Mediakit"
        )
    ]
)

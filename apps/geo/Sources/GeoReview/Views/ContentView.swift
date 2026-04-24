import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var store: ReviewStore
    @State private var columnVisibility: NavigationSplitViewVisibility = .doubleColumn

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            sidebarPanel
        } content: {
            PlaceMapView()
                .environmentObject(store)
                .navigationTitle("Atlas")
        } detail: {
            detailPanel
        }
        .navigationSplitViewStyle(.balanced)
        .task {
            if store.places.isEmpty && !store.isLoading {
                store.loadPlaces()
            }
        }
        .onChange(of: store.reviewFilter) { _ in
            store.filterDidChange()
        }
        .onChange(of: store.searchText) { _ in
            store.scheduleSearchUpdate()
        }
        .onChange(of: store.selectedPlaceID) { newValue in
            columnVisibility = newValue == nil ? .doubleColumn : .all
        }
    }

    private var sidebarPanel: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Places")
                    .font(.system(size: 28, weight: .semibold, design: .serif))
                Text(store.visibleStatsLine)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal)
            .padding(.top, 12)

            TextField("Search places, queries, addresses", text: $store.searchText)
                .textFieldStyle(.roundedBorder)
                .padding(.horizontal)

            Picker("Filter", selection: $store.reviewFilter) {
                ForEach(ReviewFilter.allCases) { filter in
                    Text(filter.title).tag(filter)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)

            HStack {
                Button("Refresh") { store.loadPlaces() }
                    .buttonStyle(.bordered)
                    .disabled(store.isLoading || store.isSaving)
                if store.isLoading {
                    ProgressView()
                        .controlSize(.small)
                }
                Spacer()
            }
            .padding(.horizontal)

            List(selection: Binding(get: { store.selectedPlaceID }, set: { newValue in
                if let newValue {
                    store.selectPlace(newValue, source: .sidebar)
                }
            })) {
                ForEach(store.visiblePlaces) { place in
                    SidebarRowView(place: place, isSelected: store.selectedPlaceID == place.id)
                        .tag(place.id)
                }
            }
            .listStyle(.sidebar)
        }
        .navigationTitle("Places")
    }

    private var detailPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let errorMessage = store.errorMessage {
                Text(errorMessage)
                    .foregroundStyle(.red)
                    .padding(.horizontal, 8)
                    .padding(.top, 8)
            }
            if let successMessage = store.successMessage {
                Text(successMessage)
                    .foregroundStyle(.green)
                    .padding(.horizontal, 8)
                    .padding(.top, store.errorMessage == nil ? 8 : 0)
            }

            if let place = store.selectedPlace {
                PlaceDetailView(place: place)
                    .environmentObject(store)
                    .padding(12)
            } else if store.isLoading {
                VStack(spacing: 12) {
                    ProgressView()
                    Text("Loading places…")
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "mappin.and.ellipse")
                        .font(.system(size: 32))
                        .foregroundStyle(.secondary)
                    Text("No places available")
                        .font(.headline)
                    Text("The app reads directly from ~/.hominem/db.sqlite.")
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle(store.selectedPlace?.name ?? "Place")
    }
}

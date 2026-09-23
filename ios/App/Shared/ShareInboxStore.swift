import Foundation

struct SharedLink: Codable {
    let id: String
    let url: String
    let originalText: String?
    let title: String?
    let savedAt: Date
}

enum ShareInboxStore {
    static let groupID = "group.kr.io.breeze.app"
    private static let folderName = "ShareInbox"

    static func directory() throws -> URL {
        guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupID) else {
            throw NSError(domain: "BreezeShareInbox", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "Breeze App Group is unavailable"])
        }
        let folder = container.appendingPathComponent(folderName, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }

    static func pending() throws -> [SharedLink] {
        let folder = try directory()
        let files = try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" }
        return files.compactMap { file in
            guard let data = try? Data(contentsOf: file) else { return nil }
            return try? JSONDecoder().decode(SharedLink.self, from: data)
        }.sorted { $0.savedAt < $1.savedAt }
    }

    @discardableResult
    static func save(url: URL, originalText: String?, title: String?) throws -> SharedLink {
        guard let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme),
              url.host != nil else {
            throw NSError(domain: "BreezeShareInbox", code: 2,
                          userInfo: [NSLocalizedDescriptionKey: "Only web links can be saved"])
        }
        let now = Date()
        let canonical = url.absoluteString
        if let recent = try pending().last(where: { $0.url == canonical && now.timeIntervalSince($0.savedAt) < 60 }) {
            return recent
        }
        let item = SharedLink(id: UUID().uuidString, url: canonical,
                              originalText: originalText, title: title, savedAt: now)
        let destination = try directory().appendingPathComponent(item.id).appendingPathExtension("json")
        let data = try JSONEncoder().encode(item)
        try data.write(to: destination, options: .atomic)
        return item
    }

    static func acknowledge(ids: [String]) throws {
        let folder = try directory()
        for id in ids where UUID(uuidString: id) != nil {
            let file = folder.appendingPathComponent(id).appendingPathExtension("json")
            if FileManager.default.fileExists(atPath: file.path) {
                try FileManager.default.removeItem(at: file)
            }
        }
    }
}

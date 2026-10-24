import Foundation

struct SharedLink: Codable {
    let id: String
    let url: String
    let originalText: String?
    let title: String?
    let savedAt: Date
    let openedAt: Date?
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
        if let recent = try pending().last(where: {
            $0.url == canonical && $0.openedAt == nil && now.timeIntervalSince($0.savedAt) < 60
        }) {
            return recent
        }
        let item = SharedLink(id: UUID().uuidString, url: canonical,
                              originalText: originalText, title: title, savedAt: now, openedAt: nil)
        let destination = try directory().appendingPathComponent(item.id).appendingPathExtension("json")
        let data = try JSONEncoder().encode(item)
        try data.write(to: destination, options: .atomic)
        return item
    }

    static func markOpened(id: String) throws {
        guard UUID(uuidString: id) != nil else { return }
        let file = try directory().appendingPathComponent(id).appendingPathExtension("json")
        let item = try JSONDecoder().decode(SharedLink.self, from: Data(contentsOf: file))
        guard item.openedAt == nil else { return }
        let opened = SharedLink(id: item.id, url: item.url, originalText: item.originalText,
                                title: item.title, savedAt: item.savedAt, openedAt: Date())
        try JSONEncoder().encode(opened).write(to: file, options: .atomic)
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

// Files have a separate inbox: legacy web links remain dormant and untouched.
struct SharedFile: Codable {
    let id: String
    let name: String
    let size: Int
    let savedAt: Date
}

extension ShareInboxStore {
    static let maximumFileSize = 100 * 1024 * 1024
    static let fileChunkSize = 256 * 1024

    private static func fileError(_ message: String) -> NSError {
        NSError(domain: "BreezeShareInbox", code: 3,
                userInfo: [NSLocalizedDescriptionKey: message])
    }

    private static func filesDirectory() throws -> URL {
        let folder = try directory().appendingPathComponent("Files", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }

    private static func fileDirectory(id: String) throws -> URL {
        guard UUID(uuidString: id) != nil else { throw fileError("파일을 찾을 수 없어요.") }
        return try filesDirectory().appendingPathComponent(id, isDirectory: true)
    }

    static func validateFile(at url: URL, name: String) throws -> Int {
        guard url.isFileURL, ["pdf", "epub"].contains((name as NSString).pathExtension.lowercased()) else {
            throw fileError("PDF 또는 EPUB 파일 하나를 공유해 주세요.")
        }
        let values = try url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey, .isSymbolicLinkKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true,
              let size = values.fileSize, size > 0 else { throw fileError("비어 있거나 읽을 수 없는 파일이에요.") }
        guard size <= maximumFileSize else { throw fileError("100MB 이하의 파일을 공유해 주세요.") }
        return size
    }

    @discardableResult
    static func saveFile(at source: URL, name: String) throws -> SharedFile {
        let safeName = (name as NSString).lastPathComponent
        let size = try validateFile(at: source, name: safeName)
        let item = SharedFile(id: UUID().uuidString, name: safeName, size: size, savedAt: Date())
        let folder = try filesDirectory()
        let staging = folder.appendingPathComponent(".staging-" + item.id, isDirectory: true)
        try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: staging) }
        let payload = staging.appendingPathComponent("payload")
        try FileManager.default.copyItem(at: source, to: payload)
        guard try validateFile(at: payload, name: safeName) == size else { throw fileError("파일 복사가 끝나지 않았어요. 다시 공유해 주세요.") }
        try JSONEncoder().encode(item).write(to: staging.appendingPathComponent("record.json"), options: .atomic)
        // Only complete directories become visible to the main app.
        try FileManager.default.moveItem(at: staging, to: fileDirectory(id: item.id))
        return item
    }

    static func pendingFiles() throws -> [SharedFile] {
        let folder = try filesDirectory()
        return try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)
            .filter { UUID(uuidString: $0.lastPathComponent) != nil }
            .compactMap { directory -> SharedFile? in
                guard let data = try? Data(contentsOf: directory.appendingPathComponent("record.json")),
                      let item = try? JSONDecoder().decode(SharedFile.self, from: data),
                      item.id == directory.lastPathComponent else { return nil }
                return item
            }.sorted { $0.savedAt < $1.savedAt }
    }

    static func readFileChunk(id: String, offset: Int) throws -> String {
        let folder = try fileDirectory(id: id)
        let item = try JSONDecoder().decode(SharedFile.self, from: Data(contentsOf: folder.appendingPathComponent("record.json")))
        guard item.id == id, offset >= 0, offset < item.size else { throw fileError("파일 읽기 위치가 올바르지 않아요.") }
        let payload = folder.appendingPathComponent("payload")
        guard try validateFile(at: payload, name: item.name) == item.size else { throw fileError("보관한 파일을 읽을 수 없어요. 다시 공유해 주세요.") }
        let handle = try FileHandle(forReadingFrom: payload)
        defer { try? handle.close() }
        try handle.seek(toOffset: UInt64(offset))
        let count = min(fileChunkSize, item.size - offset)
        guard let data = try handle.read(upToCount: count), data.count == count else { throw fileError("파일을 끝까지 읽지 못했어요.") }
        return data.base64EncodedString()
    }

    static func acknowledgeFile(id: String) throws {
        let folder = try fileDirectory(id: id)
        // Rename first: interruption during removal cannot leave a visible partial record.
        guard FileManager.default.fileExists(atPath: folder.path) else { return }
        let trash = folder.deletingLastPathComponent().appendingPathComponent(".done-" + id)
        try FileManager.default.moveItem(at: folder, to: trash)
        try? FileManager.default.removeItem(at: trash)
    }
}

// One AO3 work URL. Kept out of the dormant general link inbox.
struct SharedAo3: Codable {
    let id: String
    let url: String
    let savedAt: Date
}

enum Ao3Link {
    static let userAgent = "Breeze (https://breeze.io.kr; personal reading; one work per explicit request)"
    private static let workID = try! NSRegularExpression(pattern: "^[1-9]\\d{0,11}$")

    static func canonical(_ raw: URL) -> URL? {
        guard var parts = URLComponents(url: raw, resolvingAgainstBaseURL: false),
              let scheme = parts.scheme?.lowercased(), scheme == "http" || scheme == "https",
              parts.user == nil, parts.password == nil else { return nil }
        let host = parts.host?.lowercased()
        let download = host == "download.archiveofourown.org"
        guard host == "archiveofourown.org" || host == "www.archiveofourown.org" || download else { return nil }
        parts.scheme = "https"
        parts.host = download ? "download.archiveofourown.org" : "archiveofourown.org"
        parts.port = nil
        parts.fragment = nil
        let path = parts.percentEncodedPath.removingPercentEncoding ?? parts.path
        guard pathAllowed(path) else { return nil }
        if download {
            guard path.split(separator: "/").map(String.init).last?.lowercased() == "work.epub" else { return nil }
            parts.queryItems = nil
            return parts.url
        }
        let query = (parts.queryItems ?? []).filter { item in
            (item.name == "view_adult" || item.name == "view_full_work") && (item.value == "true" || item.value == "false")
        }
        parts.queryItems = query.isEmpty ? nil : query
        return parts.url
    }

    private static func isID(_ value: String) -> Bool {
        workID.firstMatch(in: value, range: NSRange(value.startIndex..., in: value)) != nil
    }

    private static func pathAllowed(_ path: String) -> Bool {
        let parts = path.split(separator: "/").map(String.init)
        if parts.count == 2 && parts[0] == "works" && isID(parts[1]) { return true }
        if parts.count == 4 && parts[0] == "works" && isID(parts[1]) && parts[2] == "chapters" && isID(parts[3]) { return true }
        if parts.count == 2 && parts[0] == "chapters" && isID(parts[1]) { return true }
        if parts.count == 3 && parts[0] == "downloads" && isID(parts[1]) && parts[2].lowercased().hasSuffix(".epub") { return true }
        return false
    }
}

extension ShareInboxStore {
    private static func ao3Directory() throws -> URL {
        let folder = try directory().appendingPathComponent("Ao3", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }

    @discardableResult
    static func saveAo3(url: URL) throws -> SharedAo3 {
        guard let canonical = Ao3Link.canonical(url) else {
            throw fileError("AO3 작품 링크만 가져올 수 있어요.")
        }
        let now = Date()
        let href = canonical.absoluteString
        if let recent = try pendingAo3().last(where: {
            $0.url == href && now.timeIntervalSince($0.savedAt) < 60
        }) {
            return recent
        }
        let item = SharedAo3(id: UUID().uuidString, url: href, savedAt: now)
        let data = try JSONEncoder().encode(item)
        try data.write(to: try ao3Directory().appendingPathComponent(item.id).appendingPathExtension("json"), options: .atomic)
        return item
    }

    static func pendingAo3() throws -> [SharedAo3] {
        let folder = try ao3Directory()
        return try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" }
            .compactMap { file -> SharedAo3? in
                guard let data = try? Data(contentsOf: file),
                      let item = try? JSONDecoder().decode(SharedAo3.self, from: data),
                      UUID(uuidString: item.id) != nil,
                      Ao3Link.canonical(URL(string: item.url) ?? URL(fileURLWithPath: "/")) != nil else { return nil }
                return item
            }
            .sorted { $0.savedAt < $1.savedAt }
    }

    static func acknowledgeAo3(id: String) throws {
        guard UUID(uuidString: id) != nil else { return }
        let file = try ao3Directory().appendingPathComponent(id).appendingPathExtension("json")
        if FileManager.default.fileExists(atPath: file.path) {
            try FileManager.default.removeItem(at: file)
        }
    }
}

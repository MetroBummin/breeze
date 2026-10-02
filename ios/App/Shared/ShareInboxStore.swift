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

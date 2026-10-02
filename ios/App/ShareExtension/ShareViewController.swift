import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private let titleLabel = UILabel()
    private let detailLabel = UILabel()
    private let saveButton = UIButton(type: .system)
    private var sharedFile: URL?
    private var sharedName: String?
    private var temporaryFolder: URL?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        preferredContentSize = CGSize(width: 360, height: 200)

        let icon = UIImageView(image: UIImage(named: "BreezeMark"))
        icon.contentMode = .scaleAspectFit
        icon.translatesAutoresizingMaskIntoConstraints = false
        icon.widthAnchor.constraint(equalToConstant: 36).isActive = true
        icon.heightAnchor.constraint(equalToConstant: 36).isActive = true
        titleLabel.text = "Breeze"
        titleLabel.font = .preferredFont(forTextStyle: .headline)
        let heading = UIStackView(arrangedSubviews: [icon, titleLabel])
        heading.axis = .horizontal
        heading.alignment = .center
        heading.spacing = 10

        detailLabel.text = "파일을 준비하고 있어요…"
        detailLabel.font = .preferredFont(forTextStyle: .subheadline)
        detailLabel.textColor = .secondaryLabel
        detailLabel.numberOfLines = 2

        saveButton.configuration = .filled()
        saveButton.configuration?.title = "Breeze에 저장"
        saveButton.isEnabled = false
        saveButton.addTarget(self, action: #selector(save), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [heading, detailLabel, saveButton])
        stack.axis = .vertical
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
        loadShare()
    }

    deinit {
        if let temporaryFolder { try? FileManager.default.removeItem(at: temporaryFolder) }
    }

    private func loadShare() {
        let items = extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem } ?? []
        let providers = items.flatMap { $0.attachments ?? [] }
        let supported = providers.filter { provider in
            provider.hasItemConformingToTypeIdentifier(UTType.pdf.identifier)
                || provider.hasItemConformingToTypeIdentifier("org.idpf.epub-container")
                || provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier)
        }
        guard supported.count == 1, let provider = supported.first else {
            detailLabel.text = "PDF 또는 EPUB 파일 하나를 공유해 주세요."
            return
        }
        let type = [UTType.pdf.identifier, "org.idpf.epub-container"].first {
            provider.hasItemConformingToTypeIdentifier($0)
        }
        if let type {
            provider.loadFileRepresentation(forTypeIdentifier: type) { [weak self] url, error in
                self?.receiveFile(url, suggestedName: provider.suggestedName, type: type, error: error)
            }
        } else {
            provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { [weak self] item, error in
                let url = (item as? URL) ?? (item as? Data).flatMap { URL(dataRepresentation: $0, relativeTo: nil) }
                self?.receiveFile(url, suggestedName: nil, type: nil, error: error)
            }
        }
    }

    // Provider URLs can disappear when the completion returns. Copy synchronously
    // inside that completion; only our owned temporary file waits for the Save tap.
    private func receiveFile(_ url: URL?, suggestedName: String?, type: String?, error: Error?) {
        do {
            if let error { throw error }
            guard let url else { throw NSError(domain: "BreezeShare", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "파일을 읽지 못했어요. 다시 공유해 주세요."]) }
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            var name = ((suggestedName?.isEmpty == false ? suggestedName! : url.lastPathComponent) as NSString).lastPathComponent
            if !["pdf", "epub"].contains((name as NSString).pathExtension.lowercased()), let type {
                name += type == UTType.pdf.identifier ? ".pdf" : ".epub"
            }
            _ = try ShareInboxStore.validateFile(at: url, name: name)
            let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let owned = folder.appendingPathComponent("payload")
            do { try FileManager.default.copyItem(at: url, to: owned) }
            catch { try? FileManager.default.removeItem(at: folder); throw error }
            DispatchQueue.main.async { [weak self] in
                guard let self else { try? FileManager.default.removeItem(at: folder); return }
                self.temporaryFolder = folder
                self.sharedFile = owned
                self.sharedName = name
                self.detailLabel.text = name
                self.saveButton.isEnabled = true
            }
        } catch {
            DispatchQueue.main.async { [weak self] in self?.detailLabel.text = error.localizedDescription }
        }
    }

    @objc private func save() {
        guard let sharedFile, let sharedName else { return }
        saveButton.isEnabled = false
        saveButton.configuration?.title = "저장 중…"
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            do {
                try ShareInboxStore.saveFile(at: sharedFile, name: sharedName)
                DispatchQueue.main.async {
                    self?.saveButton.configuration?.title = "저장했어요"
                    self?.detailLabel.text = "Breeze를 열면 책을 가져와요."
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                        self?.extensionContext?.completeRequest(returningItems: nil)
                    }
                }
            } catch {
                DispatchQueue.main.async {
                    self?.detailLabel.text = error.localizedDescription
                    self?.saveButton.configuration?.title = "다시 저장"
                    self?.saveButton.isEnabled = true
                }
            }
        }
    }
}

import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private let titleLabel = UILabel()
    private let detailLabel = UILabel()
    private let saveButton = UIButton(type: .system)
    private var sharedURL: URL?
    private var originalText: String?
    private var pageTitle: String?

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

        detailLabel.text = "Loading link…"
        detailLabel.font = .preferredFont(forTextStyle: .subheadline)
        detailLabel.textColor = .secondaryLabel
        detailLabel.numberOfLines = 2

        saveButton.configuration = .filled()
        saveButton.configuration?.title = "Save to Breeze"
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

    private func loadShare() {
        let items = extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem } ?? []
        pageTitle = items.first?.attributedTitle?.string
        originalText = items.first?.attributedContentText?.string
        let providers = items.flatMap { $0.attachments ?? [] }
        guard let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.url.identifier) })
                ?? providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) }) else {
            detailLabel.text = "No web link found"
            return
        }
        if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { [weak self] item, _ in
                let url = (item as? URL) ?? (item as? String).flatMap(URL.init(string:))
                DispatchQueue.main.async { self?.setLink(url, text: nil) }
            }
        } else {
            provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { [weak self] item, _ in
                let text = (item as? String) ?? (item as? NSAttributedString)?.string
                    ?? (item as? Data).flatMap { String(data: $0, encoding: .utf8) }
                let url = text.flatMap { string -> URL? in
                    let range = NSRange(string.startIndex..<string.endIndex, in: string)
                    return (try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue))?
                        .firstMatch(in: string, range: range)?.url
                }
                DispatchQueue.main.async { self?.setLink(url, text: text) }
            }
        }
    }

    private func setLink(_ url: URL?, text: String?) {
        guard let url, let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme),
              url.host != nil else {
            detailLabel.text = "No web link found"
            return
        }
        sharedURL = url
        originalText = text ?? originalText
        if pageTitle == nil, let text = originalText, text != url.absoluteString {
            pageTitle = text.components(separatedBy: .newlines).first?.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        detailLabel.text = pageTitle?.isEmpty == false ? pageTitle : url.absoluteString
        saveButton.isEnabled = true
    }

    @objc private func save() {
        guard let sharedURL else { return }
        saveButton.isEnabled = false
        do {
            try ShareInboxStore.save(url: sharedURL, originalText: originalText, title: pageTitle)
            saveButton.configuration?.title = "Saved to Breeze"
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
                self?.extensionContext?.completeRequest(returningItems: nil)
            }
        } catch {
            detailLabel.text = error.localizedDescription
            saveButton.isEnabled = true
        }
    }
}

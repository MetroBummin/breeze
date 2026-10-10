import Foundation
import Capacitor
import Vision
import ImageIO

/// Accepts one bounded page raster, never a PDF, URL or remote service request.
@objc(BreezePdfOcrPlugin)
public final class BreezePdfOcrPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BreezePdfOcrPlugin"
    public let jsName = "BreezePdfOcr"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "recognize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise)
    ]
    private let queue = DispatchQueue(label: "kr.io.breeze.pdf-ocr", qos: .utility)
    private let lock = NSLock()
    private var busy = false
    private var completedRequestId: String?

    @objc func getStatus(_ call: CAPPluginCall) {
        let requestId = call.getString("requestId")
        lock.lock()
        let finished = requestId != nil && !busy && completedRequestId == requestId
        lock.unlock()
        call.resolve(["finished": finished])
    }

    @objc func recognize(_ call: CAPPluginCall) {
        guard let encoded = call.getString("image"), encoded.utf8.count <= 24_000_000 else {
            call.reject("Invalid page image", "INVALID_IMAGE"); return
        }
        lock.lock()
        if busy { lock.unlock(); call.reject("OCR is busy", "BUSY"); return }
        busy = true
        lock.unlock()
        let requestId = call.getString("requestId")
        queue.async { [self] in
            var failure = "OCR_FAILED"
            let result: [String: Any]? = autoreleasepool {
                guard let data = Data(base64Encoded: encoded),
                      let source = CGImageSourceCreateWithData(data as CFData, nil),
                      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
                      let width = properties[kCGImagePropertyPixelWidth] as? Int,
                      let height = properties[kCGImagePropertyPixelHeight] as? Int,
                      width > 0, height > 0, width <= 2048, height <= 2048,
                      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
                    failure = "INVALID_IMAGE"; return nil
                }
                do {
                    let request = VNRecognizeTextRequest()
                    request.recognitionLevel = .accurate
                    request.recognitionLanguages = ["en-US"]
                    request.usesLanguageCorrection = false
                    // PDF.js has already applied intrinsic rotation. Image is upright.
                    try VNImageRequestHandler(cgImage: image, orientation: .up).perform([request])
                    let pattern = try NSRegularExpression(pattern: "[A-Za-z](?:[A-Za-z'’\\-]*[A-Za-z])?")
                    var words: [[String: Any]] = []
                    for (line, observation) in (request.results ?? []).enumerated() {
                        guard let candidate = observation.topCandidates(1).first,
                              candidate.confidence >= 0.3 else { continue }
                        let text = candidate.string
                        for match in pattern.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
                            guard words.count < 3000 else { break }
                            guard let range = Range(match.range, in: text),
                                  let observation = try candidate.boundingBox(for: range) else { continue }
                            let rect = observation.boundingBox
                            words.append(["word": String(text[range]), "line": line,
                                          "confidence": candidate.confidence,
                                          "x": rect.minX, "y": 1 - rect.maxY,
                                          "w": rect.width, "h": rect.height])
                        }
                    }
                    return ["words": words]
                } catch {
                    // Do not log source text or image data.
                    return nil
                }
            }
            // A status receipt proves this request left Vision and released its
            // image/request scope. It does not force-cancel an active SDK call.
            lock.lock(); completedRequestId = requestId; busy = false; lock.unlock()
            if let result { call.resolve(result) }
            else { call.reject("Page text recognition failed", failure) }
        }
    }
}

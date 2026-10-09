// Test-only bridge transport. The production Swift plugin and real Apple Vision
// compile unchanged; this replaces Capacitor delivery, never OCR or its bounds.
import Foundation
public protocol CAPBridgedPlugin {}
public struct CAPPluginMethod {
    public init(name: String, returnType: String) {}
}
public let CAPPluginReturnPromise = "promise"
@objc open class CAPPlugin: NSObject {}
@objc public final class CAPPluginCall: NSObject {
    public let completed = DispatchSemaphore(value: 0)
    public var result: [String: Any]?
    public var failure: String?
    private let options: [String: String]
    public init(image: String) { options = ["image": image]; super.init() }
    public func getString(_ key: String) -> String? { options[key] }
    public func resolve(_ value: [String: Any]) { result = value; completed.signal() }
    public func reject(_ message: String, _ code: String) { failure = code; completed.signal() }
}

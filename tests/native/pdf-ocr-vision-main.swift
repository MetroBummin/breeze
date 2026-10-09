import Foundation
import Darwin
import Vision
import Capacitor

@main struct VisionStress {
    static func memory() -> UInt64 {
        var info = mach_task_basic_info()
        var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size / MemoryLayout<integer_t>.size)
        let code = withUnsafeMutablePointer(to: &info) { pointer in
            pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
            }
        }
        return code == KERN_SUCCESS ? info.resident_size : 0
    }
    static func main() throws {
        let root = URL(fileURLWithPath: CommandLine.arguments[1])
        let output = URL(fileURLWithPath: CommandLine.arguments[2])
        let manifest = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("manifest.json"))) as! [String: Any]
        let corpus = manifest["cases"] as! [[String: Any]]
        let plugin = BreezePdfOcrPlugin()
        let repeatCount = min(128, max(1, Int(ProcessInfo.processInfo.environment["BREEZE_OCR_REPEAT_COUNT"] ?? "24") ?? 24))
        var cases: [[String: Any]] = [], repetitions: [[String: Any]] = []
        func write() throws {
            let report: [String: Any] = ["engine": "Apple Vision", "environment": "macOS CI; not iOS hardware",
                "os": ProcessInfo.processInfo.operatingSystemVersionString,
                "revision": VNRecognizeTextRequest().revision, "native": true,
                "bridge": "test transport around unchanged production plugin", "network": "sandbox denies network",
                "cases": cases, "repetitions": repetitions,
                "memoryMetric": "process resident bytes 50ms after completion and the input autorelease pool; includes model/harness; not a leak proof"]
            try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]).write(to: output, options: .atomic)
        }
        for i in 0..<(corpus.count + repeatCount) {
            let id = i < corpus.count ? corpus[i]["id"] as! String : "print-48"
            var row: [String: Any] = try autoreleasepool {
                let data = try Data(contentsOf: root.appendingPathComponent(id + ".png"))
                let call = CAPPluginCall(image: data.base64EncodedString())
                let start = ProcessInfo.processInfo.systemUptime
                plugin.recognize(call)
                guard call.completed.wait(timeout: .now() + 45) == .success else {
                    throw NSError(domain: "OCR timeout", code: 1)
                }
                return ["id": id, "iteration": i, "words": call.result?["words"] ?? [],
                    "error": (call.failure as Any?) ?? NSNull(), "milliseconds": (ProcessInfo.processInfo.systemUptime-start)*1000]
            }
            // Do not confuse live input/autorelease buffers with retained memory.
            Thread.sleep(forTimeInterval: 0.05)
            row["residentBytes"] = memory()
            if i < corpus.count { cases.append(row) }
            else { repetitions.append(row.filter { $0.key != "words" }) }
            try autoreleasepool { try write() }
            if let failure = row["error"] as? String { throw NSError(domain: failure, code: 2) }
        }
        let invalid = CAPPluginCall(image: "not-valid-base64")
        plugin.recognize(invalid)
        guard invalid.completed.wait(timeout: .now() + 5) == .success, invalid.failure != nil else {
            throw NSError(domain: "Invalid image was not rejected", code: 3)
        }
        print("Actual Apple Vision completed \(corpus.count) cases and \(repeatCount) repeat calls; see JSON for measurements.")
    }
}

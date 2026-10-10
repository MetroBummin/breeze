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
    static func snapshot(_ phase: String) -> [String: Any] {
        var heap = malloc_statistics_t()
        malloc_zone_statistics(nil, &heap)
        return ["phase": phase, "residentBytes": memory(), "mallocBytesInUse": heap.size_in_use,
                "mallocBytesAllocated": heap.size_allocated, "mallocBlocksInUse": heap.blocks_in_use]
    }
    static func main() throws {
        let root = URL(fileURLWithPath: CommandLine.arguments[1])
        let output = URL(fileURLWithPath: CommandLine.arguments[2])
        let manifest = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("manifest.json"))) as! [String: Any]
        let corpus = manifest["cases"] as! [[String: Any]]
        let control = ProcessInfo.processInfo.environment["BREEZE_OCR_MEMORY_CONTROL"] == "1"
        var plugin: BreezePdfOcrPlugin? = BreezePdfOcrPlugin()
        let repeatCount = min(512, max(1, Int(ProcessInfo.processInfo.environment["BREEZE_OCR_REPEAT_COUNT"] ?? "24") ?? 24))
        var cases: [[String: Any]] = [], repetitions: [[String: Any]] = []
        var snapshots = [snapshot("before-input")], completed = false, pluginReleased = false
        func write() throws {
            let report: [String: Any] = ["engine": "Apple Vision", "environment": "macOS CI; not iOS hardware",
                "os": ProcessInfo.processInfo.operatingSystemVersionString,
                "revision": VNRecognizeTextRequest().revision, "native": !control,
                "control": control ? "same input/base64/report lifetime without recognition" : "none",
                "bridge": "test transport around unchanged production plugin", "network": "sandbox denies network",
                "cases": cases, "repetitions": repetitions,
                "memorySnapshots": snapshots, "completed": completed, "pluginReleased": pluginReleased,
                "memoryMetric": "process resident bytes 50ms after completion and the input autorelease pool; includes model/harness; not a leak proof"]
            try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]).write(to: output, options: .atomic)
        }
        for i in 0..<(corpus.count + repeatCount) {
            let id = i < corpus.count ? corpus[i]["id"] as! String : "print-48"
            var row: [String: Any] = try autoreleasepool {
                let data = try Data(contentsOf: root.appendingPathComponent(id + ".png"))
                let call = CAPPluginCall(image: data.base64EncodedString(), requestId: "stress-\(i)")
                let start = ProcessInfo.processInfo.systemUptime
                if !control {
                    plugin!.recognize(call)
                    guard call.completed.wait(timeout: .now() + 45) == .success else {
                        throw NSError(domain: "OCR timeout", code: 1)
                    }
                    let receipt = CAPPluginCall(image: "", requestId: "stress-\(i)")
                    plugin!.getStatus(receipt)
                    guard receipt.result?["finished"] as? Bool == true else {
                        throw NSError(domain: "Native completion receipt missing", code: 4)
                    }
                    let wrongReceipt = CAPPluginCall(image: "", requestId: "unrelated")
                    plugin!.getStatus(wrongReceipt)
                    guard wrongReceipt.result?["finished"] as? Bool == false else {
                        throw NSError(domain: "Wrong request completion accepted", code: 5)
                    }
                }
                return ["id": id, "iteration": i, "words": call.result?["words"] ?? [],
                    "error": (call.failure as Any?) ?? NSNull(), "milliseconds": (ProcessInfo.processInfo.systemUptime-start)*1000]
            }
            // Do not confuse live input/autorelease buffers with retained memory.
            Thread.sleep(forTimeInterval: 0.05)
            row["residentBytes"] = memory()
            if i < corpus.count { cases.append(row) }
            else { repetitions.append(row.filter { $0.key != "words" }) }
            if i == corpus.count - 1 { snapshots.append(snapshot("after-corpus")) }
            if i >= corpus.count && (i - corpus.count + 1) % 96 == 0 {
                snapshots.append(snapshot("repeat-\(i - corpus.count + 1)"))
            }
            try autoreleasepool { try write() }
            if let failure = row["error"] as? String { throw NSError(domain: failure, code: 2) }
        }
        if !control {
            let invalid = CAPPluginCall(image: "not-valid-base64", requestId: "invalid")
            plugin!.recognize(invalid)
            guard invalid.completed.wait(timeout: .now() + 5) == .success, invalid.failure != nil else {
                throw NSError(domain: "Invalid image was not rejected", code: 3)
            }
        }
        Thread.sleep(forTimeInterval: 1)
        snapshots.append(snapshot("idle-1s"))
        weak var releasedPlugin = plugin
        plugin = nil
        Thread.sleep(forTimeInterval: 5)
        pluginReleased = releasedPlugin == nil
        snapshots.append(snapshot("plugin-released-idle-5s"))
        completed = true
        try write()
        if !pluginReleased { throw NSError(domain: "Plugin unexpectedly retained after completion", code: 6) }
        print("\(control ? "Input-only control" : "Actual Apple Vision") completed \(corpus.count) cases and \(repeatCount) repeat calls; see JSON for measurements.")
    }
}

// Encode actual app screenshots at their captured wall-clock timestamps.
import Foundation
import AVFoundation
import AppKit
struct Frame: Decodable { let file:String; let ms:Int }
struct Capture: Decodable { let width:Int; let height:Int; let durationMs:Int; let frames:[Frame] }
let directory=URL(fileURLWithPath:CommandLine.arguments[1])
let capture=try JSONDecoder().decode(Capture.self,from:Data(contentsOf:directory.appendingPathComponent("frames.json")))
let output=directory.appendingPathComponent("breeze-welcome-light-dark.mp4")
if FileManager.default.fileExists(atPath:output.path){try FileManager.default.removeItem(at:output)}
let writer=try AVAssetWriter(outputURL:output,fileType:.mp4)
let input=AVAssetWriterInput(mediaType:.video,outputSettings:[AVVideoCodecKey:AVVideoCodecType.h264,AVVideoWidthKey:capture.width,AVVideoHeightKey:capture.height,AVVideoCompressionPropertiesKey:[AVVideoAverageBitRateKey:1_600_000,AVVideoProfileLevelKey:AVVideoProfileLevelH264BaselineAutoLevel]])
let adapter=AVAssetWriterInputPixelBufferAdaptor(assetWriterInput:input,sourcePixelBufferAttributes:[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32ARGB,kCVPixelBufferWidthKey as String:capture.width,kCVPixelBufferHeightKey as String:capture.height,kCVPixelBufferCGBitmapContextCompatibilityKey as String:true,kCVPixelBufferCGImageCompatibilityKey as String:true])
writer.add(input);guard writer.startWriting() else {throw writer.error!};writer.startSession(atSourceTime:.zero)
var index=0
for tick in 0..<Int(Double(capture.durationMs)*24/1000){
 let ms=tick*1000/24
 while index+1<capture.frames.count && capture.frames[index+1].ms<=ms {index+=1}
 let image=NSImage(contentsOf:directory.appendingPathComponent("frames/"+capture.frames[index].file))!
 var rect=CGRect(x:0,y:0,width:capture.width,height:capture.height)
 let cg=image.cgImage(forProposedRect:&rect,context:nil,hints:nil)!
 var buffer:CVPixelBuffer?;CVPixelBufferPoolCreatePixelBuffer(nil,adapter.pixelBufferPool!,&buffer)
 let pixel=buffer!;CVPixelBufferLockBaseAddress(pixel,[])
 let context=CGContext(data:CVPixelBufferGetBaseAddress(pixel),width:capture.width,height:capture.height,bitsPerComponent:8,bytesPerRow:CVPixelBufferGetBytesPerRow(pixel),space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.noneSkipFirst.rawValue)!
 context.draw(cg,in:rect);CVPixelBufferUnlockBaseAddress(pixel,[])
 while !input.isReadyForMoreMediaData {Thread.sleep(forTimeInterval:0.005)}
 guard adapter.append(pixel,withPresentationTime:CMTime(value:Int64(tick),timescale:24)) else {throw writer.error!}
}
writer.endSession(atSourceTime:CMTime(value:Int64(capture.durationMs),timescale:1000));input.markAsFinished()
let completed=DispatchSemaphore(value:0);writer.finishWriting{completed.signal()};completed.wait()
guard writer.status == .completed else {throw writer.error!};print(output.path)

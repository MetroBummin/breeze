import Foundation
import AVFoundation
import AppKit
import CoreVideo
import ImageIO
let args=CommandLine.arguments
let dir=URL(fileURLWithPath:args[1]), output=URL(fileURLWithPath:args[2])
let frames=try FileManager.default.contentsOfDirectory(at:dir,includingPropertiesForKeys:nil).filter{$0.pathExtension=="png"}.sorted{$0.lastPathComponent<$1.lastPathComponent}
let width=Int(args[3])!,height=Int(args[4])!,fps:Int32=30
let bitrate=Int(args.count>5 ? args[5] : "5000000")!
let writer=try AVAssetWriter(outputURL:output,fileType:.mp4)
writer.shouldOptimizeForNetworkUse=true
let input=AVAssetWriterInput(mediaType:.video,outputSettings:[AVVideoCodecKey:AVVideoCodecType.h264,AVVideoWidthKey:width,AVVideoHeightKey:height,AVVideoCompressionPropertiesKey:[AVVideoAverageBitRateKey:bitrate,AVVideoMaxKeyFrameIntervalKey:30,AVVideoExpectedSourceFrameRateKey:30,AVVideoAllowFrameReorderingKey:false,AVVideoProfileLevelKey:AVVideoProfileLevelH264BaselineAutoLevel]])
input.expectsMediaDataInRealTime=false
let adaptor=AVAssetWriterInputPixelBufferAdaptor(assetWriterInput:input,sourcePixelBufferAttributes:[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32ARGB,kCVPixelBufferWidthKey as String:width,kCVPixelBufferHeightKey as String:height,kCVPixelBufferCGImageCompatibilityKey as String:true,kCVPixelBufferCGBitmapContextCompatibilityKey as String:true])
writer.add(input);guard writer.startWriting() else{fatalError(String(describing:writer.error))};writer.startSession(atSourceTime:.zero)
for (index,url) in frames.enumerated(){
 while !input.isReadyForMoreMediaData{Thread.sleep(forTimeInterval:0.001)}
 let source=CGImageSourceCreateWithURL(url as CFURL,nil)!,cg=CGImageSourceCreateImageAtIndex(source,0,nil)!
 guard cg.width==width && cg.height==height else{fatalError("Wrong source dimensions; scaling forbidden")}
 var pixel:CVPixelBuffer?;CVPixelBufferPoolCreatePixelBuffer(nil,adaptor.pixelBufferPool!,&pixel)
 let buffer=pixel!;CVPixelBufferLockBaseAddress(buffer,[])
 let ctx=CGContext(data:CVPixelBufferGetBaseAddress(buffer),width:width,height:height,bitsPerComponent:8,bytesPerRow:CVPixelBufferGetBytesPerRow(buffer),space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.noneSkipFirst.rawValue)!
 ctx.draw(cg,in:CGRect(x:0,y:0,width:width,height:height));CVPixelBufferUnlockBaseAddress(buffer,[])
 guard adaptor.append(buffer,withPresentationTime:CMTime(value:Int64(index),timescale:fps)) else{fatalError(String(describing:writer.error))}
}
input.markAsFinished();let semaphore=DispatchSemaphore(value:0);writer.finishWriting{semaphore.signal()};semaphore.wait()
guard writer.status == .completed else{fatalError(String(describing:writer.error))}
// AVFoundation fast-start can leave its sibling staging file after completion.
for sibling in try FileManager.default.contentsOfDirectory(at:output.deletingLastPathComponent(),includingPropertiesForKeys:nil) where sibling.lastPathComponent.hasPrefix(output.lastPathComponent+".sb-") {
 try FileManager.default.removeItem(at:sibling)
}
print("Encoded one source PNG per H264 Baseline frame:",frames.count,"frames",Double(frames.count)/Double(fps),"seconds")

#!/usr/bin/env swift

import AppKit
import Foundation

struct Pixel {
  var red: UInt8
  var green: UInt8
  var blue: UInt8
  var alpha: UInt8

  var isBackgroundCandidate: Bool {
    let minimum = min(red, green, blue)
    let maximum = max(red, green, blue)
    return minimum >= 190 && maximum <= 244 && maximum - minimum <= 22
  }
}

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let catDirectory = root.appendingPathComponent("public/assets/cat")
let cats = [
  ("Hunao", "hunao"),
  ("Siam", "siam"),
  ("Heyhey", "heyhey"),
  ("heyheyhey", "heyheyhey"),
]
let sourceSide = 2048
let sourceFrameSide = sourceSide / 4
let frameSide = 64
let outputSide = frameSide * 4

func makeSheet(name: String, fileName: String) throws {
  let sourceURL = catDirectory.appendingPathComponent("\(name).jpg")
  guard let source = NSBitmapImageRep(data: try Data(contentsOf: sourceURL)),
        source.pixelsWide == sourceSide,
        source.pixelsHigh == sourceSide else {
    throw NSError(domain: "CatSpriteBuilder", code: 1, userInfo: [
      NSLocalizedDescriptionKey: "\(name).jpg must be a 2048x2048 contact sheet",
    ])
  }

  guard let output = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: outputSide,
    pixelsHigh: outputSide,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  ) else {
    throw NSError(domain: "CatSpriteBuilder", code: 2, userInfo: [
      NSLocalizedDescriptionKey: "Could not allocate \(outputSide)x\(outputSide) output",
    ])
  }

  for frameRow in 0..<4 {
    for frameColumn in 0..<4 {
      var pixels = [Pixel]()
      pixels.reserveCapacity(sourceFrameSide * sourceFrameSide)
      for y in 0..<sourceFrameSide {
        for x in 0..<sourceFrameSide {
          let sourceX = frameColumn * sourceFrameSide + x
          let sourceY = (3 - frameRow) * sourceFrameSide + y
          let color = source.colorAt(x: sourceX, y: sourceY)!.usingColorSpace(.deviceRGB)!
          pixels.append(Pixel(
            red: UInt8((color.redComponent * 255).rounded()),
            green: UInt8((color.greenComponent * 255).rounded()),
            blue: UInt8((color.blueComponent * 255).rounded()),
            alpha: 255
          ))
        }
      }

      var queue = [Int]()
      var queueHead = 0
      var transparent = [Bool](repeating: false, count: pixels.count)
      func addBackground(_ index: Int) {
        guard !transparent[index], pixels[index].isBackgroundCandidate else { return }
        transparent[index] = true
        queue.append(index)
      }

      for edge in 0..<sourceFrameSide {
        addBackground(edge)
        addBackground((sourceFrameSide - 1) * sourceFrameSide + edge)
        addBackground(edge * sourceFrameSide)
        addBackground(edge * sourceFrameSide + sourceFrameSide - 1)
      }
      while queueHead < queue.count {
        let index = queue[queueHead]
        queueHead += 1
        let x = index % sourceFrameSide
        let y = index / sourceFrameSide
        if x > 0 { addBackground(index - 1) }
        if x + 1 < sourceFrameSide { addBackground(index + 1) }
        if y > 0 { addBackground(index - sourceFrameSide) }
        if y + 1 < sourceFrameSide { addBackground(index + sourceFrameSide) }
      }

      for y in 0..<frameSide {
        for x in 0..<frameSide {
          let sourceX = min(sourceFrameSide - 1, x * sourceFrameSide / frameSide + sourceFrameSide / frameSide / 2)
          let sourceY = min(sourceFrameSide - 1, y * sourceFrameSide / frameSide + sourceFrameSide / frameSide / 2)
          let sourceIndex = sourceY * sourceFrameSide + sourceX
          var pixel = pixels[sourceIndex]
          if transparent[sourceIndex] { pixel.alpha = 0 }
          output.setColor(
            NSColor(
              calibratedRed: CGFloat(pixel.red) / 255,
              green: CGFloat(pixel.green) / 255,
              blue: CGFloat(pixel.blue) / 255,
              alpha: CGFloat(pixel.alpha) / 255
            ),
            atX: frameColumn * frameSide + x,
            y: (3 - frameRow) * frameSide + y
          )
        }
      }
    }
  }

  guard let png = output.representation(using: .png, properties: [:]) else {
    throw NSError(domain: "CatSpriteBuilder", code: 3, userInfo: [
      NSLocalizedDescriptionKey: "Could not encode \(name) sprite sheet",
    ])
  }
  try png.write(to: catDirectory.appendingPathComponent(fileName), options: .atomic)
  print("Wrote \(fileName) (4x4 frames, 64x64 each)")
}

do {
  for (name, fileName) in cats {
    try makeSheet(name: name, fileName: "\(fileName)-sprites.png")
  }
} catch {
  fputs("Cat sprite generation failed: \(error.localizedDescription)\n", stderr)
  exit(1)
}

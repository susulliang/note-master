fn main() {
  tauri_build::build();

  // swift-rs (pulled in by the screencapturekit crate) references Swift
  // runtime dylibs via @rpath (e.g. libswift_Concurrency.dylib). Without
  // this rpath the app crashes at launch with DYLD "Library missing".
  // /usr/lib/swift resolves through the dyld shared cache on macOS 13+.
  #[cfg(target_os = "macos")]
  println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
}

/* Execute the production Swift policy AND native adapter with public-API doubles.
 * --ios-typecheck additionally checks the same production pieces against UIKit.
 * Neither path substitutes for the physical Pencil/scrollbar acceptance sequence.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('ios/App/App/SceneDelegate.swift', root), 'utf8');
function block(name) {
  const start = `// BEGIN ${name}`, end = `// END ${name}`;
  assert.equal(source.split(start).length, 2, `${name} must bind to one production block`);
  assert.equal(source.split(end).length, 2);
  return source.slice(source.indexOf(start) + start.length, source.indexOf(end));
}
const core = block('PDF_CONTACT_POLICY');
const adapters = block('PDF_INPUT_ADAPTERS');
const state = block('PDF_ROUTING_STATE');
const methods = block('PDF_ROUTING_METHODS');
assert.ok(!methods.includes('.ignore('), 'Never mutate a live recognizer touch set');
assert.ok(!methods.replace(/\/\/[^\n]*/g, '').includes('numberOfTouches'), 'Raw counts are not finger ownership');
assert.ok(!methods.includes('writeInkTrace('), 'No synchronous diagnostic IO on Pencil admission');
assert.match(source, /inkNativeScope = scope\s+pdfRoutingNeedsRefresh = true/);
assert.match(source, /contacts\.report = .*observePdfContacts\(event\)/);
assert.match(source, /gate\.begin = .*routePdfPencil\(touch, event: event\)/);
assert.match(source, /gate\.allowedTouchTypes = \[NSNumber\(value: UITouch.TouchType.pencil.rawValue\)\]/);
assert.match(source, /super\.viewDidLayoutSubviews\(\)[\s\S]*?schedulePdfRoutingRefresh\(\)/);
const host = `@MainActor private final class RoutingHost {
var webView: WKWebView?
${state}
${methods}
func recordPdfAdmission(role: String, event: UIEvent, scroll: UIScrollView, before: CGPoint) {}
func setScope(_ scope: [String: Any]) { applyPdfScope(scope) }
func observe(_ event: UIEvent) { observePdfContacts(event) }
func route(_ touch: UITouch, _ event: UIEvent) -> Bool { routePdfPencil(touch, event: event) }
func refresh() { refreshPdfRouting() }
}`;
const work = mkdtempSync(join(tmpdir(), 'breeze-pdf-ownership-'));
try {
  // Syntax-check the entire production file as well, including unchanged bridges.
  execFileSync('swiftc', ['-frontend', '-parse', new URL('ios/App/App/SceneDelegate.swift', root).pathname], {stdio:'inherit'});
  if (process.argv.includes('--ios-typecheck')) {
    const sdk = execFileSync('xcrun', ['--sdk','iphonesimulator','--show-sdk-path'], {encoding:'utf8'}).trim();
    const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
    const file = join(work, 'NativeTypecheck.swift');
    writeFileSync(file, `import UIKit\nimport UIKit.UIGestureRecognizerSubclass\nimport WebKit\n${core}\n${adapters}\n${host}`);
    execFileSync('xcrun', ['swiftc','-typecheck','-swift-version','5','-sdk',sdk,'-target',`${arch}-apple-ios15.0-simulator`,file], {stdio:'inherit'});
    console.log('UIKit/WebKit SDK typecheck PASS (not an app build or device test)');
  } else {
    const stubs = readFileSync(new URL('tests/pdf-input-uikit-stubs.swift', root),'utf8');
    const checks = readFileSync(new URL('tests/pdf-input-ownership-checks.swift', root),'utf8');
    const file = join(work,'NativeChecks.swift'), executable = join(work,'checks');
    writeFileSync(file, `${stubs}\n${core}\n${adapters}\n${host}\n${checks}`);
    execFileSync('swiftc',['-swift-version','5','-parse-as-library',file,'-o',executable],{stdio:'inherit'});
    execFileSync(executable,[],{stdio:'inherit'});
  }
} finally { rmSync(work,{recursive:true,force:true}); }

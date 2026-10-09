@main
private enum AuthPolicyChecks {
    static func main() {
        let request = "11111111-1111-4111-8111-111111111111"
        let callback = "kr.io.breeze.app://auth/callback?request=\(request)"
        var count = 0
        func check(_ actual: Bool, _ expected: Bool, _ label: String) {
            precondition(actual == expected, label)
            count += 1
        }
        func authorize(_ provider: String, _ redirect: String = "") -> URL {
            var parts = URLComponents(string: "https://hrtfhojbhqvaoiulspto.supabase.co/auth/v1/authorize")!
            parts.queryItems = [URLQueryItem(name: "provider", value: provider),
                                URLQueryItem(name: "redirect_to", value: redirect.isEmpty ? callback : redirect)]
            return parts.url!
        }
        for provider in ["apple", "google"] {
            let url = authorize(provider)
            check(BreezeAuthCallbackPolicy.authorize(url, request: request), true, "valid \(provider)")
            check(BreezeAuthCallbackPolicy.authorize(url, request: "invalid"), false, "invalid UUID")
            for (label, changed) in [
                ("wrong scheme", url.absoluteString.replacingOccurrences(of: "https:", with: "http:")),
                ("wrong project", url.absoluteString.replacingOccurrences(of: "hrtfhojbhqvaoiulspto", with: "other")),
                ("credentials", url.absoluteString.replacingOccurrences(of: "https://", with: "https://user:password@")),
                ("port", url.absoluteString.replacingOccurrences(of: ".co/", with: ".co:443/")),
                ("wrong path", url.absoluteString.replacingOccurrences(of: "/authorize", with: "/callback")),
                ("fragment", url.absoluteString + "#unexpected"),
                ("duplicate provider", url.absoluteString + "&provider=other"),
                ("duplicate redirect", url.absoluteString + "&redirect_to=other"),
            ] {
                check(BreezeAuthCallbackPolicy.authorize(URL(string: changed)!, request: request), false, label)
            }
            check(BreezeAuthCallbackPolicy.authorize(authorize(provider, callback + "&request=other"), request: request), false, "ambiguous return")
            check(BreezeAuthCallbackPolicy.authorize(authorize(provider, "https://breeze.io.kr/"), request: request), false, "unbound return")
        }
        check(BreezeAuthCallbackPolicy.authorize(authorize("github"), request: request), false, "unsupported provider")
        check(BreezeAuthCallbackPolicy.callback(URL(string: callback)!, request: request), true, "valid callback")
        check(BreezeAuthCallbackPolicy.callback(URL(string: callback + "#access_token=test&refresh_token=test&token_type=bearer")!, request: request), true, "token fragment belongs to bundled SDK")
        for (label, changed) in [
            ("wrong scheme", callback.replacingOccurrences(of: "kr.io.breeze.app:", with: "https:")),
            ("wrong host", callback.replacingOccurrences(of: "://auth/", with: "://other/")),
            ("wrong path", callback.replacingOccurrences(of: "/callback", with: "/other")),
            ("callback credentials", callback.replacingOccurrences(of: "://auth/", with: "://user:password@auth/")),
            ("callback port", callback.replacingOccurrences(of: "://auth/", with: "://auth:123/")),
            ("wrong request", callback.replacingOccurrences(of: request, with: "22222222-2222-4222-8222-222222222222")),
            ("duplicate request", callback + "&request=other"),
            ("missing request", "kr.io.breeze.app://auth/callback"),
        ] {
            check(BreezeAuthCallbackPolicy.callback(URL(string: changed)!, request: request), false, label)
        }
        check(BreezeAuthCallbackPolicy.callback(URL(string: callback)!, request: "invalid"), false, "invalid callback owner")
        let claims: [String: Any] = ["iss": "https://appleid.apple.com", "aud": "kr.io.breeze.app", "sub": "existing-apple-subject", "nonce": "expected-sha256", "exp": 2000]
        func token(_ values: [String: Any]) -> String {
            let data = try! JSONSerialization.data(withJSONObject: values)
            let payload = data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
            return "header.\(payload).fixture-signature"
        }
        func apple(_ value: String) -> Bool {
            BreezeAppleTokenPolicy.accepts(value, nonceHash: "expected-sha256", subject: "existing-apple-subject", now: 1000)
        }
        check(apple(token(claims)), true, "valid request-bound Apple identity")
        for (key, value) in [("iss", "https://other.example"), ("aud", "kr.io.breeze.app.web"), ("sub", "different-user"), ("nonce", "different-nonce")] {
            var altered = claims; altered[key] = value
            check(apple(token(altered)), false, "Apple \(key) mismatch")
        }
        var expired = claims; expired["exp"] = 1000
        check(apple(token(expired)), false, "expired Apple identity")
        var missing = claims; missing.removeValue(forKey: "nonce")
        check(apple(token(missing)), false, "missing nonce")
        for malformed in ["", "a.b", "a.b.c.d", ".payload.signature", "header.payload.", "header.invalid!.signature"] {
            check(apple(malformed), false, "malformed Apple token")
        }
        print("Native Foundation auth policy: \(count) checks passed; not a live consent or UIKit session test")
    }
}

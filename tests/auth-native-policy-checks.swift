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
        print("Native Foundation auth policy: \(count) checks passed; not a live consent or UIKit session test")
    }
}

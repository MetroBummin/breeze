package kr.io.breeze.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BreezePdfPlatformPlugin.class);
        registerPlugin(BreezePdfOcrPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStart() {
        super.onStart();
        // The WebView exists only after the bridge starts. Re-apply on every
        // start so a recreated activity cannot bring page zoom back.
        // In-reader PDF zoom is a CSS transform and does not use this setting.
        Bridge bridge = getBridge();
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView == null) return;
        WebSettings settings = webView.getSettings();
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
    }
}

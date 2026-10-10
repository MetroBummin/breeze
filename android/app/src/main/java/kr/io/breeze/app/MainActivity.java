package kr.io.breeze.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BreezePdfPlatformPlugin.class);
        registerPlugin(BreezePdfOcrPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

package kr.io.breeze.app;

import android.content.Context;
import android.content.res.Configuration;
import android.hardware.display.DisplayManager;
import android.view.Display;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Read-only device classification; no pen connection or extra permissions. */
@CapacitorPlugin(name = "BreezePdfPlatform")
public class BreezePdfPlatformPlugin extends Plugin {
    @PluginMethod
    public void getCapabilities(PluginCall call) {
        boolean tablet = false;
        try {
            Context application = getContext().getApplicationContext();
            DisplayManager displays = application.getSystemService(DisplayManager.class);
            Display builtin = displays == null ? null : displays.getDisplay(Display.DEFAULT_DISPLAY);
            if (builtin != null) {
                // A display context, not the Activity's resizable window resources.
                // Native LARGE/XLARGE is a tablet-class policy, not pen detection.
                Configuration device = application.createDisplayContext(builtin)
                        .getResources().getConfiguration();
                tablet = PdfDeviceClassification.isTablet(device.screenLayout, device.uiMode,
                        application.getPackageManager().hasSystemFeature("android.hardware.type.pc"));
            }
        } catch (RuntimeException ignored) {
            // Unknown device classification remains read-only.
        }
        JSObject result = new JSObject();
        result.put("tablet", tablet);
        call.resolve(result);
    }
}

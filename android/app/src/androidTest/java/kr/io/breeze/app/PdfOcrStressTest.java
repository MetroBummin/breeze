package kr.io.breeze.app;

import static org.junit.Assert.*;
import android.content.Context;
import android.os.Debug;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Base64;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Actual bundled ML Kit through the production plugin; only bridge delivery is
 * captured. Corpus is test APK assets, never shipped with the reader. */
@RunWith(AndroidJUnit4.class)
public class PdfOcrStressTest {
    private static class Capture extends PluginCall {
        final CountDownLatch done = new CountDownLatch(1);
        volatile JSObject result;
        volatile String error;
        Capture(String image) { this(image, ""); }
        Capture(String image, String requestId) { super(null, "BreezePdfOcr", "stress", "recognize", new JSObject().put("image", image).put("requestId", requestId)); }
        @Override public void resolve(JSObject value) { result = value; done.countDown(); }
        @Override public void reject(String message, String code, Exception ex, JSObject data) { error = code; done.countDown(); }
    }
    private byte[] asset(Context context, String name) throws Exception {
        try (java.io.InputStream stream = context.getAssets().open("pdf-ocr-stress/" + name)) {
            return stream.readAllBytes();
        }
    }
    private void save(Context context, JSONObject report) throws Exception {
        try (FileOutputStream stream = new FileOutputStream(new File(context.getFilesDir(), "ocr-stress.json"))) {
            stream.write(report.toString(2).getBytes(StandardCharsets.UTF_8));
        }
    }
    @Test public void actualOfflineCorpusAndRepeatedNativeCalls() throws Exception {
        Context assets = InstrumentationRegistry.getInstrumentation().getContext();
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("CI must disable networking before the first recognition", 1,
            Settings.Global.getInt(app.getContentResolver(), Settings.Global.AIRPLANE_MODE_ON, 0));
        JSONArray corpus = new JSONObject(new String(asset(assets, "manifest.json"), StandardCharsets.UTF_8)).getJSONArray("cases");
        JSONArray cases = new JSONArray(), repeats = new JSONArray();
        JSONObject report = new JSONObject().put("engine", "bundled ML Kit 16.0.1").put("native", true)
            .put("environment", "Android emulator; not physical hardware").put("sdk", android.os.Build.VERSION.SDK_INT)
            .put("network", "airplane mode, wifi/data disabled before first model invocation")
            .put("bridge", "captured delivery from unchanged production plugin").put("cases", cases).put("repetitions", repeats)
            .put("memoryMetric", "process total PSS KiB; includes framework/model/harness; not a leak proof");
        BreezePdfOcrPlugin plugin = new BreezePdfOcrPlugin();
        try {
            for (int i=0; i<corpus.length()+24; i++) {
                String id = i<corpus.length() ? corpus.getJSONObject(i).getString("id") : "print-48";
                Capture call = new Capture(Base64.encodeToString(asset(assets, id+".png"), Base64.NO_WRAP), "stress-"+i);
                long started = SystemClock.elapsedRealtime(); plugin.recognize(call);
                assertTrue("native completion deadline: "+id, call.done.await(45, TimeUnit.SECONDS));
                Capture receipt = new Capture("", "stress-"+i); plugin.getStatus(receipt);
                assertTrue("matching native completion receipt", receipt.result.getBool("finished", false));
                Capture unrelated = new Capture("", "unrelated"); plugin.getStatus(unrelated);
                assertFalse("unrelated request must not release native admission", unrelated.result.getBool("finished", true));
                Debug.MemoryInfo memory = new Debug.MemoryInfo(); Debug.getMemoryInfo(memory);
                JSONObject row = new JSONObject().put("id", id).put("iteration", i)
                    .put("milliseconds", SystemClock.elapsedRealtime()-started).put("pssKiB", memory.getTotalPss())
                    .put("error", call.error == null ? JSONObject.NULL : call.error);
                if (i<corpus.length()) { row.put("words", call.result==null ? new JSONArray() : call.result.getJSONArray("words")); cases.put(row); }
                else repeats.put(row);
                save(app, report);
                assertNull("native failure: "+id, call.error);
            }
            Capture invalid = new Capture("not-valid-base64"); plugin.recognize(invalid);
            assertTrue(invalid.done.await(5, TimeUnit.SECONDS)); assertNotNull(invalid.error);
        } finally { plugin.handleOnDestroy(); save(app, report); }
    }
}

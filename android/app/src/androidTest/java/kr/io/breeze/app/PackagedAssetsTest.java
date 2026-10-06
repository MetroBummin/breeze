package kr.io.breeze.app;

import static org.junit.Assert.*;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.InputStream;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Real-device/emulator smoke test. Compilation alone is not a passing device test. */
@RunWith(AndroidJUnit4.class)
public class PackagedAssetsTest {
    @Test
    public void packagesBreezeAssets() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("kr.io.breeze.app.debug", context.getPackageName());
        for (String path : new String[] {
            "public/index.html", "public/config.js", "public/scripts/reader/pdf-ink.js"
        }) {
            try (InputStream asset = context.getAssets().open(path)) {
                assertTrue("Missing bundled asset: " + path, asset.read() >= 0);
            }
        }
    }
}

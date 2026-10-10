package kr.io.breeze.app;

import static org.junit.Assert.*;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import com.getcapacitor.JSArray;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Requires an emulator/device: real bundled model and the production adapter.
 * Synthetic high-contrast text is a smoke fixture, not a general accuracy score. */
@RunWith(AndroidJUnit4.class)
public class PdfOcrAccuracyTest {
    @Test public void recognizesWordsAtTheirDrawnLocationsOffline() throws Exception {
        Bitmap bitmap = Bitmap.createBitmap(1200, 800, Bitmap.Config.ARGB_8888);
        TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        try {
            Canvas canvas = new Canvas(bitmap); canvas.drawColor(Color.WHITE);
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG); paint.setColor(Color.BLACK); paint.setTextSize(72);
            String[] expected = {"Bright", "world"}; int[] positions = {80, 450};
            Rect[] truth = new Rect[expected.length];
            for (int i = 0; i < expected.length; i++) {
                canvas.drawText(expected[i], positions[i], 180, paint);
                truth[i] = new Rect(); paint.getTextBounds(expected[i], 0, expected[i].length(), truth[i]);
                truth[i].offset(positions[i], 180); truth[i].inset(-8, -8);
            }
            Text text = Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0)), 30, TimeUnit.SECONDS);
            JSArray words = BreezePdfOcrPlugin.wordsFromText(text, bitmap.getWidth(), bitmap.getHeight());
            assertEquals("fixture has exactly two English words", 2, words.length());
            for (int i = 0; i < expected.length; i++) {
                JSONObject word = words.getJSONObject(i); assertEquals(expected[i], word.getString("word"));
                int x = (int) ((word.getDouble("x") + word.getDouble("w") / 2) * bitmap.getWidth());
                int y = (int) ((word.getDouble("y") + word.getDouble("h") / 2) * bitmap.getHeight());
                assertTrue("word center must hit its independently drawn glyph bounds", truth[i].contains(x, y));
                assertTrue(word.getDouble("w") > 0); assertTrue(word.getDouble("h") > 0);
            }
        } finally { recognizer.close(); bitmap.recycle(); }
    }
}

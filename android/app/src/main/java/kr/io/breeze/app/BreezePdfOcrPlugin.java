package kr.io.breeze.app;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;

/** Bundled Latin OCR. No model download, PDF file access, or cloud OCR. */
@CapacitorPlugin(name = "BreezePdfOcr")
public class BreezePdfOcrPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private volatile String completedRequestId;
    private static final Pattern WORD = Pattern.compile("^[A-Za-z](?:[A-Za-z'’\\-]*[A-Za-z])?$");

    @PluginMethod
    public void getStatus(PluginCall call) {
        String requestId = call.getString("requestId");
        call.resolve(new JSObject().put("finished", requestId != null && !busy.get() && requestId.equals(completedRequestId)));
    }

    private void finish(String requestId, TextRecognizer recognizer, Bitmap bitmap) {
        try { if (recognizer != null) recognizer.close(); }
        finally {
            try { if (bitmap != null) bitmap.recycle(); }
            finally { completedRequestId = requestId; busy.set(false); }
        }
    }

    @PluginMethod
    public void recognize(PluginCall call) {
        String image = call.getString("image");
        if (image == null || image.length() > 24_000_000) {
            call.reject("Invalid page image", "INVALID_IMAGE"); return;
        }
        if (!busy.compareAndSet(false, true)) {
            call.reject("OCR is busy", "BUSY"); return;
        }
        final String requestId = call.getString("requestId");
        worker.execute(() -> {
            Bitmap bitmap = null;
            TextRecognizer recognizer = null;
            try {
                byte[] bytes = Base64.decode(image, Base64.NO_WRAP);
                BitmapFactory.Options bounds = new BitmapFactory.Options();
                bounds.inJustDecodeBounds = true;
                BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
                if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || bounds.outWidth > 2048 || bounds.outHeight > 2048)
                    throw new IllegalArgumentException("Invalid image dimensions");
                bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (bitmap == null) throw new IllegalArgumentException("Invalid image");
                recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
                final Bitmap ownedBitmap = bitmap;
                final TextRecognizer ownedRecognizer = recognizer;
                // Rotation is already baked into the PDF.js raster.
                recognizer.process(InputImage.fromBitmap(bitmap, 0))
                    .addOnCompleteListener(task -> {
                        JSObject result = null;
                        try {
                            if (task.isSuccessful()) {
                                JSArray words = wordsFromText(task.getResult(), ownedBitmap.getWidth(), ownedBitmap.getHeight());
                                result = new JSObject(); result.put("words", words);
                            }
                        } catch (RuntimeException error) {
                            // Settle after releasing the input/model, even on failure.
                        } finally {
                            finish(requestId, ownedRecognizer, ownedBitmap);
                        }
                        if (result != null) call.resolve(result);
                        else call.reject("Page text recognition failed", "OCR_FAILED");
                    });
            } catch (RuntimeException error) {
                finish(requestId, recognizer, bitmap);
                call.reject("Page text recognition failed", "OCR_FAILED");
            }
        });
    }

    // Shared with the on-device fixture: exercise the production coordinate adapter.
    static JSArray wordsFromText(Text text, int width, int height) {
        JSArray words = new JSArray();
        int lineIndex = 0;
        for (Text.TextBlock block : text.getTextBlocks()) {
            for (Text.Line line : block.getLines()) {
                for (Text.Element element : line.getElements()) {
                    String word = element.getText().replaceAll("^[^A-Za-z]+|[^A-Za-z]+$", "");
                    Rect box = element.getBoundingBox();
                    // Never divide a line/element box proportionally into invented word boxes.
                    if (words.length() >= 3000 || word.length() > 100 || !WORD.matcher(word).matches()
                            || box == null || box.isEmpty() || element.getConfidence() < 0.3f) continue;
                    JSObject row = new JSObject();
                    row.put("word", word); row.put("line", lineIndex);
                    row.put("confidence", element.getConfidence());
                    row.put("x", (double) box.left / width);
                    row.put("y", (double) box.top / height);
                    row.put("w", (double) box.width() / width);
                    row.put("h", (double) box.height() / height);
                    words.put(row);
                }
                lineIndex++;
            }
        }
        return words;
    }

    @Override
    protected void handleOnDestroy() {
        worker.shutdown(); // A task already admitted releases its own bitmap/model.
        super.handleOnDestroy();
    }
}

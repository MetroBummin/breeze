package kr.io.breeze.app;

import android.content.res.Configuration;

final class PdfDeviceClassification {
    private PdfDeviceClassification() {}

    static boolean isTablet(int screenLayout, int uiMode, boolean pc) {
        int size = screenLayout & Configuration.SCREENLAYOUT_SIZE_MASK;
        return !pc && (uiMode & Configuration.UI_MODE_TYPE_MASK) == Configuration.UI_MODE_TYPE_NORMAL
                && (size == Configuration.SCREENLAYOUT_SIZE_LARGE
                    || size == Configuration.SCREENLAYOUT_SIZE_XLARGE);
    }
}

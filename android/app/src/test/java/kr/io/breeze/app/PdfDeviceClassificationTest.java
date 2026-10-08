package kr.io.breeze.app;

import android.content.res.Configuration;
import org.junit.Test;
import static org.junit.Assert.*;

public class PdfDeviceClassificationTest {
    @Test public void phonesAndUnknownSizeAreDenied() {
        for (int size : new int[] {Configuration.SCREENLAYOUT_SIZE_UNDEFINED,
                Configuration.SCREENLAYOUT_SIZE_SMALL, Configuration.SCREENLAYOUT_SIZE_NORMAL}) {
            assertFalse(PdfDeviceClassification.isTablet(size, Configuration.UI_MODE_TYPE_NORMAL, false));
        }
    }
    @Test public void largeAndXLargeDevicesAreAdmittedWithoutPenSignals() {
        for (int size : new int[] {Configuration.SCREENLAYOUT_SIZE_LARGE, Configuration.SCREENLAYOUT_SIZE_XLARGE}) {
            assertTrue(PdfDeviceClassification.isTablet(size, Configuration.UI_MODE_TYPE_NORMAL, false));
            assertTrue(PdfDeviceClassification.isTablet(size | Configuration.SCREENLAYOUT_LONG_YES
                    | Configuration.SCREENLAYOUT_LAYOUTDIR_RTL,
                    Configuration.UI_MODE_TYPE_NORMAL | Configuration.UI_MODE_NIGHT_YES, false));
        }
    }
    @Test public void pcAndOtherNativeDeviceModesAreDenied() {
        assertFalse(PdfDeviceClassification.isTablet(Configuration.SCREENLAYOUT_SIZE_XLARGE,
                Configuration.UI_MODE_TYPE_NORMAL, true));
        for (int mode : new int[] {Configuration.UI_MODE_TYPE_UNDEFINED, Configuration.UI_MODE_TYPE_DESK,
                Configuration.UI_MODE_TYPE_TELEVISION, Configuration.UI_MODE_TYPE_WATCH,
                Configuration.UI_MODE_TYPE_CAR, Configuration.UI_MODE_TYPE_APPLIANCE,
                Configuration.UI_MODE_TYPE_VR_HEADSET}) {
            assertFalse(PdfDeviceClassification.isTablet(Configuration.SCREENLAYOUT_SIZE_XLARGE, mode, false));
        }
    }
}

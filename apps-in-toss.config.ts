import { defineConfig } from '@apps-in-toss/web-framework/config';

/* appName must match the Apps in Toss console id exactly.
   Display name, icon and screenshots are console fields, not this file.
   primaryColor is the light-mode selection ink from styles/tokens.css. */
export default defineConfig({
  appName: 'breeze',
  brand: {
    primaryColor: '#267FA8',
  },
  permissions: [],
  navigationBar: {
    withBackButton: true,
    withHomeButton: true,
    withTitle: true,
    theme: 'light',
  },
  webView: {
    allowsBackForwardNavigationGestures: false,
    pullToRefreshEnabled: false,
    mediaPlaybackRequiresUserAction: true,
  },
  webBundleDir: 'toss/dist',
});

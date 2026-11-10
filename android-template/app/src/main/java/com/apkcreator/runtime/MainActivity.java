package com.apkcreator.runtime;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Native shell for apps produced by APK Creator.
 *
 * The UI itself is the shared HTML runtime bundled in assets/www, driven by
 * assets/www/config.js which the build worker generates per app. This activity
 * hosts it in a WebView, routes non-web links (tel:, mailto:, whatsapp:, geo:)
 * to the right apps and exposes a tiny JavaScript bridge ("ApkBridge").
 */
public class MainActivity extends Activity {

    private static final String OFFLINE_URL = "file:///android_asset/www/offline.html";
    /**
     * Virtual origin for bundled custom web apps. Requests to it are answered
     * from assets/www, which gives the app a real https origin: ES modules,
     * fetch() of bundled files and secure-context APIs work like on a server.
     */
    private static final String APP_ORIGIN = "https://app.local/";
    private static final String APP_HOST = "app.local";
    private static final int FILE_CHOOSER_REQUEST = 1001;

    private WebView webView;
    private ProgressBar progressBar;
    private ValueCallback<Uri[]> filePathCallback;
    private String lastFailedUrl;
    /** file:///android_asset/www/index.html for template apps, https://app.local/index.html for custom code. */
    private String startUrl;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        startUrl = getString(R.string.start_url);

        FrameLayout root = new FrameLayout(this);
        root.setFitsSystemWindows(true);

        webView = new WebView(this);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(webView);

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        FrameLayout.LayoutParams pbParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(3));
        progressBar.setLayoutParams(pbParams);
        progressBar.setMax(100);
        progressBar.setVisibility(View.GONE);
        root.addView(progressBar);

        setContentView(root);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        // Bundled apps on the https virtual origin may talk to plain-http servers
        // (typical for on-premise installs on a LAN).
        s.setMixedContentMode(startUrl.startsWith(APP_ORIGIN)
                ? WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                : WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setUserAgentString(s.getUserAgentString() + " ApkCreator/1.0");

        webView.addJavascriptInterface(new Bridge(), "ApkBridge");
        webView.setWebViewClient(new ShellWebViewClient());
        webView.setWebChromeClient(new ShellChromeClient());
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
                openExternal(url));

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(startUrl);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(
                        WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                filePathCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static boolean isBundled(String url) {
        return url.startsWith("file:") || url.startsWith(APP_ORIGIN);
    }

    private static String mimeTypeFor(String path) {
        int dot = path.lastIndexOf('.');
        String ext = dot < 0 ? "" : path.substring(dot + 1).toLowerCase();
        switch (ext) {
            case "html":
            case "htm":
                return "text/html";
            case "js":
            case "mjs":
                return "text/javascript";
            case "css":
                return "text/css";
            case "json":
            case "map":
                return "application/json";
            case "webmanifest":
                return "application/manifest+json";
            case "svg":
                return "image/svg+xml";
            case "wasm":
                return "application/wasm";
            case "woff2":
                return "font/woff2";
            case "woff":
                return "font/woff";
            default:
                String guessed = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
                return guessed != null ? guessed : "application/octet-stream";
        }
    }

    /** Serves https://app.local/<path> from assets/www/<path>. */
    private WebResourceResponse serveBundledFile(Uri uri) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Cache-Control", "no-cache");
        String path = uri.getPath();
        if (path == null || path.isEmpty() || path.equals("/")) {
            path = "/index.html";
        } else if (path.endsWith("/")) {
            path = path + "index.html";
        }
        if (!path.contains("..")) {
            try {
                InputStream in = getAssets().open("www" + path);
                String mime = mimeTypeFor(path);
                boolean text = mime.startsWith("text/") || mime.contains("json") || mime.contains("svg") || mime.contains("javascript");
                WebResourceResponse response = new WebResourceResponse(mime, text ? "UTF-8" : null, in);
                response.setResponseHeaders(headers);
                return response;
            } catch (IOException ignored) {
                // fall through to 404
            }
        }
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", headers,
                new ByteArrayInputStream(new byte[0]));
    }

    private boolean isOnline() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (cm == null) return true;
        NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    /** Hands a URL to whichever installed app can handle it. */
    private boolean openExternal(String url) {
        try {
            Intent intent;
            if (url.startsWith("intent:")) {
                intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                intent.setComponent(null);
                intent.setSelector(null);
            } else if (url.startsWith("tel:")) {
                intent = new Intent(Intent.ACTION_DIAL, Uri.parse(url));
            } else if (url.startsWith("mailto:")) {
                intent = new Intent(Intent.ACTION_SENDTO, Uri.parse(url));
            } else {
                intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            }
            startActivity(intent);
            return true;
        } catch (ActivityNotFoundException e) {
            if (url.startsWith("whatsapp:")) {
                // WhatsApp missing: fall back to the web link.
                Uri u = Uri.parse(url);
                String phone = u.getQueryParameter("phone");
                String text = u.getQueryParameter("text");
                String web = "https://wa.me/" + (phone == null ? "" : phone)
                        + (text == null ? "" : "?text=" + Uri.encode(text));
                return openExternal(web);
            }
            Toast.makeText(this, "No app found to open this link", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, "Unable to open link", Toast.LENGTH_SHORT).show();
        }
        return false;
    }

    private class ShellWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            String url = request.getUrl().toString();
            String scheme = request.getUrl().getScheme();
            if ("http".equals(scheme) || "https".equals(scheme) || "file".equals(scheme)
                    || "about".equals(scheme) || "data".equals(scheme)) {
                return false; // keep inside the app
            }
            openExternal(url);
            return true;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if ("https".equals(uri.getScheme()) && APP_HOST.equals(uri.getHost())) {
                return serveBundledFile(uri);
            }
            return null;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            progressBar.setVisibility(isBundled(url) ? View.GONE : View.VISIBLE);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            progressBar.setVisibility(View.GONE);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame() && !isBundled(request.getUrl().toString())) {
                lastFailedUrl = request.getUrl().toString();
                view.loadUrl(OFFLINE_URL);
            }
        }
    }

    private class ShellChromeClient extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            progressBar.setProgress(newProgress);
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                         FileChooserParams params) {
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(null);
            }
            filePathCallback = callback;
            try {
                startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
            } catch (ActivityNotFoundException e) {
                filePathCallback = null;
                return false;
            }
            return true;
        }
    }

    /** JavaScript bridge available to the runtime as window.ApkBridge. */
    private class Bridge {
        @JavascriptInterface
        public void openExternal(String url) {
            runOnUiThread(() -> MainActivity.this.openExternal(url));
        }

        @JavascriptInterface
        public void share(String title, String text) {
            runOnUiThread(() -> {
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("text/plain");
                send.putExtra(Intent.EXTRA_SUBJECT, title);
                send.putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(send, title));
            });
        }

        @JavascriptInterface
        public void toast(String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public void setStatusBarColor(String hex) {
            runOnUiThread(() -> {
                try {
                    Window w = getWindow();
                    w.setStatusBarColor(Color.parseColor(hex));
                } catch (IllegalArgumentException ignored) {
                }
            });
        }

        @JavascriptInterface
        public boolean isOnline() {
            return MainActivity.this.isOnline();
        }

        @JavascriptInterface
        public void retry() {
            runOnUiThread(() -> {
                if (lastFailedUrl != null) {
                    webView.loadUrl(lastFailedUrl);
                } else {
                    webView.loadUrl(startUrl);
                }
            });
        }

        @JavascriptInterface
        public String appVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }
    }
}

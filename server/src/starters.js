"use strict";

/*
 * Starter source files for developer / AI-driven apps.
 *   code     a small web app (HTML/CSS/JS) packaged in the native shell
 *   project  a minimal native Android project (Java, no dependencies) that
 *            builds offline with the toolchain shipped in the builder image
 */

function codeStarter(appName) {
  const title = String(appName).replace(/[<>&"]/g, "");
  return {
    "index.html": `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${title}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header><h1>${title}</h1></header>
  <main>
    <p class="lead">This is your app. Edit these files, or ask your AI assistant to rewrite them, then build an APK.</p>
    <div class="card">
      <span id="count">0</span>
      <button id="add">Tap me</button>
    </div>
    <button id="share" class="secondary">Share</button>
    <p id="env" class="muted"></p>
  </main>
  <script src="app.js"></script>
</body>
</html>
`,
    "style.css": `:root { --brand: #1e63e9; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, Roboto, sans-serif; background: #f4f6fa; color: #1d2129; }
header { background: var(--brand); color: #fff; padding: 16px 20px; }
h1 { margin: 0; font-size: 20px; }
main { padding: 20px; max-width: 520px; margin: 0 auto; display: grid; gap: 16px; }
.lead { margin: 0; line-height: 1.5; }
.card { background: #fff; border-radius: 16px; padding: 24px; display: grid; gap: 16px; justify-items: center; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
#count { font-size: 56px; font-weight: 800; color: var(--brand); }
button { border: 0; border-radius: 12px; padding: 14px 22px; font-size: 16px; font-weight: 600; background: var(--brand); color: #fff; }
button.secondary { background: #fff; color: var(--brand); box-shadow: inset 0 0 0 2px var(--brand); }
.muted { color: #6b7489; font-size: 13px; text-align: center; }
`,
    "app.js": `// window.ApkBridge exists only inside the Android app. Always feature-detect it
// so the same code also runs in the browser preview.
const native = window.ApkBridge;

let count = Number(localStorage.getItem("count") || 0);
const countEl = document.getElementById("count");
const render = () => { countEl.textContent = count; };

document.getElementById("add").addEventListener("click", () => {
  count += 1;
  localStorage.setItem("count", count);
  render();
  if (native && count % 10 === 0) native.toast("Nice! " + count + " taps");
});

document.getElementById("share").addEventListener("click", () => {
  const text = "I tapped " + count + " times!";
  if (native) native.share(document.title, text);
  else if (navigator.share) navigator.share({ title: document.title, text });
  else alert(text);
});

document.getElementById("env").textContent = native
  ? "Running inside the Android app v" + native.appVersion()
  : "Running in the browser preview";

if (native) native.setStatusBarColor("#1e63e9");
render();
`,
  };
}

function projectStarter(appName, packageName) {
  const label = String(appName).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "\\'").replace(/"/g, '\\"');
  const pkgPath = packageName.replace(/\./g, "/");
  return {
    "settings.gradle": `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "app"
include ':app'
`,
    "build.gradle": `plugins {
    id 'com.android.application' version '8.7.3' apply false
}
`,
    "gradle.properties": `org.gradle.jvmargs=-Xmx1536m -Dfile.encoding=UTF-8
android.useAndroidX=false
android.nonTransitiveRClass=true
`,
    "app/build.gradle": `plugins {
    id 'com.android.application'
}

android {
    namespace '${packageName}'
    compileSdk 35
    buildToolsVersion '35.0.0'

    defaultConfig {
        applicationId '${packageName}'
        minSdk 26
        targetSdk 35
        versionCode 1
        versionName '1.0.0'
    }

    // Release signing is injected by APK Creator at build time.
    buildTypes {
        release {
            minifyEnabled false
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }

    lint {
        checkReleaseBuilds false
        abortOnError false
    }
}
`,
    "app/src/main/AndroidManifest.xml": `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <application
        android:allowBackup="true"
        android:label="@string/app_name"
        android:theme="@android:style/Theme.Material.Light.DarkActionBar">
        <activity android:name=".MainActivity" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`,
    "app/src/main/res/values/strings.xml": `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${label}</string>
</resources>
`,
    [`app/src/main/java/${pkgPath}/MainActivity.java`]: `package ${packageName};

import android.app.Activity;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {
    private int count = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        int pad = Math.round(24 * getResources().getDisplayMetrics().density);
        root.setPadding(pad, pad, pad, pad);

        TextView label = new TextView(this);
        label.setTextSize(48);
        label.setGravity(Gravity.CENTER);
        label.setText("0");

        Button button = new Button(this);
        button.setText("Tap me");
        button.setOnClickListener(v -> label.setText(String.valueOf(++count)));

        root.addView(label);
        root.addView(button);
        setContentView(root);
    }
}
`,
  };
}

function toEntries(files) {
  return Object.entries(files).map(([path, content]) => ({ path, data: Buffer.from(content, "utf8") }));
}

module.exports = { codeStarter, projectStarter, toEntries };

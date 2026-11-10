"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const configLoader = require("../src/config");
const { LocalStorage } = require("../src/storage");
const { prepareProject, collectMedia, androidString } = require("../src/builder/project");
const { PNG } = require("./helpers");

test("android string resources are escaped", () => {
  assert.equal(androidString("Bella's Café & Grill"), "Bella\\'s Café &amp; Grill");
  assert.equal(androidString('Say "hi" <b>'), 'Say \\"hi\\" &lt;b&gt;');
  assert.equal(androidString("@home"), "\\@home");
  assert.equal(androidString("?q"), "\\?q");
});

test("media references are rewritten to bundled assets", () => {
  const { config, keys } = collectMedia({
    a: "/api/media/abcdefgh12345678.png",
    b: ["https://cdn.example.com/x.png", { c: "http://host:8080/api/media/ZZZZZZZZ.jpg" }],
    d: "/api/media/../../etc/passwd",
  });
  assert.equal(config.a, "media/abcdefgh12345678.png");
  assert.equal(config.b[0], "https://cdn.example.com/x.png");
  assert.equal(config.b[1].c, "media/ZZZZZZZZ.jpg");
  assert.equal(config.d, "/api/media/../../etc/passwd");
  assert.deepEqual(keys.sort(), ["ZZZZZZZZ.jpg", "abcdefgh12345678.png"]);
});

test("prepareProject generates a customised Android project", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apkc-proj-"));
  try {
    const config = configLoader.load({ DATA_DIR: tmp, PUBLIC_URL: "https://build.example.com" });
    const storage = new LocalStorage(path.join(tmp, "storage"));
    await storage.put("media/logo12345678.png", PNG);
    await storage.put("media/icon12345678.png", PNG);
    const dir = path.join(tmp, "proj");
    await prepareProject({
      dir, storage, config,
      build: {
        app_id: "APP1", app_name: "Joe's \"Diner\" & Bar", package_name: "com.joes.diner", version_code: 7, version_name: "2.1.0",
        icon_key: "media/icon12345678.png",
        config: JSON.stringify({ theme: { primary: "#AA0000" }, icon: { symbol: "restaurant" }, business: { logo: "/api/media/logo12345678.png" }, pages: [] }),
      },
      signing: { storeFile: "/x/release.p12", storePassword: "pw", keyAlias: "release", keyPassword: "pw" },
    });
    const res = (f) => fs.readFileSync(path.join(dir, "app/src/main", f), "utf8");
    assert.match(res("res/values/strings.xml"), /Joe\\'s \\"Diner\\" &amp; Bar/);
    assert.match(res("res/values/colors.xml"), /brand_primary">#AA0000/);
    assert.ok(fs.existsSync(path.join(dir, "app/src/main/res/mipmap-xxxhdpi/ic_launcher.png")), "custom icon copied");
    assert.ok(!fs.existsSync(path.join(dir, "app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml")), "adaptive icon removed");
    const cfgJs = res("assets/www/config.js");
    assert.match(cfgJs, /"logo":"media\/logo12345678.png"/);
    assert.match(cfgJs, /"leadsEndpoint":"https:\/\/build.example.com\/api\/public\/leads\/APP1"/);
    assert.ok(fs.existsSync(path.join(dir, "app/src/main/assets/www/media/logo12345678.png")));
    assert.ok(fs.existsSync(path.join(dir, "app/src/main/assets/www/app.js")), "runtime copied");
    const props = fs.readFileSync(path.join(dir, "apkcreator.properties"), "utf8");
    assert.match(props, /applicationId=com.joes.diner/);
    assert.match(props, /versionCode=7/);
    assert.match(props, /storeFile=\/x\/release.p12/);
    assert.ok(!fs.existsSync(path.join(dir, "app/build")), "build outputs are not copied");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("launcher icon uses the chosen symbol when no custom icon", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apkc-proj-"));
  try {
    const config = configLoader.load({ DATA_DIR: tmp });
    const storage = new LocalStorage(path.join(tmp, "storage"));
    const dir = path.join(tmp, "proj");
    await prepareProject({
      dir, storage, config,
      build: { app_id: "A", app_name: "Gym", package_name: "com.gym.app", version_code: 1, version_name: "1.0",
        config: JSON.stringify({ theme: { primary: "#111111" }, icon: { symbol: "fitness", background: "#FF6600", foreground: "#000000" }, pages: [] }) },
    });
    const fg = fs.readFileSync(path.join(dir, "app/src/main/res/drawable/ic_launcher_foreground.xml"), "utf8");
    assert.match(fg, /fillColor="#000000"/);
    assert.match(fg, /M20\.57 14\.86/);
    assert.match(fs.readFileSync(path.join(dir, "app/src/main/res/values/colors.xml"), "utf8"), /ic_launcher_background">#FF6600/);
    assert.ok(fs.existsSync(path.join(dir, "app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml")));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

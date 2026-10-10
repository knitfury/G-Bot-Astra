// Playwright forces Chromium's plaintext password store. Linux smoke tests must
// instead use a real Secret Service; production explicitly rejects basic_text.
const { app } = require("electron");
app.commandLine.removeSwitch("password-store");
app.commandLine.removeSwitch("use-mock-keychain");
app.commandLine.appendSwitch("password-store", "gnome-libsecret");

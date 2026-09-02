const { app, BrowserWindow } = require("electron");

function create() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "E1 Orga",
    backgroundColor: "#0B0D12",
    webPreferences: { contextIsolation: true },
  });
  win.loadURL("https://e1direktvertrieb.de/portal");
}

app.whenReady().then(create);
app.on("window-all-closed", () => app.quit());

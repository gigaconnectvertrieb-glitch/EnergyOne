const { app, BrowserWindow } = require("electron");

function create() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: "E1 Vertrieb",
    backgroundColor: "#0B0D12",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL("https://e1direktvertrieb.de/software");
}

app.whenReady().then(create);
app.on("window-all-closed", () => app.quit());

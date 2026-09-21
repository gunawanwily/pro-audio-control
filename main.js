const {app,BrowserWindow,ipcMain}=require("electron");
const path=require("path");
function createWindow(){
  const win=new BrowserWindow({width:1500,height:930,minWidth:1180,minHeight:720,backgroundColor:"#03070d",autoHideMenuBar:true,titleBarStyle:"default",webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.loadFile(path.join(__dirname,"index.html"));
}
ipcMain.on("window:minimize",event=>BrowserWindow.fromWebContents(event.sender)?.minimize());
ipcMain.on("window:toggle-maximize",event=>{const w=BrowserWindow.fromWebContents(event.sender);if(!w)return;w.isMaximized()?w.unmaximize():w.maximize();});
ipcMain.on("window:close",event=>BrowserWindow.fromWebContents(event.sender)?.close());
app.whenReady().then(()=>{createWindow();app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});

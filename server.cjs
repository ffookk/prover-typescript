const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const root = path.join(__dirname, "dist-web");
const contentTypes = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8", ".svg":"image/svg+xml", ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".ico":"image/x-icon" };
const sendFile = (filePath, res, requestedPath = filePath) => { const ext = path.extname(requestedPath).toLowerCase(); res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" }); fs.createReadStream(filePath).pipe(res); };
const serveFile = (filePath, res) => {
  fs.realpath(root, (rootError, realRoot) => {
    fs.realpath(filePath, (fileError, realFile) => {
      if (rootError || fileError) {
        res.writeHead(500, { "Content-Type":"text/plain; charset=utf-8" });
        res.end("Unable to resolve file");
        return;
      }
      if (!realFile.startsWith(realRoot + path.sep)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      sendFile(realFile, res, filePath);
    });
  });
};
http.createServer((req, res) => {
  const requestPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const relative = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const filePath = path.resolve(root, relative);
  if (!filePath.startsWith(root + path.sep)) { res.writeHead(403); res.end("Forbidden"); return; }
  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isFile()) return serveFile(filePath, res);
    const indexPath = path.join(root, "index.html");
    fs.stat(indexPath, (indexError, indexStats) => {
      if (indexError || !indexStats.isFile()) { res.writeHead(404, { "Content-Type":"text/plain; charset=utf-8" }); res.end("Web build not found. Run npm run build:web first."); return; }
      serveFile(indexPath, res);
    });
  });
}).listen(port, host, () => console.log(`Prover web server running at http://${host}:${port}`));

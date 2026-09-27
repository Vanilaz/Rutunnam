const fs = require("node:fs");
const required = ["public/index.html", "public/app.js", "public/styles.css", "public/manifest.webmanifest", "api/water.js", "api/flood.js"];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
console.log("Static Vercel project ready");

if (process.env.PRE_INSTALL == "1" || process.platform == "win32") {
  console.log("skipping preinstall");
} else {
  const fs = require("fs");
  const { execSync } = require("child_process");

  fs.readdirSync("./apps").forEach((app) => {
    execSync(`npm run app:configure --function-app=${app}`);
  });

  try {
    execSync("LICENSE_KEY=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 node node_modules/geoip-lite/scripts/updatedb.js", { stdio: 'inherit' });
  } catch {
    console.error('geoip db fetch failed');
  }
}

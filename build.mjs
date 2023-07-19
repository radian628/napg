import * as esbuild from "esbuild";
import { exec } from "child_process";

console.log("Client build script ran with ", process.argv);

const isDev = process.argv.includes("dev");

if (isDev) {
  console.log("Building for development.");
} else {
  console.log("Building for production.");
}

exec("npx tsc --watch");

// actually build
let ctx = await esbuild.context({
  entryPoints: ["src/index.ts"],
  outdir: "dist",
  plugins: [
    {
      name: "build-notify",
      setup(build) {
        let time = Date.now();
        build.onStart(() => {
          time = Date.now();
          console.log("Build started!");
        });
        build.onEnd(() => {
          console.log(`Build ended! (took ${Date.now() - time}ms)`);
        });
      },
    },
  ],
  sourcemap: isDev,
  format: "esm",
});

ctx.watch();

console.log("Watching for changes...");

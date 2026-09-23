import { build } from "esbuild";
await build({entryPoints:["desktop/main.ts"],outfile:"desktop-dist/main.cjs",bundle:true,platform:"node",format:"cjs",packages:"external",sourcemap:true});
await build({entryPoints:["desktop/preload.ts"],outfile:"desktop-dist/preload.cjs",bundle:true,platform:"node",format:"cjs",external:["electron"]});
console.log("Desktop main and sandboxed preload compiled.");

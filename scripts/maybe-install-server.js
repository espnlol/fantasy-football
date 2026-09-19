// This repo's root is a Vite frontend that shares a package.json with a separate server/ backend
// (see README's "Split deployment" section). A plain local `npm install` should set up both, but a
// frontend-only build on Vercel has no use for server/'s dependencies (Express, csv-parse, ...) —
// skip them there so the build doesn't waste time installing packages it'll never touch.
if (!process.env.VERCEL) {
  require('node:child_process').execSync('npm install --prefix server', { stdio: 'inherit' });
}

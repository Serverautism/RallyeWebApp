import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { datenBauen, ergebnisAusgeben } from './scripts/daten-bauen.mjs';

// Baut die Daten aus daten/ beim Start von "npm run dev" und bei jeder Änderung neu.
// Bei "npm run build" bricht der Build ab, wenn die Daten Fehler enthalten.
function datenPlugin() {
  let istDev = false;
  const bauen = (server) => {
    const erg = datenBauen();
    console.log('\nRallye-Daten:');
    ergebnisAusgeben(erg);
    console.log('');
    if (!erg.ok && server) {
      server.ws.send({
        type: 'error',
        err: { message: `Fehler in den Daten (daten/):\n\n${erg.fehler.join('\n')}`, stack: '', plugin: 'rallye-daten' },
      });
    }
    return erg;
  };
  return {
    name: 'rallye-daten',
    configResolved(config) {
      istDev = config.command === 'serve';
    },
    buildStart() {
      if (istDev) return;
      const erg = bauen(null);
      if (!erg.ok) this.error('Die Daten in daten/ enthalten Fehler (siehe oben). Build abgebrochen.');
    },
    configureServer(server) {
      bauen(server);
      // Die erzeugten Daten selbst ausliefern: Vite merkt sich die Dateien in public/ beim Start
      // und würde neu erzeugte Dateien (neue Versionskennung im Namen) sonst nicht finden.
      const ausgabe = path.resolve('public', 'daten');
      const TYPEN = {
        '.json': 'application/json; charset=utf-8',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
      };
      server.middlewares.use((req, res, next) => {
        let pfad;
        try {
          pfad = decodeURIComponent((req.url || '').split('?')[0]);
        } catch {
          return next();
        }
        if (!pfad.startsWith('/daten/')) return next();
        const datei = path.resolve(ausgabe, pfad.slice('/daten/'.length));
        if (!datei.startsWith(ausgabe + path.sep) || !fs.existsSync(datei) || !fs.statSync(datei).isFile()) {
          res.statusCode = 404;
          res.end('Nicht gefunden');
          return;
        }
        res.setHeader('Content-Type', TYPEN[path.extname(datei).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        fs.createReadStream(datei).pipe(res);
      });
      const ordner = path.resolve('daten');
      server.watcher.add(ordner);
      let timer = null;
      server.watcher.on('all', (_ereignis, datei) => {
        if (datei !== ordner && !datei.startsWith(ordner + path.sep)) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          const erg = bauen(server);
          if (erg.ok) server.ws.send({ type: 'full-reload' });
        }, 250);
      });
    },
  };
}

// Erzeugt nach dem Build dist/sw.js mit der Liste aller App-Dateien (für den Offline-Betrieb).
function serviceWorkerPlugin() {
  let ausgabe = '';
  return {
    name: 'rallye-service-worker',
    apply: 'build',
    configResolved(config) {
      ausgabe = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const dateien = [];
      const sammeln = (ordner, rel = '') => {
        for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
          if (eintrag.name.startsWith('.')) continue; // z. B. .htaccess – vom Server gesperrt, nicht vorladen
          const r = rel ? `${rel}/${eintrag.name}` : eintrag.name;
          if (eintrag.isDirectory()) {
            if (r === 'daten') continue; // Daten verwaltet die App selbst (eigene Versionen)
            sammeln(path.join(ordner, eintrag.name), r);
          } else if (r !== 'sw.js' && !r.endsWith('.map') && !r.endsWith('.woff')) {
            // .woff wird nicht vorgeladen: alle Browser mit Service Worker nutzen .woff2
            dateien.push(r);
          }
        }
      };
      sammeln(ausgabe);
      dateien.sort();
      const h = crypto.createHash('sha256');
      for (const d of dateien) h.update(d).update(fs.readFileSync(path.join(ausgabe, d)));
      const version = h.digest('hex').slice(0, 12);
      const vorlage = fs.readFileSync(path.resolve('src/sw.js'), 'utf8');
      const sw = vorlage.replace("'__VERSION__'", JSON.stringify(version)).replace('[/*__DATEIEN__*/]', JSON.stringify(dateien));
      fs.writeFileSync(path.join(ausgabe, 'sw.js'), sw);
      console.log(`Service Worker: ${dateien.length} Dateien für den Offline-Betrieb (Version ${version})`);
    },
  };
}

export default defineConfig({
  // Relative Pfade: läuft auf GitHub Pages (Unterordner), Strato oder jedem anderen Webspace.
  base: './',
  plugins: [datenPlugin(), serviceWorkerPlugin()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    sourcemap: false,
  },
  server: {
    host: true,
  },
});

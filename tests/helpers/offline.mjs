// Bloqueia tráfego acidental inclusive quando credenciais existirem no ambiente.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
const deny = () => { throw new Error('Rede proibida nos testes offline'); };
globalThis.fetch = deny;
http.request = http.get = https.request = https.get = net.connect = net.createConnection = tls.connect = deny;
for (const key of Object.keys(process.env)) {
  if (/^(STEAM_|FIREBASE_|VITE_FIREBASE_|GOOGLE_APPLICATION_CREDENTIALS|WALLPAPER_SYNC_AUTHORIZATION)/.test(key)) delete process.env[key];
}

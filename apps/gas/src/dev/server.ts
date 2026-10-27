import { createServer } from 'node:http';
import { API_VERSION } from '@mqi/shared';

const PORT = Number(process.env.PORT ?? 8787);

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, apiVersion: API_VERSION }));
    return;
  }
  res.writeHead(404).end();
}).listen(PORT, () => console.log(`MQI dev API on http://localhost:${PORT}`));

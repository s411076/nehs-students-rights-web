import { createServer } from 'node:net';
import { once } from 'node:events';

async function main() {
  const servers = [createServer(), createServer()];
  for (const server of servers) {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
  }
  process.stdout.write(servers.map(server => server.address().port).join(','));
  await Promise.all(servers.map(server => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))));
}
void main();

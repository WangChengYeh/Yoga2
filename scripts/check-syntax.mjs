import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const directory of ['src', 'scripts']) {
  for (const name of readdirSync(directory).filter((file) => /\.(?:m?js)$/.test(file))) {
    const result = spawnSync(process.execPath, ['--check', `${directory}/${name}`], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log('All application and build scripts passed syntax checks.');

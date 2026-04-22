const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const android = path.join(root, 'android');
const ios = path.join(root, 'ios');
const dist = path.join(root, 'dist-app');

for (const dir of [android, ios, dist]) {
  fs.mkdirSync(dir, { recursive: true });
}

const readme = `Bloomie app shell folders are prepared.\n\nRun:\n- npm install\n- npm run app:android:sync\n- npm run app:ios:sync\n- npm run app:desktop\n`;

fs.writeFileSync(path.join(dist, 'README.txt'), readme);
console.log('Bloomie app shell prepared at:');
console.log('- ' + android);
console.log('- ' + ios);
console.log('- ' + dist);

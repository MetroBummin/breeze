import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const expected = {
  iphone: {width: 1320, height: 2868},
  ipad: {width: 2064, height: 2752},
};
const root = new URL('.', import.meta.url);

function chunks(buf) {
  if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('PNG signature');
  const found = [];
  let offset = 8;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    found.push(type);
    if (type === 'IEND') return found;
    offset += 12 + length;
  }
  throw new Error('truncated PNG');
}

let count = 0;
for (const [device, size] of Object.entries(expected)) {
  const dir = new URL(device + '/', root);
  const files = readdirSync(dir).filter(name => name.endsWith('.png')).sort();
  if (!files.length) throw new Error(`${device} has no screenshots`);
  for (const name of files) {
    const buf = readFileSync(join(dir.pathname, name));
    const types = chunks(buf);
    if (types[0] !== 'IHDR') throw new Error(`${name} missing IHDR`);
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    const depth = buf[24];
    const color = buf[25];
    if (width !== size.width || height !== size.height) {
      throw new Error(`${device}/${name} is ${width}x${height}, expected ${size.width}x${size.height}`);
    }
    if (depth !== 8 || color !== 2) throw new Error(`${device}/${name} is depth ${depth} color type ${color}, expected 8-bit RGB`);
    if (types.includes('tRNS')) throw new Error(`${device}/${name} has a transparency chunk`);
    count += 1;
    console.log(`${device}/${name} ${width}x${height} RGB`);
  }
}
console.log(`ok ${count}`);

import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import {
  buildStoredZip,
  crc32,
  extractZipEntry,
  guessFolderRole,
  parseZipEntries,
} from "../lib/local-zip.mjs";

const enc = new TextEncoder();

function w16(out, offset, value) {
  out[offset] = value & 255;
  out[offset + 1] = (value >>> 8) & 255;
}
function w32(out, offset, value) {
  out[offset] = value & 255;
  out[offset + 1] = (value >>> 8) & 255;
  out[offset + 2] = (value >>> 16) & 255;
  out[offset + 3] = (value >>> 24) & 255;
}

function buildDeflatedZip(path, plain) {
  const name = enc.encode(path);
  const data = new Uint8Array(plain);
  const compressed = new Uint8Array(deflateRawSync(data));
  const crc = crc32(data);

  const local = new Uint8Array(30 + name.length + compressed.length);
  w32(local, 0, 0x04034b50);
  w16(local, 4, 20);
  w16(local, 6, 0x0800);
  w16(local, 8, 8);
  w32(local, 14, crc);
  w32(local, 18, compressed.length);
  w32(local, 22, data.length);
  w16(local, 26, name.length);
  local.set(name, 30);
  local.set(compressed, 30 + name.length);

  const central = new Uint8Array(46 + name.length);
  w32(central, 0, 0x02014b50);
  w16(central, 4, 20);
  w16(central, 6, 20);
  w16(central, 8, 0x0800);
  w16(central, 10, 8);
  w32(central, 16, crc);
  w32(central, 20, compressed.length);
  w32(central, 24, data.length);
  w16(central, 28, name.length);
  w32(central, 42, 0);
  central.set(name, 46);

  const end = new Uint8Array(22);
  w32(end, 0, 0x06054b50);
  w16(end, 8, 1);
  w16(end, 10, 1);
  w32(end, 12, central.length);
  w32(end, 16, local.length);

  const zip = new Uint8Array(local.length + central.length + end.length);
  zip.set(local, 0);
  zip.set(central, local.length);
  zip.set(end, local.length + central.length);
  return zip;
}

test("stored ZIP round-trips UTF-8 VVIC folder names", async () => {
  const source = [
    { path: "01_메인_GIF용/01_商品主图_1.jpg", data: Uint8Array.from([1, 2, 3]) },
    { path: "02_상세이미지/01_商品详情图_1.jpg", data: Uint8Array.from([4, 5, 6, 7]) },
  ];
  const zip = buildStoredZip(source);
  const entries = parseZipEntries(zip);
  assert.deepEqual(
    entries.map((entry) => entry.name),
    source.map((file) => file.path),
  );
  assert.deepEqual(
    Array.from(await extractZipEntry(zip, entries[1])),
    [4, 5, 6, 7],
  );
});

test("deflate ZIP entries used by VVIC can be extracted locally", async () => {
  const zip = buildDeflatedZip(
    "商品详情页图/商品详情页图_1.jpg",
    Uint8Array.from([9, 8, 7, 6, 5]),
  );
  const [entry] = parseZipEntries(zip);
  assert.equal(entry.method, 8);
  assert.equal(entry.folder, "商品详情页图");
  assert.deepEqual(Array.from(await extractZipEntry(zip, entry)), [9, 8, 7, 6, 5]);
});

test("folder role guesses are suggestions for common VVIC names", () => {
  assert.equal(guessFolderRole("商品主图"), "main");
  assert.equal(guessFolderRole("商品详情页图"), "detail");
  assert.equal(guessFolderRole("商品详情图"), "detail");
  assert.equal(guessFolderRole("颜色属性图"), "ignore");
  assert.equal(guessFolderRole("尺码图"), "size");
  assert.equal(guessFolderRole("공급처A"), "");
});

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8");

const IMAGE_EXT = /\.(?:jpe?g|png|webp|gif)$/i;

function viewOf(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}

function u16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes, offset) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function write16(out, offset, value) {
  out[offset] = value & 255;
  out[offset + 1] = (value >>> 8) & 255;
}

function write32(out, offset, value) {
  out[offset] = value & 255;
  out[offset + 1] = (value >>> 8) & 255;
  out[offset + 2] = (value >>> 16) & 255;
  out[offset + 3] = (value >>> 24) & 255;
}

function findEocd(bytes) {
  const min = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= min; i -= 1) {
    if (u32(bytes, i) === 0x06054b50) return i;
  }
  throw new Error("ZIP 파일 구조를 확인하지 못했습니다.");
}

export function parseZipEntries(input) {
  const bytes = viewOf(input);
  const eocd = findEocd(bytes);
  const count = u16(bytes, eocd + 10);
  let offset = u32(bytes, eocd + 16);
  const entries = [];

  for (let index = 0; index < count; index += 1) {
    if (u32(bytes, offset) !== 0x02014b50) {
      throw new Error("ZIP 중앙 디렉터리를 읽지 못했습니다.");
    }
    const flags = u16(bytes, offset + 8);
    const method = u16(bytes, offset + 10);
    const crc = u32(bytes, offset + 16);
    const compressedSize = u32(bytes, offset + 20);
    const size = u32(bytes, offset + 24);
    const nameLength = u16(bytes, offset + 28);
    const extraLength = u16(bytes, offset + 30);
    const commentLength = u16(bytes, offset + 32);
    const localOffset = u32(bytes, offset + 42);
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    const name = decoder.decode(nameBytes).replace(/\\/g, "/");
    const parts = name.split("/").filter(Boolean);
    const isDirectory = name.endsWith("/");
    entries.push({
      name,
      folder: parts.length > 1 ? parts[0] : "(루트 파일)",
      fileName: parts.at(-1) || "",
      flags,
      method,
      crc,
      compressedSize,
      size,
      localOffset,
      isDirectory,
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(
    new DecompressionStream("deflate-raw"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function extractZipEntry(input, entry) {
  const bytes = viewOf(input);
  const offset = entry.localOffset;
  if (u32(bytes, offset) !== 0x04034b50) {
    throw new Error("ZIP 이미지 위치를 읽지 못했습니다.");
  }
  const nameLength = u16(bytes, offset + 26);
  const extraLength = u16(bytes, offset + 28);
  const start = offset + 30 + nameLength + extraLength;
  const compressed = bytes.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return compressed.slice();
  if (entry.method === 8) return inflateRaw(compressed);
  throw new Error(`지원하지 않는 ZIP 압축 방식입니다. (방식 ${entry.method})`);
}

export async function readZipImages(input) {
  const bytes = viewOf(input);
  const entries = parseZipEntries(bytes).filter(
    (entry) => !entry.isDirectory && IMAGE_EXT.test(entry.fileName),
  );
  const result = [];
  for (const entry of entries) {
    result.push({
      ...entry,
      data: await extractZipEntry(bytes, entry),
    });
  }
  return result;
}

export function guessFolderRole(name) {
  const value = String(name || "").toLowerCase();
  if (/主图|메인|대표|main|thumbnail/.test(value)) return "main";
  if (/详情|상세|detail/.test(value)) return "detail";
  if (/尺码|사이즈|size/.test(value)) return "size";
  if (/颜色|색상|属性|option|옵션/.test(value)) return "ignore";
  return "";
}

export function roleLabel(role) {
  return {
    main: "메인·GIF용",
    detail: "상세이미지",
    size: "사이즈 참고",
    ignore: "무시",
  }[role] || "확인 필요";
}

export function mimeFromName(name) {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

let crcTable;
function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

export function crc32(input) {
  const bytes = viewOf(input);
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function buildStoredZip(files) {
  const prepared = files.map((file) => ({
    path: String(file.path).replace(/^\/+/, "").replace(/\\/g, "/"),
    data: viewOf(file.data),
  }));
  const locals = [];
  const centrals = [];
  let localOffset = 0;

  for (const file of prepared) {
    const name = encoder.encode(file.path);
    const crc = crc32(file.data);
    const local = new Uint8Array(30 + name.length + file.data.length);
    write32(local, 0, 0x04034b50);
    write16(local, 4, 20);
    write16(local, 6, 0x0800);
    write16(local, 8, 0);
    write16(local, 10, 0);
    write16(local, 12, 0x21);
    write32(local, 14, crc);
    write32(local, 18, file.data.length);
    write32(local, 22, file.data.length);
    write16(local, 26, name.length);
    write16(local, 28, 0);
    local.set(name, 30);
    local.set(file.data, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    write32(central, 0, 0x02014b50);
    write16(central, 4, 20);
    write16(central, 6, 20);
    write16(central, 8, 0x0800);
    write16(central, 10, 0);
    write16(central, 12, 0);
    write16(central, 14, 0x21);
    write32(central, 16, crc);
    write32(central, 20, file.data.length);
    write32(central, 24, file.data.length);
    write16(central, 28, name.length);
    write16(central, 30, 0);
    write16(central, 32, 0);
    write16(central, 34, 0);
    write16(central, 36, 0);
    write32(central, 38, 0);
    write32(central, 42, localOffset);
    central.set(name, 46);
    centrals.push(central);
    localOffset += local.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array(22);
  write32(eocd, 0, 0x06054b50);
  write16(eocd, 4, 0);
  write16(eocd, 6, 0);
  write16(eocd, 8, prepared.length);
  write16(eocd, 10, prepared.length);
  write32(eocd, 12, centralSize);
  write32(eocd, 16, localOffset);
  write16(eocd, 20, 0);

  const total = localOffset + centralSize + eocd.length;
  const output = new Uint8Array(total);
  let cursor = 0;
  for (const part of locals) {
    output.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centrals) {
    output.set(part, cursor);
    cursor += part.length;
  }
  output.set(eocd, cursor);
  return output;
}

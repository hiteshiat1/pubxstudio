// -------------------------------------------------------------
// Pure TypeScript Client-side ZIP Compiler (No External Dependencies)
// Compliant with standard ZIP PK format in Store mode
// -------------------------------------------------------------

function makeCRCTable(): Uint32Array {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
  }
  return crcTable;
}

const crcTable = makeCRCTable();

function crc32(buf: Uint8Array): number {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

export class ZipArchive {
  private files: Array<{
    name: string;
    data: Uint8Array;
  }> = [];

  addFile(name: string, content: string | Uint8Array) {
    const data = typeof content === "string" ? new TextEncoder().encode(content) : content;
    // Standardize path slashes
    const normalizedName = name.replace(/\\/g, "/");
    this.files.push({ name: normalizedName, data });
  }

  export(): Uint8Array {
    let currentOffset = 0;
    const fileHeaders: Array<{
      nameBytes: Uint8Array;
      crc: number;
      size: number;
      offset: number;
    }> = [];

    // Calculate LFH offsets and prepare headers
    for (const f of this.files) {
      const nameBytes = new TextEncoder().encode(f.name);
      fileHeaders.push({
        nameBytes,
        crc: crc32(f.data),
        size: f.data.length,
        offset: currentOffset,
      });

      // LFH structure size = 30 + filename length + data length
      currentOffset += 30 + nameBytes.length + f.data.length;
    }

    const startOfCentralDir = currentOffset;
    let centralDirSize = 0;

    for (const h of fileHeaders) {
      // CDFH structure size = 46 + filename length
      centralDirSize += 46 + h.nameBytes.length;
    }

    // EOCD structure size = 22
    const totalSize = startOfCentralDir + centralDirSize + 22;

    const buffer = new Uint8Array(totalSize);
    const view = new DataView(buffer.buffer);
    let ptr = 0;

    // 1. Write Local File Headers (LFH) & Data
    for (let i = 0; i < this.files.length; i++) {
      const f = this.files[i];
      const h = fileHeaders[i];

      // LFH Signature (PK\x03\x04)
      view.setUint32(ptr, 0x04034b50, true); ptr += 4;
      view.setUint16(ptr, 10, true); ptr += 2; // version needed to extract (1.0)
      view.setUint16(ptr, 0, true); ptr += 2; // general purpose bit flag (none)
      view.setUint16(ptr, 0, true); ptr += 2; // compression method (0 = Store)
      view.setUint16(ptr, 0x3a00, true); ptr += 2; // last mod file time (12:00:00)
      view.setUint16(ptr, 0x5821, true); ptr += 2; // last mod file date (2024-01-01)
      view.setUint32(ptr, h.crc, true); ptr += 4; // crc-32
      view.setUint32(ptr, h.size, true); ptr += 4; // compressed size
      view.setUint32(ptr, h.size, true); ptr += 4; // uncompressed size
      view.setUint16(ptr, h.nameBytes.length, true); ptr += 2; // file name length
      view.setUint16(ptr, 0, true); ptr += 2; // extra field length

      // Write Name & File Data
      buffer.set(h.nameBytes, ptr); ptr += h.nameBytes.length;
      buffer.set(f.data, ptr); ptr += f.data.length;
    }

    // 2. Write Central Directory File Headers (CDFH)
    for (let i = 0; i < this.files.length; i++) {
      const h = fileHeaders[i];

      // CDFH Signature (PK\x01\x02)
      view.setUint32(ptr, 0x02014b50, true); ptr += 4;
      view.setUint16(ptr, 20, true); ptr += 2; // version made by (2.0)
      view.setUint16(ptr, 10, true); ptr += 2; // version needed to extract (1.0)
      view.setUint16(ptr, 0, true); ptr += 2; // general purpose flags
      view.setUint16(ptr, 0, true); ptr += 2; // compression method (Store)
      view.setUint16(ptr, 0x3a00, true); ptr += 2; // last mod time
      view.setUint16(ptr, 0x5821, true); ptr += 2; // last mod date
      view.setUint32(ptr, h.crc, true); ptr += 4; // crc-32
      view.setUint32(ptr, h.size, true); ptr += 4; // compressed size
      view.setUint32(ptr, h.size, true); ptr += 4; // uncompressed size
      view.setUint16(ptr, h.nameBytes.length, true); ptr += 2; // file name length
      view.setUint16(ptr, 0, true); ptr += 2; // extra field length
      view.setUint16(ptr, 0, true); ptr += 2; // file comment length
      view.setUint16(ptr, 0, true); ptr += 2; // disk number start
      view.setUint16(ptr, 0, true); ptr += 2; // internal file attributes
      view.setUint32(ptr, 0, true); ptr += 4; // external file attributes
      view.setUint32(ptr, h.offset, true); ptr += 4; // relative offset of local header

      // Write Name
      buffer.set(h.nameBytes, ptr); ptr += h.nameBytes.length;
    }

    // 3. Write End of Central Directory (EOCD)
    // EOCD Signature (PK\x05\x06)
    view.setUint32(ptr, 0x06054b50, true); ptr += 4;
    view.setUint16(ptr, 0, true); ptr += 2; // number of this disk
    view.setUint16(ptr, 0, true); ptr += 2; // disk where central directory starts
    view.setUint16(ptr, this.files.length, true); ptr += 2; // number of central directory records on this disk
    view.setUint16(ptr, this.files.length, true); ptr += 2; // total number of central directory records
    view.setUint32(ptr, centralDirSize, true); ptr += 4; // size of central directory
    view.setUint32(ptr, startOfCentralDir, true); ptr += 4; // offset of central directory start relative to archive
    view.setUint16(ptr, 0, true); ptr += 2; // comment length

    return buffer;
  }
}

export function downloadZip(filename: string, files: Record<string, string | Uint8Array>) {
  const archive = new ZipArchive();
  for (const [path, content] of Object.entries(files)) {
    archive.addFile(path, content);
  }
  const bytes = archive.export();
  const blob = new Blob([bytes as any], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".zip") ? filename : `${filename}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

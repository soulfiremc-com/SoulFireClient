import { open } from "node:fs/promises";

const END_OF_CENTRAL_DIRECTORY = 0x06_05_4b_50;
const ZIP64_END_OF_CENTRAL_DIRECTORY = 0x06_06_4b_50;
const ZIP64_LOCATOR = 0x07_06_4b_50;
const CENTRAL_DIRECTORY_ENTRY = 0x02_01_4b_50;
const END_RECORD_SIZE = 22;
const ZIP64_LOCATOR_SIZE = 20;
const ZIP64_END_RECORD_SIZE = 56;
const MAX_COMMENT_SIZE = 0xff_ff;
// Large server jars have central directories of a few megabytes.
const MAX_CENTRAL_DIRECTORY_SIZE = 256 * 1024 * 1024;

/**
 * Reports whether a file is a zip archive with a `META-INF/MANIFEST.MF` entry.
 * Reads only the central directory at the end of the file, so a large jar does
 * not have to be loaded into memory.
 */
export async function hasJarManifest(filePath: string): Promise<boolean> {
  const file = await open(filePath, "r");
  try {
    const read = async (position: number, length: number) => {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await file.read(buffer, 0, length, position);
      return buffer.subarray(0, bytesRead);
    };
    const { size } = await file.stat();
    if (size < END_RECORD_SIZE) return false;

    const tailStart = Math.max(0, size - END_RECORD_SIZE - MAX_COMMENT_SIZE);
    const tail = await read(tailStart, size - tailStart);
    let endOffset = -1;
    for (let index = tail.length - END_RECORD_SIZE; index >= 0; index--) {
      if (tail.readUInt32LE(index) === END_OF_CENTRAL_DIRECTORY) {
        endOffset = index;
        break;
      }
    }
    if (endOffset === -1) return false;

    let directorySize = tail.readUInt32LE(endOffset + 12);
    let directoryOffset = tail.readUInt32LE(endOffset + 16);
    if (
      directorySize === 0xff_ff_ff_ff ||
      directoryOffset === 0xff_ff_ff_ff ||
      tail.readUInt16LE(endOffset + 10) === 0xff_ff
    ) {
      const locatorOffset = endOffset - ZIP64_LOCATOR_SIZE;
      if (
        locatorOffset < 0 ||
        tail.readUInt32LE(locatorOffset) !== ZIP64_LOCATOR
      )
        return false;
      const recordPosition = Number(tail.readBigUInt64LE(locatorOffset + 8));
      const record = await read(recordPosition, ZIP64_END_RECORD_SIZE);
      if (
        record.length < ZIP64_END_RECORD_SIZE ||
        record.readUInt32LE(0) !== ZIP64_END_OF_CENTRAL_DIRECTORY
      )
        return false;
      directorySize = Number(record.readBigUInt64LE(40));
      directoryOffset = Number(record.readBigUInt64LE(48));
    }
    if (
      directorySize > MAX_CENTRAL_DIRECTORY_SIZE ||
      directoryOffset + directorySize > size
    )
      return false;

    const directory = await read(directoryOffset, directorySize);
    let position = 0;
    while (position + 46 <= directory.length) {
      if (directory.readUInt32LE(position) !== CENTRAL_DIRECTORY_ENTRY)
        return false;
      const nameLength = directory.readUInt16LE(position + 28);
      const extraLength = directory.readUInt16LE(position + 30);
      const commentLength = directory.readUInt16LE(position + 32);
      const name = directory
        .subarray(position + 46, position + 46 + nameLength)
        .toString("utf8");
      if (name.toUpperCase() === "META-INF/MANIFEST.MF") return true;
      position += 46 + nameLength + extraLength + commentLength;
    }
    return false;
  } finally {
    await file.close();
  }
}

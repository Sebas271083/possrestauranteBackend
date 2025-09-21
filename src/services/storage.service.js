import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import crypto from "node:crypto";

const DRIVER = process.env.FILES_DRIVER || "local";

// --- LOCAL ---
async function ensureDir(dir) { await fs.mkdir(dir, { recursive: true }); }

async function saveLocal({ buf, keyBase }) {
  const uploadDir = process.env.UPLOAD_DIR || "./uploads";
  const baseDir = path.join(uploadDir, "products");
  await ensureDir(baseDir);

  const key = `${keyBase}.jpg`;                 // guardamos en JPG
  const key512 = `${keyBase}_w512.jpg`;
  const key256 = `${keyBase}_w256.jpg`;

  const p0 = path.join(baseDir, key);
  const p512 = path.join(baseDir, key512);
  const p256 = path.join(baseDir, key256);

  // original re-encoded a jpg (calidad 85)
  await sharp(buf).jpeg({ quality: 85 }).toFile(p0);
  await sharp(buf).resize({ width: 512 }).jpeg({ quality: 85 }).toFile(p512);
  await sharp(buf).resize({ width: 256 }).jpeg({ quality: 85 }).toFile(p256);

  const base = process.env.UPLOAD_BASE_URL || "http://localhost:4000/uploads";
  return {
    key,
    url: `${base}/products/${key512}`,  // usamos 512 como principal
    thumb: `${base}/products/${key256}`,
    allKeys: [key, key512, key256]
  };
}

// --- S3 ---
import { S3Client, PutObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const s3 = DRIVER === "s3" ? new S3Client({ region: process.env.AWS_REGION }) : null;

async function putS3(key, buf, contentType="image/jpeg") {
  const Bucket = process.env.AWS_S3_BUCKET;
  await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: buf, ContentType: contentType, CacheControl: "public, max-age=604800" }));
}

async function saveS3({ buf, keyBase }) {
  const prefix = process.env.AWS_S3_PREFIX || "products/";
  const k0   = `${prefix}${keyBase}.jpg`;
  const k512 = `${prefix}${keyBase}_w512.jpg`;
  const k256 = `${prefix}${keyBase}_w256.jpg`;

  const b0   = await sharp(buf).jpeg({ quality: 85 }).toBuffer();
  const b512 = await sharp(buf).resize({ width: 512 }).jpeg({ quality: 85 }).toBuffer();
  const b256 = await sharp(buf).resize({ width: 256 }).jpeg({ quality: 85 }).toBuffer();

  await Promise.all([
    putS3(k0, b0),
    putS3(k512, b512),
    putS3(k256, b256)
  ]);

  const cdn = process.env.PUBLIC_CDN_BASE; // ej. CloudFront
  const baseUrl = cdn?.replace(/\/+$/,"") || `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com`;
  return {
    key: k0,
    url: `${baseUrl}/${k512}`,
    thumb: `${baseUrl}/${k256}`,
    allKeys: [k0,k512,k256]
  };
}

export async function storeProductImage(buffer) {
  // validar tipo y tamaño
  const max = Number(process.env.UPLOAD_MAX_MB || 5) * 1024 * 1024;
  if (buffer.length > max) throw new Error("file_too_big");

  const info = await fileTypeFromBuffer(buffer);
  if (!info || !["image/jpeg","image/png","image/webp"].includes(info.mime)) {
    throw new Error("unsupported_type");
  }

  const keyBase = crypto.randomBytes(16).toString("hex");

  if (DRIVER === "s3") return saveS3({ buf: buffer, keyBase });
  return saveLocal({ buf: buffer, keyBase });
}

export async function deleteProductImages(keys = []) {
  if (!keys.length) return;

  if (DRIVER === "s3") {
    const Bucket = process.env.AWS_S3_BUCKET;
    const Objects = keys.map(Key => ({ Key }));
    await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects } }));
    return;
  }

  // local
  const uploadDir = process.env.UPLOAD_DIR || "./uploads";
  await Promise.all(keys.map(async k => {
    const p = path.join(uploadDir, "products", k);
    try { await fs.unlink(p); } catch {}
  }));
}

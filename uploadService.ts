import { uploadMedia, attachImageToProduct } from './shopifyService';
import { TaskQueue } from './taskQueue';
import fetch from 'node-fetch';
import * as fs from 'fs';
import path from 'path';
import sharp from 'sharp';

// Simple logger function.
function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// Helper: Check if input is a valid URL.
function isValidUrl(input: string): boolean {
  try {
    new URL(input);
    return true;
  } catch {
    return false;
  }
}

// Helper: Check if input is a base64-encoded image (data URI).
function isBase64Image(input: string): boolean {
  return input.startsWith("data:image/");
}

// Helper: Convert a base64 string (with optional data URI prefix) to a Buffer.
function base64ToBuffer(data: string): Buffer {
  const base64Data = data.includes(',') ? data.split(',')[1] : data;
  return Buffer.from(base64Data, 'base64');
}

/**
 * convertToJpeg:
 * Converts an image Buffer (any format) to JPEG format using sharp.
 */
async function convertToJpeg(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .jpeg({ quality: 80 })
    .toBuffer();
}

/**
 * processImageUpload:
 * - If the input is a base64 image, it decodes it, converts it to JPEG, and uploads it.
 * - Else if the input exists as a local file path, it reads the file, converts it to JPEG, and uploads it.
 * - Else if the input is a valid external URL, it verifies that the URL returns an image
 *   (by checking the content-type header), downloads the image, converts it to JPEG, and uploads it.
 * - Finally, it attaches the image to the product using Shopify's productCreateMedia mutation.
 */
export async function processImageUpload(input: string, productId: string, alt: string): Promise<void> {
  log(`Starting image upload process for product ${productId}...`);
  let resourceUrl: string | null = null;
  let jpegBuffer: Buffer;
  let filename: string;
  const mimeType = "image/jpeg";

  // Case 1: Input is a base64-encoded image.
  if (isBase64Image(input)) {
    log(`Input is a base64 image.`);
    const imageBuffer = base64ToBuffer(input);
    jpegBuffer = await convertToJpeg(imageBuffer);
    filename = `upload_${Date.now()}.jpg`;
    log(`Converted base64 image to JPEG. Uploading with filename: ${filename}...`);
    resourceUrl = await uploadMedia(jpegBuffer, filename, mimeType);
    log(`Staged upload complete, resourceUrl: ${resourceUrl}`);
  }
  // Case 2: Input is a local file path.
  else if (fs.existsSync(input)) {
    log(`Input is a local file path: ${input}`);
    const imageBuffer = fs.readFileSync(input);
    jpegBuffer = await convertToJpeg(imageBuffer);
    filename = path.basename(input, path.extname(input)) + ".jpg";
    log(`Read file from disk and converted to JPEG. Uploading with filename: ${filename}...`);
    resourceUrl = await uploadMedia(jpegBuffer, filename, mimeType);
    log(`Staged upload complete, resourceUrl: ${resourceUrl}`);
  }
  // Case 3: Input is a valid external URL.
  else if (isValidUrl(input)) {
    log(`Input is an external URL: ${input}`);
    // Use HEAD to check URL accessibility and content type.
    const headResponse = await fetch(input, { method: 'HEAD' });
    if (!headResponse.ok) {
      throw new Error(`URL not accessible: ${input}`);
    }
    const contentType = headResponse.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      throw new Error(`URL did not return an image. Content-Type: ${contentType}`);
    }
    log(`External URL verified as accessible and returns image content (Content-Type: ${contentType}).`);
    // Download the image from the URL.
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`Failed to download image from URL: ${input}`);
    }
    const imageBuffer = await response.buffer();
    jpegBuffer = await convertToJpeg(imageBuffer);
    filename = `upload_${Date.now()}.jpg`;
    log(`Downloaded and converted external image to JPEG. Uploading with filename: ${filename}...`);
    resourceUrl = await uploadMedia(jpegBuffer, filename, mimeType);
    log(`Staged upload complete, resourceUrl: ${resourceUrl}`);
  } else {
    throw new Error("Invalid input format. Must be a valid file path, URL, or base64-encoded image.");
  }

  if (!resourceUrl) {
    throw new Error("Failed to obtain resource URL for image upload.");
  }

  log(`Attaching image to product ${productId} with resourceUrl: ${resourceUrl}...`);
  const attached = await attachImageToProduct(resourceUrl, productId, alt);
  if (!attached) {
    throw new Error("Failed to attach image to product.");
  }
  log(`Image attached successfully to product ${productId}.`);
}

export const imageUploadQueue = new TaskQueue(3);

/**
 * enqueueImageUpload:
 * Wraps the processImageUpload function in a task with retry logic, then enqueues it.
 */
export async function enqueueImageUpload(input: string, productId: string, alt: string): Promise<void> {
  const task = async (): Promise<void> => {
    let attempts = 0;
    const maxAttempts = 2;
    while (attempts < maxAttempts) {
      try {
        attempts++;
        log(`Processing image upload for product ${productId} (attempt ${attempts})...`);
        await processImageUpload(input, productId, alt);
        return; // Success!
      } catch (err) {
        log(`Error processing image upload (attempt ${attempts}): ${err}`);
        if (attempts >= maxAttempts) {
          log(`Image upload failed after ${attempts} attempts. Discarding image.`);
          return;
        }
      }
    }
  };

  await imageUploadQueue.add(task);
}
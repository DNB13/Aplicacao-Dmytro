import fetch from 'node-fetch';
import { TaskQueue } from './taskQueue';
import { uploadMedia, attachImageToProduct } from './shopifyService';
import * as fs from 'fs';

// A simple logger
function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// Helper: Detect if input is a URL
function isValidUrl(input: string): boolean {
  try {
    new URL(input);
    return true;
  } catch {
    return false;
  }
}

// Helper: Detect if input is a base64 string (data URI)
function isBase64Image(input: string): boolean {
  return input.startsWith("data:image/");
}

// Helper: Convert base64 string to Buffer (strip data URI prefix)
function base64ToBuffer(data: string): Buffer {
  const base64Data = data.includes(',') ? data.split(',')[1] : data;
  return Buffer.from(base64Data, 'base64');
}

// Helper: Verify external URL accessibility
async function verifyUrl(url: string): Promise<boolean> {
  try {
    let response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) {
      // Fallback: try GET with a 3-second timeout.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      response = await fetch(url, { method: 'GET', signal: controller.signal });
      clearTimeout(timeoutId);
    }
    return response.ok;
  } catch (err) {
    log(`Error verifying URL ${url}: ${err}`);
    return false;
  }
}

/**
 * processImageUpload: Determines input type (URL or base64),
 * verifies external URL accessibility,
 * or if base64, converts to Buffer and calls uploadMedia to perform staged upload.
 * Then calls attachImageToProduct to attach the image to the product.
 */
export async function processImageUpload(input: string, productId: string, alt: string): Promise<void> {
  try {
    let resourceUrl: string | null = null;

    if (isValidUrl(input)) {
      log(`Input is a URL: ${input}`);
      const accessible = await verifyUrl(input);
      if (!accessible) {
        throw new Error(`URL not accessible: ${input}`);
      }
      // If it's an external URL, use it directly.
      resourceUrl = input;
    } else if (isBase64Image(input)) {
      log(`Input is a base64 image.`);
      const imageBuffer = base64ToBuffer(input);
      const filename = "upload_image.png";  // Ideally generate a unique filename
      const mimeType = "image/png";
      resourceUrl = await uploadMedia(imageBuffer, filename, mimeType);
    } else {
      throw new Error("Invalid input format. Must be a valid URL or a base64-encoded image.");
    }

    if (!resourceUrl) {
      throw new Error("Failed to obtain resource URL for image upload.");
    }

    const attached = await attachImageToProduct(resourceUrl, productId, alt);
    if (!attached) {
      throw new Error("Failed to attach image to product.");
    }
    log(`Image attached successfully to product ${productId}.`);
  } catch (error) {
    throw error;
  }
}

export const imageUploadQueue = new TaskQueue(3);

/**
 * enqueueImageUpload: Wraps the image upload process in a task, adding retry logic,
 * then enqueues the task for processing.
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
        return; // Success
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
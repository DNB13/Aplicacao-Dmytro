import fetch from 'node-fetch';
import { TaskQueue } from './taskQueue';
import * as fs from 'fs';

// A simple logger for our purposes
function log(message: string) {
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

// Helper: Convert base64 string to Buffer (stripping data URI prefix if present)
function base64ToBuffer(data: string): Buffer {
  const base64Data = data.includes(',') ? data.split(',')[1] : data;
  return Buffer.from(base64Data, 'base64');
}

// Helper: Verify external URL accessibility
async function verifyUrl(url: string): Promise<boolean> {
  try {
    let response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) {
      // Fallback: try a GET request with a short timeout
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

// Stub: Perform staged upload (for local or base64 images)
// In a real implementation, this function would call Shopify's stagedUploadsCreate mutation,
// then use the returned URL and parameters to perform an HTTP file upload.
// Here we simulate it by returning a dummy resource URL.
async function stagedUpload(imageBuffer: Buffer, filename: string, mimeType: string): Promise<string> {
  log(`Performing staged upload for ${filename} (${mimeType})...`);
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  // Return a simulated resource URL (in practice, use the response from Shopify)
  return `https://cdn.shopify.com/s/files/.../${filename}`;
}

// Stub: Call the productCreateMedia GraphQL mutation to attach the image to a product.
// In a real implementation, this function would perform an authenticated HTTP POST
// to Shopify's GraphQL endpoint using fetch (or similar) with the correct query and variables.
async function attachImageToProduct(resourceUrl: string, productId: string, alt: string): Promise<boolean> {
  log(`Attaching image to product ${productId} with resource URL ${resourceUrl}...`);
  // Simulate network delay and API processing
  await new Promise(resolve => setTimeout(resolve, 1000));
  // Simulate a successful attachment
  return true;
}

// Process an image upload task.
// This function detects the input type, verifies accessibility if needed,
// performs the staged upload if required, and then calls the product media mutation.
export async function processImageUpload(input: string, productId: string, alt: string): Promise<void> {
  try {
    let resourceUrl: string | null = null;

    if (isValidUrl(input)) {
      // Input is a URL – verify accessibility
      log(`Input is a URL: ${input}`);
      const accessible = await verifyUrl(input);
      if (!accessible) {
        throw new Error(`URL not accessible: ${input}`);
      }
      // Use external URL directly
      resourceUrl = input;
    } else if (isBase64Image(input)) {
      // Input is a base64 string – convert to buffer
      log(`Input is a base64 image.`);
      const imageBuffer = base64ToBuffer(input);
      // For demonstration, we set a filename and mimeType
      const filename = "upload_image.png";
      const mimeType = "image/png";
      resourceUrl = await stagedUpload(imageBuffer, filename, mimeType);
    } else {
      throw new Error("Invalid input format. Must be a valid URL or a base64-encoded image.");
    }

    // Ensure we have a resource URL at this point
    if (!resourceUrl) {
      throw new Error("Failed to obtain resource URL for image upload.");
    }

    // Now attach the image to the product using Shopify's GraphQL mutation (stubbed)
    const attached = await attachImageToProduct(resourceUrl, productId, alt);
    if (!attached) {
      throw new Error("Failed to attach image to product.");
    }
    log(`Image attached successfully to product ${productId}.`);
  } catch (error) {
    throw error;
  }
}

// Create a task queue instance with concurrency 3
export const imageUploadQueue = new TaskQueue(3);

// Function to add an image upload task with retry logic
export async function enqueueImageUpload(input: string, productId: string, alt: string): Promise<void> {
  // Define a task that will try the upload once, and if it fails, try one more time.
  const task = async (): Promise<void> => {
    let attempts = 0;
    const maxAttempts = 2;
    while (attempts < maxAttempts) {
      try {
        attempts++;
        log(`Processing image upload for product ${productId} (attempt ${attempts})...`);
        await processImageUpload(input, productId, alt);
        return; // success
      } catch (err) {
        log(`Error processing image upload (attempt ${attempts}): ${err}`);
        if (attempts >= maxAttempts) {
          // Log the failure for later review and exit the loop
          log(`Image upload failed after ${attempts} attempts. Discarding image.`);
          return;
        }
      }
    }
  };

  // Enqueue the task; the task queue returns a Promise that resolves when processed.
  await imageUploadQueue.add(task);
}
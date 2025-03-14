import fetch from 'node-fetch';
import FormData from 'form-data';
import dotenv from 'dotenv';
dotenv.config();

const accessToken = process.env.SHOPIFY_ACCESS_TOKEN as string;
const storeDomain = process.env.SHOPIFY_FLAG_STORE as string;

if (!accessToken || !storeDomain) {
  throw new Error('Missing Shopify configuration: accessToken or storeDomain is not defined');
}

interface StagedTarget {
  url: string;
  resourceUrl: string;
  parameters: { name: string; value: string }[];
}

interface StagedUploadsCreate {
  userErrors?: { field: string; message: string }[];
  stagedTargets?: StagedTarget[];
}

interface StagedUploadsResponse {
  data?: {
    stagedUploadsCreate?: StagedUploadsCreate;
  };
}

/**
 * uploadMedia: Calls the stagedUploadsCreate mutation,
 * then uploads the file using the returned URL/parameters,
 * and returns the resourceUrl that Shopify provides.
 */
export async function uploadMedia(
  imageBuffer: Buffer,
  filename: string,
  mimeType: string
): Promise<string> {
  const endpoint = `https://${storeDomain}/admin/api/2025-01/graphql.json`;
  const mutation = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  // Shopify expects fileSize as a string.
  const fileSize = imageBuffer.length.toString();
  const variables = {
    input: [{
      filename,
      mimeType,
      fileSize,
      httpMethod: "POST",
      resource: "IMAGE"
    }]
  };

  // Call Shopify's GraphQL endpoint to get the staged upload target.
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken
    },
    body: JSON.stringify({ query: mutation, variables })
  });
  
  const json = await response.json() as StagedUploadsResponse;
  console.log("Shopify stagedUploadsCreate response:", JSON.stringify(json, null, 2));

  if (json.data?.stagedUploadsCreate?.userErrors && json.data.stagedUploadsCreate.userErrors.length > 0) {
    throw new Error(`Staged upload error: ${JSON.stringify(json.data.stagedUploadsCreate.userErrors)}`);
  }
  
  if (!json.data || !json.data.stagedUploadsCreate || !json.data.stagedUploadsCreate.stagedTargets) {
    throw new Error('Invalid response from Shopify');
  }
  
  const target = json.data.stagedUploadsCreate.stagedTargets[0];
  if (!target) {
    throw new Error('No staged target received');
  }
  
  // Prepare a FormData object with the returned parameters and file.
  const form = new FormData();
  target.parameters.forEach((param: { name: string; value: string }) => {
    form.append(param.name, param.value);
  });
  form.append('file', imageBuffer, { filename, contentType: mimeType });
  
  // Upload the file to Shopify's storage URL.
  const uploadResponse = await fetch(target.url, {
    method: 'POST',
    body: form as any
  });
  
  if (!uploadResponse.ok) {
    throw new Error(`File upload failed with status ${uploadResponse.status}`);
  }
  
  return target.resourceUrl;
}

interface ProductCreateMediaResponseData {
  productCreateMedia?: {
    mediaUserErrors?: { field: string; message: string }[];
    media?: Array<{
      id: string;
      image?: { originalSrc: string };
    }>;
  };
}

interface ProductCreateMediaResponse {
  data?: ProductCreateMediaResponseData;
}

/**
 * attachImageToProduct: Calls the productCreateMedia mutation to attach the image
 * (using the provided resourceUrl) to the given product.
 */
export async function attachImageToProduct(
  resourceUrl: string,
  productId: string,
  alt: string
): Promise<boolean> {
  const endpoint = `https://${storeDomain}/admin/api/2025-01/graphql.json`;
  const mutation = `
    mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media {
          ... on MediaImage {
            id
            image {
              originalSrc
            }
          }
        }
        mediaUserErrors {
          field
          message
        }
      }
    }
  `;
  
  const variables = {
    productId,
    media: [{
      originalSource: resourceUrl,
      alt,
      mediaContentType: "IMAGE"
    }]
  };
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken
    },
    body: JSON.stringify({ query: mutation, variables })
  });
  
  const json = await response.json() as ProductCreateMediaResponse;
  console.log("Shopify productCreateMedia response:", JSON.stringify(json, null, 2));
  
  if (json.data?.productCreateMedia?.mediaUserErrors && json.data.productCreateMedia.mediaUserErrors.length > 0) {
    throw new Error(`productCreateMedia error: ${JSON.stringify(json.data.productCreateMedia.mediaUserErrors)}`);
  }
  
  return true;
}
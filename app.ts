import dotenv from 'dotenv';
import path from 'path';
import express, { Request, Response } from 'express';
import fs from 'fs';
import { TaskQueue } from './taskQueue';
import { enqueueImageUpload } from './uploadService';

const app = express();
app.use(express.json());
dotenv.config();

const taskQueue = new TaskQueue(3);

/*
 * Endpoint for local file upload.
 * Expects "filePath" and "productId" in the request body.
 */
app.post('/enqueue-task', async (req: Request, res: Response) => {
  try {
    const { filePath, productId } = req.body;
    if (!filePath || !productId) {
      throw new Error("Missing required fields: filePath and productId");
    }
    const absolutePath = path.resolve(filePath);
    const imageBuffer = fs.readFileSync(absolutePath);
    const filename = path.basename(absolutePath);
    // For this example, assume JPEG. Change if your file is PNG.
    const mimeType = "image/jpeg";
    
    const task = async (): Promise<string> => {
      // Use the real API call for staged upload and attachment.
      const resourceUrl = await (await import('./shopifyService')).uploadMedia(imageBuffer, filename, mimeType);
      console.log(`[${new Date().toISOString()}] Resultado do upload: ${resourceUrl}`);
      return JSON.stringify(resourceUrl);
    };

    const result = await taskQueue.add(task);
    res.status(202).send(result);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Erro ao processar a tarefa:`, error);
    res.status(500).send("Erro ao processar a tarefa.");
  }
});

/*
 * Endpoint for URL / base64 uploads.
 * Expects "input", "productId", and "alt" in the request body.
 */
app.post('/upload-image', async (req: Request, res: Response) => {
  const { input, productId, alt } = req.body;
  try {
    if (!input || !productId) {
      throw new Error("Missing required fields: input and productId");
    }
    // Enqueue the image upload task.
    await enqueueImageUpload(input, productId, alt || "Image");
    res.status(201).send("Image upload task queued successfully.");
  } catch (error) {
    res.status(500).send(`Error queuing image upload: ${error}`);
  }
});

app.get('/', (req: Request, res: Response) => {
    res.send('Task Queue API a funcionar!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor a correr na porta ${PORT}`);
});
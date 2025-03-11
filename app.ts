import dotenv from 'dotenv';
import path from 'path';
import express, { Request, Response } from 'express';
import fs from 'fs';
import { TaskQueue } from './taskQueue';
import { uploadMedia } from './shopifyService';
import { enqueueImageUpload } from './uploadService';

const app = express();
app.use(express.json());
dotenv.config();

const taskQueue = new TaskQueue(2);

// Endpoint a tarefa de upload
app.post('/enqueue-task', async (req: Request, res: Response) => {
  try {
    // Expecting filePath and productId in the request body
    const { filePath, productId } = req.body;
    
    if (!filePath || !productId) {
      throw new Error("Missing required fields: filePath and productId");
    }
    
    // Read the file from disk
    const absolutePath = path.resolve(filePath);
    const imageBuffer = fs.readFileSync(absolutePath);
    const filename = path.basename(absolutePath);
    // Set the MIME type appropriately; adjust if needed (e.g., "image/png")
    const mimeType = "image/jpeg";
    
    // Define the task for staged upload via GraphQL
    const task = async (): Promise<string> => {
      const result = await uploadMedia(imageBuffer, filename, mimeType);
      console.log("Resultado do upload:", result);
      return JSON.stringify(result);
    };

    const result = await taskQueue.add(task);
    res.status(202).send(result);
  } catch (error) {
    console.error("Erro ao processar a tarefa:", error);
    res.status(500).send("Erro ao processar a tarefa.");
  }
});

app.post('/upload-image', async (req: Request, res: Response) => {
  const { input, productId, alt } = req.body;
  try {
    // Enqueue the image upload task.
    await enqueueImageUpload(input, productId, alt);
    res.status(202).send("Image upload task queued successfully.");
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
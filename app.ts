import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import { TaskQueue } from './taskQueue';
import { uploadMedia } from './shopifyService';

const app = express();
app.use(express.json());
dotenv.config();

const taskQueue = new TaskQueue(2);

// Endpoint a tarefa de upload
app.post('/enqueue-task', async (req: Request, res: Response) => {
  try {
    const { mediaUrl, productId } = req.body;
    
    // Define a tarefa para fazer o upload via GraphQL
    const task = async (): Promise<string> => {
      const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
      const storeDomain = process.env.SHOPIFY_FLAG_STORE;

      if (!accessToken || !storeDomain) {
        throw new Error('Missing Shopify configuration: accessToken or storeDomain is not defined');
      }

      const result = await uploadMedia(mediaUrl, productId, accessToken, storeDomain);
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

app.get('/', (req: Request, res: Response) => {
    res.send('Task Queue API a funcionar!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor a correr na porta ${PORT}`);
});
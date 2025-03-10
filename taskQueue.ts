// Tipo genérico para uma tarefa que retorna uma Promise com um valor de tipo T
type Task<T> = () => Promise<T>;

interface QueueItem<T> {
  task: Task<T>;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
}

export class TaskQueue {
  private concurrency: number;
  private running: number;
  private queue: QueueItem<any>[]; // Poderia ser parametrizado, mas para simplicidade usamos any

  constructor(concurrency: number = 1) {
    this.concurrency = concurrency; // Número máximo de tarefas concorrentes
    this.running = 0;              // Tarefas atualmente a ser executadas
    this.queue = [];               // Fila de tarefas pendentes
  }

  // Adiciona uma nova tarefa à fila. Retorna uma Promise com o resultado da tarefa.
  add<T>(task: Task<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.runNext();
    });
  }

  // Executa a próxima tarefa se não ultrapassar o limite de concorrência
  private runNext(): void {
    if (this.running < this.concurrency && this.queue.length > 0) {
      const { task, resolve, reject } = this.queue.shift() as QueueItem<any>;
      this.running++;
      task()
        .then((result: any) => resolve(result))
        .catch((err: any) => reject(err))
        .finally(() => {
          this.running--;
          this.runNext();
        });
    }
  }
}
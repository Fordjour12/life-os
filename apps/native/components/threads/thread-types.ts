export type ThreadMetadata = {
  type: "chat" | "reflection" | "planning";
  context?: string;
};

export type ThreadItem = {
  id: string;
  title: string | null | undefined;
  summary: string | null | undefined;
  createdAt: number;
  updatedAt: number;
  metadata?: ThreadMetadata;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
};

export type ThreadWithMessages = ThreadItem & {
  messages: ChatMessage[];
};

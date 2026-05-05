export interface Question {
  text: string;
  topic: string;
  chapter?: string;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
}

export interface AnalysisResult {
  subject: string;
  year?: string;
  totalQuestions: number;
  summary: string;
  topics: {
    name: string;
    description: string;
    questions: Question[];
  }[];
}

export const generateBilingualNotes = async (
  topic: string, 
  subject: string, 
  onChunk: (chunk: string) => void
): Promise<void> => {
  const response = await fetch('/api/generate-notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, subject })
  });
  
  if (!response.ok) throw new Error("Failed to generate notes");

  const reader = response.body?.getReader();
  if (!reader) throw new Error("ReadableStream not supported");

  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    onChunk(chunk);
  }
};

export const generatePracticePaper = async (analysis: AnalysisResult): Promise<{ questions: Question[] }> => {
  const response = await fetch('/api/generate-practice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analysis })
  });
  if (!response.ok) throw new Error("Failed to generate practice paper");
  return response.json();
};

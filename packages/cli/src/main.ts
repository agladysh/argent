#! /usr/bin/env node --env-file-if-exists=.env --experimental-strip-types --disable-warning=ExperimentalWarning

import type { JsonObject } from '@ark/util';
import type { FunctionDeclaration, GenerateContentParameters } from '@google/genai';
import { FunctionCallingConfigMode, GoogleGenAI } from '@google/genai';
import { type } from 'arktype';

interface AIQuery {
  value: string;
}

interface AIContext {
  value: string;
}

type AISelect = JsonObject;

interface AIRequest {
  query: AIQuery;
  context: AIContext[];
  select: AISelect[];
}

function buildFunctionDeclarations(data: AISelect[]): FunctionDeclaration[] {
  return data.map((d, i) => ({
    name: `option-${i}`,
    parametersJsonSchema: type(d).toJsonSchema(),
  }));
}

function buildGenerateContentParameters({ query, context, select }: AIRequest): GenerateContentParameters {
  const functionDeclarations = buildFunctionDeclarations(select);
  const system = context.map((c) => c.value).join('\n');
  const user = `User message:
<user>
${query.value}
</user>
Answer by using a function call. Strictly follow the schema:
<schema>
${JSON.stringify(functionDeclarations, null, 2)}
</schema>
`;
  const allowedFunctionNames = functionDeclarations.map((f) => String(f.name));
  return {
    model: 'gemini-flash-latest',
    contents: user,
    config: {
      systemInstruction: system,
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.ANY, // Force a function call.
          allowedFunctionNames,
        },
      },
      tools: [{ functionDeclarations }],
      temperature: 0,
    },
  };
}

async function requestAI(request: AIRequest) {
  const params = buildGenerateContentParameters(request);
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is unset');
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const response = await ai.models.generateContent(params);

  const { args: result } = ((response?.candidates ?? [])[0]?.content?.parts ?? [])[0].functionCall ?? {};
  if (!result) {
    console.error(response);
    throw new Error(`Bad LLM response`);
  }

  return result;
}

async function main(): Promise<void> {
  const query: AIRequest = {
    query: { value: 'Say hello to my little friend' },
    context: [{ value: 'Mention roses in your reply' }],
    select: [
      {
        answer: '"Hello, little friend!"',
        remarks: 'string > 0',
      },
      {
        answer: '"Why are you here?"',
      },
    ],
  } as const;

  const response = await requestAI(query);

  console.log(response);
}

void main().catch((error: unknown) => {
  console.error('Unexpected error:', error);
  process.exitCode = 1;
});

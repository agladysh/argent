#! /usr/bin/env node --env-file-if-exists=.env --experimental-strip-types --disable-warning=ExperimentalWarning

import { type AIRequest, requestAI } from './AIRequest.ts';

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

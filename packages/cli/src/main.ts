#! /usr/bin/env node --env-file-if-exists=.env --experimental-strip-types --disable-warning=ExperimentalWarning

import ignore from 'ignore';
import { type AIRequest, requestAI } from './AIRequest.ts';
import { renderDirtree } from './dirtree.ts';
import { FileSystem } from './FileSystem.ts';
import { findProjectRootPath, readGitIgnore } from './project.ts';

async function main(): Promise<void> {
  const projectRootPath = findProjectRootPath(process.cwd());
  console.log('Project root', projectRootPath);

  const alwaysIgnore = `
node_modules/
.git/
.DS_Store
  `.trim();

  const ignorer = ignore();
  ignorer.add(alwaysIgnore);

  const fs = new FileSystem(projectRootPath, (path: string) => ignorer.ignores(path));

  console.log(`Discovered ${fs.files.length} non-ignored project files`);

  const alwaysOmit = `
.env
  `.trim();

  const omitter = ignore();
  omitter.add(alwaysOmit);
  omitter.add(readGitIgnore(projectRootPath));

  const dirtree = renderDirtree(fs, (path: string) => omitter.ignores(path));

  console.log(`Project dirtree:\n${dirtree}`);

  const query: AIRequest = {
    query: { value: 'Say hello to my little friend' },
    context: [
      { value: 'Mention roses in your reply' },
      { value: `<dirtree>${dirtree}</dirtree>` }
    ],
    select: [
      {
        answer: '"Hello, little friend!"',
        remarks: 'string > 0',
      },
      {
        answer: '"That is an interesting dirtree you have there."',
        remarks: 'string > 0'
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

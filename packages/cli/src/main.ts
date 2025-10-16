#! /usr/bin/env node --env-file-if-exists=.env --experimental-strip-types --disable-warning=ExperimentalWarning

import ignore from 'ignore';
import { minimatch } from 'minimatch';
import { type AIContext, requestAI } from './AIRequest.ts';
import { renderDirtree } from './dirtree.ts';
import { FileSystem, type Filter } from './FileSystem.ts';
import { findProjectRootPath, readGitIgnore } from './project.ts';
import { formatFiles, responseToMarkdown } from './util/string.ts';

function setupFS(cwdPath: string): FileSystem {
  const projectRootPath = findProjectRootPath(cwdPath);
  console.log('Project root', projectRootPath);

  const alwaysIgnore = `
node_modules/
.git/
.DS_Store
  `.trim();

  const ignorer = ignore();
  ignorer.add(alwaysIgnore);

  return new FileSystem(projectRootPath, (path: string) => ignorer.ignores(path));
}

function setupDefaultOmitter(fs: FileSystem): ignore.Ignore {
  const alwaysOmit = `
.env
  `.trim();

  const defaultOmitter = ignore();
  defaultOmitter.add(alwaysOmit);
  defaultOmitter.add(readGitIgnore(fs.projectRootPath));

  return defaultOmitter;
}

function context(header: string, tag: string, value: string): AIContext {
  return {
    value: `
# ${header}

<${tag}>
${value}
</${tag}>
    `.trim(),
  };
}

async function main(): Promise<void> {
  const fs = setupFS(process.cwd());
  const defaultOmitter = setupDefaultOmitter(fs);

  console.log(`Discovered ${fs.files.length} non-ignored project files`);

  const dirtree = (omitter: Filter) => context('Project Dirtree', 'dirtree', renderDirtree(fs, omitter));
  const dirtreeIg = (ig: ignore.Ignore) => dirtree((f) => ig.ignores(f));
  const defaultDirtree = dirtreeIg(defaultOmitter);
  const files = (omitter: Filter) => context('Relevant Files', 'files', formatFiles(fs, omitter));

  const task = context('Task', 'task', 'Review the project security measures against supply chain attacks');

  console.log(task.value);

  const roleResponse = (await requestAI({
    query: { value: `Determine the AI role suitable for the task execution on this project` },
    context: [task, dirtree((f) => defaultOmitter.ignores(f))],
    select: [
      {
        answer: '"Role suitable for the task execution on this project"',
        role: 'string > 0',
        remarks: 'string > 0',
      },
    ],
  })) as { role: string };

  const role = context('Role', 'role', roleResponse.role);

  console.log('');
  console.log(role.value);

  const standardResponse = (await requestAI({
    query: {
      value: `Return brief standard and brief methodology on how the AI should execute the task on this project`,
    },
    context: [role, task, defaultDirtree],
    select: [
      {
        answer: '"Standard and methodology on how the AI should execute the task"',
        standard: 'string > 0',
        methodology: 'string > 0',
        remarks: 'string > 0',
      },
    ],
  })) as { standard: string; methodology: string };

  const standard = context('Standard', 'standard', standardResponse.standard);
  const methodology = context('Methodology', 'methodology', standardResponse.methodology);

  console.log('');
  console.log(standard.value);

  console.log('');
  console.log(methodology.value);

  const patterns = (await requestAI({
    query: { value: `Return minimatch patterns identifying files in this project, relevant to the task` },
    context: [role, task, standard, methodology, defaultDirtree],
    select: [
      {
        answer: '"Minimatch patterns identifying files relevant to the task"',
        patterns: '(string > 0)[] > 0',
        remarks: 'string > 0',
      },
    ],
  })) as { patterns: string[] };

  console.log('');
  console.log('Reviewing Files:', patterns.patterns);

  const matchers = patterns.patterns.map((p) => minimatch.filter(p));
  const omitter = (f: string) => defaultOmitter.ignores(f) || !matchers.some((m) => m(f));

  console.log('');
  console.log(dirtree(omitter).value);

  const response = await requestAI({
    query: { value: 'Execute the task adhering to the standard and methodology' },
    context: [role, task, standard, methodology, dirtree(omitter), files(omitter)],
    select: [
      {
        answer: '"Project entirely satisfies the standard"',
        analysis: 'string > 0',
        'remarks?': 'string > 0',
      },
      {
        answer: '"Project satisfies the standard with areas for improvement"',
        analysis: 'string > 0',
        managerialRecommendations: 'string > 0',
        technicalRecommendations: 'string > 0',
        'remarks?': 'string > 0',
      },
      {
        answer: '"Project does not satisfy the standard"',
        analysis: 'string > 0',
        managerialRecommendations: 'string > 0',
        technicalRecommendations: 'string > 0',
        'remarks?': 'string > 0',
      },
      {
        answer: '"Uncertain, or Not sufficient information, or Unable to answer"',
        analysis: 'string > 0',
        requestForClarification: 'string > 0',
        'remarks?': 'string > 0',
      },
    ],
  });

  console.log('');
  console.log(responseToMarkdown(response));
}

void main().catch((error: unknown) => {
  console.error('Unexpected error:', error);
  process.exitCode = 1;
});

import { existsSync, readFileSync } from 'fs';
import { join } from 'path/posix';

function hasGit(path: string): boolean {
  return existsSync(join(path, '.git'));
}
export function findProjectRootPath(cwdPath: string): string {
  if (cwdPath === '/') {
    throw new Error('unable to find .git while searching for the project root');
  }

  if (hasGit(cwdPath)) {
    return cwdPath;
  }

  return findProjectRootPath(join(cwdPath, '../'));
}
export function readGitIgnore(projectRootPath: string) {
  // TODO: Strictly speaking, Git may have more ignores configured.
  const path = join(projectRootPath, '.gitignore');
  if (!existsSync(path)) {
    return '';
  }
  return readFileSync(path, 'utf-8');
}

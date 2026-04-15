'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { simpleGit } = require('simple-git');

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function createNewFilePatch(filePath, content) {
  const normalizedPath = toPosixPath(filePath);
  const lines = content.length === 0 ? [] : content.replace(/\r\n/g, '\n').split('\n');
  const body = lines.map((line) => `+${line}`).join('\n');
  const lineCount = lines.length;

  return [
    `diff --git a/${normalizedPath} b/${normalizedPath}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${normalizedPath}`,
    `@@ -0,0 +1,${lineCount} @@`,
    body,
  ]
    .filter(Boolean)
    .join('\n');
}

async function readFileForPatch(absolutePath) {
  try {
    return await fs.readFile(absolutePath, 'utf8');
  } catch {
    return null;
  }
}

async function readHeadFileContent(git, relativePath) {
  try {
    return await git.show([`HEAD:${toPosixPath(relativePath)}`]);
  } catch {
    return null;
  }
}

async function createGitTracker(cwd, logger) {
  const git = simpleGit({ baseDir: cwd, binary: 'git' });
  let repoRoot;

  try {
    repoRoot = (await git.revparse(['--show-toplevel'])).trim();
  } catch {
    logger.info({ cwd }, 'git tracker disabled: working directory is not inside a git repository');
    return {
      available: false,
      async captureSnapshot() {
        return null;
      },
      async collectChangesSince() {
        return {
          available: false,
          repoRoot: null,
          files: [],
          reason: 'Working directory is not inside a git repository.',
        };
      },
    };
  }

  async function getPatchForFile(relativePath, statusCode) {
    if (statusCode === '??') {
      const absolutePath = path.join(repoRoot, relativePath);
      const content = await readFileForPatch(absolutePath);
      if (content === null) {
        return `diff --git a/${toPosixPath(relativePath)} b/${toPosixPath(relativePath)}\nBinary file or unreadable content\n`;
      }
      return createNewFilePatch(relativePath, content);
    }

    return git.diff(['--no-ext-diff', '--', relativePath]);
  }

  async function getSnapshotEntry(file) {
    const statusCode = `${file.index}${file.working_dir}`.trim() || `${file.index}${file.working_dir}`;
    const patch = await getPatchForFile(file.path, statusCode);
    const isDeleted = statusCode.includes('D');
    const content = isDeleted ? null : await readFileForPatch(path.join(repoRoot, file.path));

    return {
      path: file.path,
      status: statusCode || '  ',
      patch,
      content,
    };
  }

  async function captureSnapshot() {
    const status = await git.status();
    const files = {};

    for (const file of status.files) {
      files[file.path] = await getSnapshotEntry(file);
    }

    return {
      repoRoot,
      files,
    };
  }

  async function collectChangesSince(beforeSnapshot) {
    const afterSnapshot = await captureSnapshot();
    const beforeFiles = beforeSnapshot?.files || {};
    const afterFiles = afterSnapshot.files || {};
    const allPaths = Array.from(new Set([...Object.keys(beforeFiles), ...Object.keys(afterFiles)])).sort();
    const files = [];

    for (const filePath of allPaths) {
      const beforeFile = beforeFiles[filePath];
      const afterFile = afterFiles[filePath];
      const beforePatch = beforeFile?.patch || '';
      const afterPatch = afterFile?.patch || '';

      if (beforePatch === afterPatch) {
        continue;
      }

      const beforeStatus = beforeFile?.status || '';
      const afterStatus = afterFile?.status || '';
      const beforeContent =
        beforeFile?.content !== undefined
          ? beforeFile.content
          : afterStatus === '??'
            ? null
            : await readHeadFileContent(git, filePath);
      const afterContent =
        afterFile?.content !== undefined
          ? afterFile.content
          : beforeStatus.includes('D')
            ? null
            : await readHeadFileContent(git, filePath);

      files.push({
        path: filePath,
        status: afterFile?.status || beforeFile?.status || 'M',
        beforePatch,
        afterPatch,
        beforeContent,
        afterContent,
      });
    }

    return {
      available: true,
      repoRoot,
      files,
    };
  }

  return {
    available: true,
    captureSnapshot,
    collectChangesSince,
  };
}

module.exports = {
  createGitTracker,
};

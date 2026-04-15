import { useEffect, useMemo, useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';

type MonacoDiffViewerProps = {
  path: string;
  original: string | null | undefined;
  modified: string | null | undefined;
};

function inferLanguage(path: string) {
  const extension = path.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'json':
      return 'json';
    case 'css':
      return 'css';
    case 'html':
      return 'html';
    case 'md':
      return 'markdown';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'sh':
      return 'shell';
    case 'py':
      return 'python';
    case 'java':
      return 'java';
    case 'go':
      return 'go';
    case 'rs':
      return 'rust';
    case 'php':
      return 'php';
    case 'xml':
      return 'xml';
    case 'sql':
      return 'sql';
    default:
      return 'plaintext';
  }
}

function normalizeContent(value: string | null | undefined, emptyLabel: string) {
  if (value === null || value === undefined) {
    return emptyLabel;
  }

  return value.length === 0 ? '[empty file]\n' : value;
}

export function MonacoDiffViewer({ path, original, modified }: MonacoDiffViewerProps) {
  const [renderSideBySide, setRenderSideBySide] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    return !window.matchMedia('(max-width: 1180px), (max-aspect-ratio: 4/5)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia('(max-width: 1180px), (max-aspect-ratio: 4/5)');
    const syncLayout = () => setRenderSideBySide(!mediaQuery.matches);

    syncLayout();
    mediaQuery.addEventListener('change', syncLayout);

    return () => {
      mediaQuery.removeEventListener('change', syncLayout);
    };
  }, []);

  const language = useMemo(() => inferLanguage(path), [path]);

  return (
    <div className="monaco-diff">
      <DiffEditor
        original={normalizeContent(original, 'No prior content for this file.\n')}
        modified={normalizeContent(modified, 'File removed in this turn.\n')}
        language={language}
        theme="vs-dark"
        height="100%"
        options={{
          readOnly: true,
          renderSideBySide,
          automaticLayout: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          lineNumbers: 'on',
          glyphMargin: false,
          folding: true,
          renderOverviewRuler: false,
          diffWordWrap: 'on',
          padding: {
            top: 12,
            bottom: 12,
          },
        }}
      />
    </div>
  );
}

import JSZip from 'jszip';

const MAX_FILES = 400;
const MAX_SINGLE_FILE_BYTES = 600_000; // 600 KB per file
const MAX_TOTAL_UNCOMPRESSED_BYTES = 25 * 1024 * 1024; // 25 MB zip-bomb ceiling
const MAX_TOTAL_OUTPUT_CHARS = 1_500_000; // ~1.5 MB text budget

const IGNORED_PATH_REGEX =
  /(^|\/)(node_modules|\.git|dist|build|\.next|\.nuxt|coverage|\.venv|venv|__pycache__|\.idea|\.vscode|target|out)(\/|$)/i;

const IGNORED_FILE_REGEX =
  /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|\.min\.(js|css)|\.map)$/i;

const TEXT_EXT_REGEX =
  /\.(txt|md|markdown|csv|tsv|json|jsonc|log|py|js|mjs|cjs|ts|mts|cts|tsx|jsx|html|htm|css|scss|sass|less|yml|yaml|toml|ini|xml|svg|sql|sh|bash|zsh|ps1|bat|c|cc|cpp|h|hpp|java|kt|kts|rs|go|rb|php|swift|dart|lua|r|tex|prisma|graphql|gql)$/i;

const KNOWN_TEXT_FILENAMES = new Set([
  'dockerfile',
  'makefile',
  'readme',
  'license',
  '.gitignore',
  '.env.example',
  '.npmrc',
  '.prettierrc',
  '.eslintrc',
]);

function isLikelyTextPath(relPath: string): boolean {
  const base = relPath.split('/').pop()?.toLowerCase() || '';
  if (KNOWN_TEXT_FILENAMES.has(base) || base.startsWith('.env.')) return true;
  return TEXT_EXT_REGEX.test(base);
}

function hasBinaryBytes(bytes: Uint8Array): boolean {
  const checkLen = Math.min(bytes.length, 1024);
  for (let i = 0; i < checkLen; i++) {
    if (bytes[i] === 0) return true;
  }
  return false;
}

export function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export interface ExtractedZipResult {
  base64Data: string;
  extractedCount: number;
  skippedCount: number;
  truncated: boolean;
  byteSize: number;
}

export async function extractZipForChat(file: File): Promise<ExtractedZipResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error(`Could not open "${file.name}" — it may be corrupted or password-protected.`);
  }

  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .sort((a, b) => a.name.localeCompare(b.name));

  const includedPaths: string[] = [];
  const skippedNotes: string[] = [];
  const fileBlocks: string[] = [];

  let totalUncompressedSeen = 0;
  let totalOutputChars = 0;
  let truncated = false;

  for (const entry of entries) {
    const relPath = entry.name.replace(/^\/+/, '');
    if (!relPath || IGNORED_PATH_REGEX.test(relPath) || IGNORED_FILE_REGEX.test(relPath)) {
      skippedNotes.push(`${relPath || entry.name} (ignored)`);
      continue;
    }
    if (!isLikelyTextPath(relPath)) {
      skippedNotes.push(`${relPath} (binary/non-text)`);
      continue;
    }
    if (includedPaths.length >= MAX_FILES) {
      truncated = true;
      skippedNotes.push(`${relPath} (max ${MAX_FILES} files cap)`);
      continue;
    }

    const declaredSize = (entry as any)._data?.uncompressedSize;
    if (typeof declaredSize === 'number') {
      if (declaredSize > MAX_SINGLE_FILE_BYTES) {
        skippedNotes.push(`${relPath} (>600 KB)`);
        continue;
      }
      if (totalUncompressedSeen + declaredSize > MAX_TOTAL_UNCOMPRESSED_BYTES) {
        truncated = true;
        skippedNotes.push(`${relPath} (25 MB zip-bomb limit)`);
        continue;
      }
    }

    const bytes = await entry.async('uint8array');
    if (bytes.byteLength > MAX_SINGLE_FILE_BYTES) {
      skippedNotes.push(`${relPath} (>600 KB)`);
      continue;
    }
    if (totalUncompressedSeen + bytes.byteLength > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      truncated = true;
      skippedNotes.push(`${relPath} (25 MB zip-bomb limit)`);
      continue;
    }
    if (hasBinaryBytes(bytes)) {
      skippedNotes.push(`${relPath} (binary bytes)`);
      continue;
    }

    totalUncompressedSeen += bytes.byteLength;
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const block = `--- FILE: ${relPath} ---\n${text}\n`;

    if (totalOutputChars + block.length > MAX_TOTAL_OUTPUT_CHARS) {
      truncated = true;
      skippedNotes.push(`${relPath} (text budget cap)`);
      continue;
    }

    includedPaths.push(relPath);
    fileBlocks.push(block);
    totalOutputChars += block.length;
  }

  if (includedPaths.length === 0) {
    throw new Error(`No readable text or code files found inside "${file.name}".`);
  }

  const header = [
    `[Extracted ZIP Archive: ${file.name}]`,
    `Included text files: ${includedPaths.length} | Skipped: ${skippedNotes.length}${truncated ? ' (truncated at safety cap)' : ''}`,
    `Included Tree:\n${includedPaths.map((p) => `- ${p}`).join('\n')}`,
    skippedNotes.length > 0
      ? `Skipped/Ignored (${skippedNotes.length}):\n${skippedNotes.slice(0, 40).map((s) => `- ${s}`).join('\n')}${skippedNotes.length > 40 ? `\n- ...and ${skippedNotes.length - 40} more` : ''}`
      : '',
    '=== FILE CONTENTS ===',
  ]
    .filter(Boolean)
    .join('\n\n');

  const formattedText = `${header}\n\n${fileBlocks.join('\n')}`;
  const byteSize = new TextEncoder().encode(formattedText).byteLength;

  return {
    base64Data: utf8ToBase64(formattedText),
    extractedCount: includedPaths.length,
    skippedCount: skippedNotes.length,
    truncated,
    byteSize,
  };
}

/**
 * Speech Sanitizer Utility
 * Thoroughly strips emojis, markdown formatting, LaTeX syntax, and raw code/HTML
 * so that Web Speech API (speechSynthesis) speaks smoothly and naturally without
 * pronouncing punctuation symbols ("asterisk", "hash", "underscore", "pipe")
 * or emoji names ("rocket", "test tube", "sparkles", "abacus", etc.).
 */

// Comprehensive Unicode regex covering all emoji categories, pictographs, variation selectors, and dingbats
// Note: We avoid \p{Emoji_Component} because in Unicode that matches ASCII digits 0-9 and # and *
const EMOJI_AND_PICTOGRAPH_REGEX = /(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u{1F300}-\u{1FAD6}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0E}\u{FE0F}\u{200D}\u{2300}-\u{23FF}\u{2B50}\u{2B55}]|[\uD83C][\uDFFB-\uDFFF])/gu;

// Bullet symbols and geometric shapes that TTS often pronounces literally
const SYMBOLS_AND_BULLETS_REGEX = /[•◆■▲▶►▪▫★☆✓✔✕✖✗✘➔➜➝➞➤➢➡⬅⬆⬇]/gu;

/**
 * Sanitizes any raw input text, markdown, LaTeX, or HTML for crystal-clear, natural speech.
 */
export function sanitizeForSpeech(rawText: string): string {
  if (!rawText) return '';

  let text = rawText;

  // 1. Remove DeepSeek-R1 / reasoning blocks (<think>...</think>) and unclosed <think>
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, ' ');
  text = text.replace(/<think>[\s\S]*$/gi, ' ');

  // 1.5 Remove Visual Data JSON blocks
  text = text.replace(/```visual-data[\s\S]*?```/gi, ' ');

  // 2. Remove HTML tags like <details>, <summary>, <span>, <div>, <br>, etc.
  text = text.replace(/<[^>]+>/g, ' ');

  // 3. Remove Markdown image tags: ![alt](url) -> alt
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');

  // 4. Remove Markdown links: [text](url) -> text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 5. Code blocks: ```language\ncode\n``` -> extract code content without triple backticks
  text = text.replace(/```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g, '$1');

  // 6. Inline code: `code` -> code
  text = text.replace(/`([^`]+)`/g, '$1');

  // 7. Markdown Tables: remove divider rows like |---|---|
  text = text.replace(/^\s*\|[-:\s|]+\|\s*$/gm, ' ');
  // Replace table pipes with comma/space so it flows naturally
  text = text.replace(/\|/g, ', ');

  // 8. Blockquotes: remove leading > on lines
  text = text.replace(/^\s*>\s*/gm, ' ');

  // 9. Markdown Headings: remove leading ### or #### at start of lines
  text = text.replace(/^\s*#{1,6}\s+/gm, ' ');
  // Also remove trailing hashes on headers: e.g. "### Heading ###"
  text = text.replace(/\s+#{1,6}\s*$/gm, ' ');

  // 10. Horizontal rules: ---, ***, ___
  text = text.replace(/^\s*[-*_]{3,}\s*$/gm, ' ');

  // 11. Bullet points and numbered lists: - item, * item, + item, 1. item
  text = text.replace(/^\s*[-*+]\s+/gm, ' ');
  text = text.replace(/^\s*(\d+)\.\s+/gm, '$1. ');

  // 12. Markdown Bold, Italic, Strikethrough, Highlights (processed BEFORE math/subscripts)
  // Triple asterisks/underscores (bold + italic)
  text = text.replace(/\*{3}([\s\S]+?)\*{3}/g, '$1');
  text = text.replace(/_{3}([\s\S]+?)_{3}/g, '$1');
  // Double asterisks/underscores (bold)
  text = text.replace(/\*{2}([\s\S]+?)\*{2}/g, '$1');
  text = text.replace(/_{2}([\s\S]+?)_{2}/g, '$1');
  // Single asterisks/underscores (italic)
  text = text.replace(/\*([^*\n]+?)\*/g, '$1');
  text = text.replace(/_([^_\n]+?)_/g, '$1');
  // Strikethrough ~~text~~
  text = text.replace(/~~([\s\S]+?)~~/g, '$1');
  // Highlights ==text==
  text = text.replace(/==([\s\S]+?)==/g, '$1');

  // 13. LaTeX / Math Expressions conversions for natural vocalization:
  // Math delimiters: remove $$, $, \[, \], \(, \)
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, ' $1 ');
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, ' $1 ');
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, ' $1 ');
  text = text.replace(/\$([^$]+)\$/g, ' $1 ');

  // LaTeX environments
  text = text.replace(/\\begin\{[^}]+\}/g, ' ');
  text = text.replace(/\\end\{[^}]+\}/g, ' ');
  text = text.replace(/\\(?:text|mathrm|mathbf|mathit)\{([^}]+)\}/g, '$1');

  // Fractions: \frac{a}{b} -> fraction a over b (loop multiple times for nested fractions)
  for (let i = 0; i < 3; i++) {
    text = text.replace(/\\d?frac\{([^{}]+)\}\{([^{}]+)\}/g, ' the fraction $1 over $2 ');
  }

  // Calculus: Integrals with bounds and derivatives
  text = text.replace(/\\int_\{?([^{}\s]+)\}?\^\{?([^{}\s]+)\}?/g, ' the integral from $1 to $2 of ');
  text = text.replace(/\\int/g, ' the integral of ');
  text = text.replace(/\\frac\{d\}\{dx\}|\\d\/dx|d\/dx/g, ' the derivative with respect to x of ');
  text = text.replace(/\\partial/g, ' partial derivative of ');
  text = text.replace(/\\lim_\{([^{}]+)\s*\\to\s*([^{}]+)\}/g, ' the limit as $1 approaches $2 of ');
  text = text.replace(/\\sum_\{([^{}]+)=([^{}]+)\}\^\{([^{}]+)\}/g, ' the sum from $1 equals $2 to $3 of ');

  // Roots
  text = text.replace(/\\sqrt\[([^\]]+)\]\{([^{}]+)\}/g, ' the $1-th root of $2 ');
  text = text.replace(/\\sqrt\{([^{}]+)\}/g, ' the square root of $1 ');

  // Powers and Exponents attached to base
  text = text.replace(/([a-zA-Z0-9)])\^\{?2\}?/g, '$1 squared ');
  text = text.replace(/([a-zA-Z0-9)])\^\{?3\}?/g, '$1 cubed ');
  text = text.replace(/([a-zA-Z0-9)])\^\{?([0-9a-zA-Z+\-]+)\}?/g, '$1 raised to the power of $2 ');

  // Subscripts attached to variables (e.g. v_0, x_1, F_net)
  text = text.replace(/([a-zA-Z0-9])_\{?([0-9a-zA-Z+\-]+)\}?/g, '$1 sub $2 ');

  // Vectors, Hats, Bars
  text = text.replace(/\\vec\{([^}]+)\}/g, ' vector $1 ');
  text = text.replace(/\\hat\{([^}]+)\}/g, ' unit vector $1 ');
  text = text.replace(/\\overline\{([^}]+)\}/g, ' line segment $1 ');

  // Greek Letters
  text = text
    .replace(/\\alpha/g, ' alpha ')
    .replace(/\\beta/g, ' beta ')
    .replace(/\\gamma/g, ' gamma ')
    .replace(/\\delta/g, ' delta ')
    .replace(/\\Delta/g, ' delta ')
    .replace(/\\theta/g, ' theta ')
    .replace(/\\Theta/g, ' theta ')
    .replace(/\\pi/g, ' pi ')
    .replace(/\\omega/g, ' omega ')
    .replace(/\\Omega/g, ' ohms ')
    .replace(/\\sigma/g, ' sigma ')
    .replace(/\\lambda/g, ' lambda ')
    .replace(/\\phi/g, ' phi ')
    .replace(/\\mu/g, ' micro ')
    .replace(/\\epsilon_0/g, ' permittivity of free space ')
    .replace(/\\mu_0/g, ' permeability of free space ')
    .replace(/\\epsilon/g, ' epsilon ')
    .replace(/\\nu/g, ' frequency nu ')
    .replace(/\\tau/g, ' torque ')
    .replace(/\\rho/g, ' rho ')
    .replace(/\\eta/g, ' eta ')
    .replace(/\\psi/g, ' psi ');

  // Relations & Operators
  text = text
    .replace(/\\pm/g, ' plus or minus ')
    .replace(/\\mp/g, ' minus or plus ')
    .replace(/\\times|\\cdot/g, ' times ')
    .replace(/\\div/g, ' divided by ')
    .replace(/\\le|\\leq/g, ' less than or equal to ')
    .replace(/\\ge|\\geq/g, ' greater than or equal to ')
    .replace(/\\neq/g, ' not equal to ')
    .replace(/\\approx/g, ' approximately ')
    .replace(/\\propto/g, ' is proportional to ')
    .replace(/\\infty/g, ' infinity ')
    .replace(/\\implies/g, ' implies that ')
    .replace(/\\iff/g, ' if and only if ')
    .replace(/\\therefore/g, ' therefore ')
    .replace(/\\because/g, ' because ')
    .replace(/\\in/g, ' belongs to ')
    .replace(/\\notin/g, ' does not belong to ')
    .replace(/\\subset/g, ' subset of ')
    .replace(/\\cup/g, ' union ')
    .replace(/\\cap/g, ' intersection ');

  // Chemistry specific
  text = text
    .replace(/\\rightleftharpoons|⇌/g, ' is in reversible equilibrium with ')
    .replace(/\\rightarrow|\\longrightarrow|->/g, ' yields ')
    .replace(/\\leftarrow|<-/g, ' reverts to ')
    .replace(/\\xrightarrow\{([^}]+)\}/g, ' reacting with $1 yields ')
    .replace(/\(s\)/g, ' solid ')
    .replace(/\(l\)/g, ' liquid ')
    .replace(/\(g\)/g, ' gas ')
    .replace(/\(aq\)/g, ' aqueous ')
    .replace(/\^\{\+\}/g, ' positive ')
    .replace(/\^\{\-\}/g, ' negative ')
    .replace(/\^\{([0-9]+)\+\}/g, ' $1 plus ')
    .replace(/\^\{([0-9]+)\-\}/g, ' $1 minus ')
    .replace(/\\Delta\s*H/g, ' enthalpy change ');

  // Physics Units
  text = text
    .replace(/m\/s\^2/g, ' meters per second squared ')
    .replace(/m\/s/g, ' meters per second ')
    .replace(/kg[·\s*]m\/s/g, ' kilogram meters per second ')
    .replace(/N[·\s*]m/g, ' Newton meters ')
    .replace(/rad\/s/g, ' radians per second ')
    .replace(/\b(\d+)\s*Hz\b/gi, '$1 Hertz')
    .replace(/\b(\d+)\s*J\b/g, '$1 Joules')
    .replace(/\b(\d+)\s*kJ\b/gi, '$1 kilojoules')
    .replace(/\b(\d+)\s*W\b/g, '$1 Watts')
    .replace(/\b(\d+)\s*kW\b/gi, '$1 kilowatts')
    .replace(/\b(\d+)\s*V\b/g, '$1 Volts')
    .replace(/\b(\d+)\s*A\b/g, '$1 Amperes')
    .replace(/\b(\d+)\s*C\b/g, '$1 Coulombs')
    .replace(/\b(\d+)\s*F\b/g, '$1 Farads')
    .replace(/\b(\d+)\s*K\b/g, '$1 Kelvin')
    .replace(/\b(\d+)\s*mol\b/gi, '$1 moles')
    .replace(/\\Omega|\bohm(s)?\b/gi, 'ohms')
    .replace(/\beV\b/g, 'electron volts');

  // Common natural phrasing: e.g. "Class 11/12" -> "Class 11 or 12"
  text = text.replace(/(\d+)\/(\d+)/g, '$1 or $2');

  // Ampersand: replace & with 'and' so it doesn't say "ampersand"
  text = text.replace(/&/g, ' and ');

  // Remove any remaining backslash LaTeX command keywords
  text = text.replace(/\\[a-zA-Z]+/g, ' ');

  // 14. STRIP ALL EMOJIS & PICTOGRAPHS (Crucial: Prevents TTS from spelling emoji names)
  text = text.replace(EMOJI_AND_PICTOGRAPH_REGEX, ' ');

  // 15. STRIP ALL BULLET SYMBOLS & DINGBATS
  text = text.replace(SYMBOLS_AND_BULLETS_REGEX, ' ');

  // 16. ABSOLUTE CLEANUP OF ANY REMAINING MARKDOWN / SYNTAX CHARACTERS
  // Any stray asterisks, underscores, hashes, tildes, backticks, pipes, angle brackets,
  // backslashes, braces, or brackets MUST BE REMOVED so the speech engine NEVER spells them out!
  text = text.replace(/[*_#~`|\\<>{}\[\]^]/g, ' ');

  // 17. Whitespace and Punctuation Normalization
  // Replace multiple punctuation marks like "..." or ",," or "--" with standard pauses
  text = text.replace(/--+/g, ' — ');
  text = text.replace(/\.{2,}/g, '. ');
  text = text.replace(/([,;:?!])\s*([,;:?!])+/g, '$1 ');

  // Clean leading/trailing commas or semicolons on lines (e.g. from tables)
  text = text.replace(/^\s*[,;:]+\s*/gm, '');
  text = text.replace(/\s*[,;:]+\s*$/gm, '');

  // Normalize multiple spaces and tabs to single space
  text = text.replace(/[ \t\r\f]+/g, ' ');

  // Ensure sentence endings have proper spacing
  text = text.replace(/\s+([,.;:?!])/g, '$1');

  return text.trim();
}

/**
 * Splits text into natural sentence-sized chunks (typically 120-180 chars).
 * Chromium and WebKit browsers have a notorious bug where SpeechSynthesisUtterance
 * silently hangs or times out after 15 seconds if given a single gigantic text block.
 * Chunking ensures 100% reliable continuous playback across all browsers and devices.
 */
export function splitIntoSpeechChunks(text: string, maxChunkLength = 160): string[] {
  if (!text) return [];

  // Split on sentence boundaries (period, exclamation, question mark, colon, newline)
  const rawSentences = text.split(/(?<=[.?!:\n])\s+/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const raw of rawSentences) {
    const sentence = raw.trim();
    if (!sentence) continue;

    if (currentChunk.length + sentence.length + 1 <= maxChunkLength) {
      currentChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }

      if (sentence.length > maxChunkLength) {
        // Sub-split by comma, semicolon, or dash
        const clauses = sentence.split(/(?<=[,;—])\s+/);
        let subChunk = '';
        for (const clause of clauses) {
          if (subChunk.length + clause.length + 1 <= maxChunkLength) {
            subChunk = subChunk ? `${subChunk} ${clause}` : clause;
          } else {
            if (subChunk) chunks.push(subChunk);
            if (clause.length > maxChunkLength) {
              // Word split fallback
              const words = clause.split(/\s+/);
              let wordChunk = '';
              for (const word of words) {
                if (wordChunk.length + word.length + 1 <= maxChunkLength) {
                  wordChunk = wordChunk ? `${wordChunk} ${word}` : word;
                } else {
                  if (wordChunk) chunks.push(wordChunk);
                  wordChunk = word;
                }
              }
              subChunk = wordChunk;
            } else {
              subChunk = clause;
            }
          }
        }
        currentChunk = subChunk;
      } else {
        currentChunk = sentence;
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

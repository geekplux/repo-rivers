/** The one model call of repo-rivers (docs/PLAN.md §4.6), shared by the Worker and `scripts/build-eras.ts`. */
import type { EraSummary } from './summary.ts';
import { NOTE_MAX, TITLE_MAX } from './validate.ts';

/** The Workers AI model that names eras; change it here only. */
export const ERA_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

/** The `env.AI.run` input for `summary`: chat messages, a JSON schema for exactly one name per era, 400 tokens. */
export function eraRequest(summary: EraSummary) {
  const n = summary.eras.length;
  const system =
    `You name eras in the history of a software repository. You get JSON facts for ${n} consecutive eras ` +
    '(module shares of lines changed, overall and lead-module trend, a change of lead module within the era, activity, ' +
    'contributor counts, files moved between modules). ' +
    `Answer with JSON {"eras":[{"title","note"}]} with exactly ${n} items, in order. Title: at most ${TITLE_MAX} ` +
    `characters, plain words, names what changed (e.g. "The packages/ monorepo"). Note: at most ${NOTE_MAX} characters, ` +
    'one plain sentence using only the given facts. No people, no markup, no numbers that are not in the facts.';
  const item = { type: 'object', properties: { title: { type: 'string', maxLength: TITLE_MAX }, note: { type: 'string', maxLength: NOTE_MAX } }, required: ['title', 'note'] };
  const schema = { type: 'object', properties: { eras: { type: 'array', items: item, minItems: n, maxItems: n } }, required: ['eras'] };
  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(summary) },
    ],
    response_format: { type: 'json_schema', json_schema: schema },
    max_tokens: 400,
    temperature: 0.2,
  };
}

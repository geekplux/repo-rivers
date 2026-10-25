import { useId, useState } from 'react';
import { parseRepoInput, type RepoRef } from '../core/github/repoRef.ts';

/** The id of the repository field, so error actions ("Check the spelling") can focus it. */
export const REPO_INPUT_ID = 'rr-repo';

/**
 * The hero's field (placeholder "github.com/owner/name", named "GitHub repository" for assistive tech) and Draw.
 * Enter submits; anything `parseRepoInput` rejects shows an inline error (linked with `aria-describedby`) and
 * makes no request. The form's boxes sit in the hero row next to the samples sentence (`display: contents`).
 */
export function RepoInput({ initial, onSubmit }: { initial: string; onSubmit: (ref: RepoRef) => void }) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState('');
  const errorId = useId();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const ref = parseRepoInput(text);
    const typed = text.trim();
    if (ref) onSubmit(ref);
    setError(ref ? '' : typed ? `“${typed}” is not a GitHub repository. Use owner/name or a github.com URL.` : 'Paste a GitHub repository URL, or type owner/name.');
  };
  return (
    <form className="rr-repo" noValidate onSubmit={submit}>
      <label htmlFor={REPO_INPUT_ID} className="rr-sr">GitHub repository</label>
      <input id={REPO_INPUT_ID} type="text" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false}
        placeholder="github.com/owner/name" value={text} onChange={(e) => (setText(e.target.value), setError(''))}
        aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} />
      <button type="submit" className="rr-btn">Draw</button>
      {error && <p id={errorId} role="alert" className="rr-field-error">{error}</p>}
    </form>
  );
}

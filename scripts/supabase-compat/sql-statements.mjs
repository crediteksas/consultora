// Small SQL lexer for inventory/fingerprints, NOT a SQL authorization engine.
// Comments, quoted identifiers, strings and dollar-quoted bodies retain their
// boundaries: text inside a function must never look like a top-level GRANT.
export function sqlStatements(source) {
  const statements = [];
  let start = 0, i = 0, line = 1, startLine = 1, tokens = [];
  const advance = end => {
    line += (source.slice(i, end).match(/\n/g) || []).length;
    i = end;
  };
  const push = end => {
    if (tokens.length) statements.push({ raw: source.slice(start, end).trim(), line: startLine, tokens });
    start = end; startLine = line; tokens = [];
  };
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) { advance(i + 1); continue; }
    if (source.startsWith('--', i)) {
      const end = source.indexOf('\n', i + 2);
      advance(end < 0 ? source.length : end); continue;
    }
    if (source.startsWith('/*', i)) {
      let depth = 1, end = i + 2;
      while (end < source.length && depth) {
        if (source.startsWith('/*', end)) { depth++; end += 2; }
        else if (source.startsWith('*/', end)) { depth--; end += 2; }
        else end++;
      }
      if (depth) throw new Error('Unterminated SQL comment');
      advance(end); continue;
    }
    if (!tokens.length) startLine = line;
    if (c === "'" || c === '"') {
      let end = i + 1, closed = false;
      // Backslash escapes belong only to E'...' SQL literals, not ordinary text.
      const escaped = c === "'" && /(?:^|[^\w$])[eE]$/.test(source.slice(Math.max(0, i - 2), i));
      while (end < source.length) {
        if (escaped && source[end] === '\\') { end += 2; continue; }
        if (source[end] === c) {
          if (source[end + 1] === c) { end += 2; continue; }
          end++; closed = true; break;
        }
        end++;
      }
      if (!closed) throw new Error('Unterminated SQL quote');
      const raw = source.slice(i, end);
      tokens.push({ kind: c === '"' ? 'identifier' : 'literal', value: c === '"' ? raw.slice(1, -1).replaceAll('""', '"') : raw });
      advance(end); continue;
    }
    const dollar = source.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0];
    if (dollar) {
      const end = source.indexOf(dollar, i + dollar.length);
      if (end < 0) throw new Error('Unterminated SQL dollar quote');
      tokens.push({ kind: 'body', value: dollar });
      advance(end + dollar.length); continue;
    }
    if (c === ';') { advance(i + 1); push(i); continue; }
    const word = source.slice(i).match(/^[A-Za-z_][A-Za-z_0-9$]*/)?.[0];
    if (word) {
      tokens.push({ kind: 'word', value: word.toLowerCase() });
      advance(i + word.length); continue;
    }
    tokens.push({ kind: 'symbol', value: c }); advance(i + 1);
  }
  push(i);
  return statements;
}

export function createdObjects(statements) {
  const result = [];
  for (const statement of statements) {
    const t = statement.tokens;
    const word = i => t[i]?.kind === 'word' ? t[i].value : null;
    if (word(0) !== 'create') continue;
    let i = 1;
    if (word(i) === 'or' && word(i + 1) === 'replace') i += 2;
    if (word(i) === 'unlogged' || word(i) === 'temporary' || word(i) === 'temp') i++;
    let kind = word(i++);
    if (kind === 'materialized' && word(i) === 'view') { kind = 'materialized view'; i++; }
    if (!['table', 'view', 'materialized view', 'sequence', 'function', 'procedure'].includes(kind)) continue;
    if (word(i) === 'if' && word(i + 1) === 'not' && word(i + 2) === 'exists') i += 3;
    const identifier = token => token && ['word', 'identifier'].includes(token.kind);
    if (!identifier(t[i])) continue;
    let schema = null, name = t[i++].value;
    if (t[i]?.value === '.' && identifier(t[i + 1])) { schema = name; name = t[i + 1].value; }
    result.push({ schema, name, kind, line: statement.line });
  }
  return result;
}

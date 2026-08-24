const DOLLAR_TAG = /^\$[A-Za-z_]*\$/;

/**
 * Split SQL into individual statements on semicolons — but not the ones inside
 * a quoted string, a $$ ... $$ block, or a comment.
 *
 * All three exceptions are load-bearing here: the schema has a DO block whose
 * body is full of semicolons, and comments that contain apostrophes ("the
 * maths"). Miss the comment case and one stray apostrophe silently glues the
 * rest of the file into a single broken statement.
 */
export function splitStatements(sql) {
  const statements = [];
  let current = "";
  let i = 0;

  const push = () => {
    if (hasSql(current)) statements.push(current.trim());
    current = "";
  };

  while (i < sql.length) {
    const char = sql[i];
    const pair = sql.slice(i, i + 2);

    // -- line comment
    if (pair === "--") {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? sql.length : end;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }

    // /* block comment */ (Postgres allows nesting)
    if (pair === "/*") {
      let depth = 1;
      let j = i + 2;
      while (j < sql.length && depth > 0) {
        const next = sql.slice(j, j + 2);
        if (next === "/*") {
          depth += 1;
          j += 2;
        } else if (next === "*/") {
          depth -= 1;
          j += 2;
        } else {
          j += 1;
        }
      }
      current += sql.slice(i, j);
      i = j;
      continue;
    }

    // 'string literal', where '' is an escaped quote
    if (char === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") j += 2;
          else break;
        } else {
          j += 1;
        }
      }
      current += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    // "quoted identifier"
    if (char === '"') {
      const end = sql.indexOf('"', i + 1);
      const stop = end === -1 ? sql.length : end + 1;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }

    // $tag$ ... $tag$
    if (char === "$") {
      const match = sql.slice(i, i + 32).match(DOLLAR_TAG);
      if (match) {
        const tag = match[0];
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? sql.length : end + tag.length;
        current += sql.slice(i, stop);
        i = stop;
        continue;
      }
    }

    if (char === ";") {
      push();
      i += 1;
      continue;
    }

    current += char;
    i += 1;
  }

  push();
  return statements;
}

/**
 * Is there anything here besides whitespace and `--` comments? Written as a
 * line filter rather than one regex: the obvious pattern for this backtracks
 * catastrophically on comment-heavy input.
 */
function hasSql(chunk) {
  return chunk
    .split("\n")
    .some((line) => line.trim() !== "" && !line.trim().startsWith("--"));
}

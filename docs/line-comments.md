# Line comments

The surface parser and REPL accept `--` comments through the end of the line:

```text
-- Define a value for this session.
def one := Succ 0 -- one successor of zero
one -- ask for its type
exit -- finish the session
```

Comment-only REPL lines produce no result. The parser preserves line breaks and
character positions when skipping comments, including CRLF input. This adds line
comments only; it does not add block comments or multi-line REPL commands.

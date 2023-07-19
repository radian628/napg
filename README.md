# NAPG - Not Another Parser Generator

NAPG is a library for making recursive-descent parsers _in_ TypeScript, _with_ TypeScript. Its design goals are as follows:

1. All output should be as typesafe as reasonably possible.
2. No information should be lost in the output syntax tree.
3. A user of this library can output whatever data structure they want.
4. Parsers can have complete control over errors.
5. Parsers should have support for memoization to eliminate the performance penalty of backtracking.
6. Parsers should be able to function incrementally--- i.e. a change to a file shouldn't require that the entire file is re-parsed.

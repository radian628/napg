# NAPG - Not Another Parser Generator!

NAPG is a library for making recursive-descent parsers _in_ TypeScript, _with_ TypeScript. Its design goals are as follows:

1. All output should be as typesafe as reasonably possible.
2. No information should be lost in the output syntax tree.
3. A user of this library can output whatever data structure they want.
4. Parsers can have complete control over errors.
5. Parsers should have support for memoization to eliminate the performance penalty of backtracking.
6. Parsers should be able to function incrementally--- i.e. a change to a file shouldn't require that the entire file is re-parsed.

Due to the constraints above, NAPG is more suited toward writing compilers and tooling for _programming languages_, as opposed to, say, writing something to parse 10GB of JSON, or other massive amounts of data. Feature-completeness, developer experience, and expressivity are valued above performance for this project.

## Okay, but how do I use it?

[Here is a complete example use case for a four-function calculator.](https://github.com/radian628/napg/blob/main/test/four-function-calc.ts)

[For a more complex example, here is the parser for the Regex-like language that NAPG uses for tokens.](https://github.com/radian628/napg/blob/main/src/pattern.ts)

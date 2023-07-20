import {
  Lexer,
  Parselet,
  Parser,
  Positioned,
  Token,
  position,
} from "./immutable-api.js";

export {
  Token,
  Parselet,
  Lexer,
  Parser,
  parserFromLexer,
  lexerFromString,
  position,
  Positioned,
} from "./immutable-api.js";

export function pos<T extends Positioned>(t: T) {
  return t[position];
}

export interface MutableLexerInterface<ErrorMessage = string> {
  match(symbol: string | readonly string[] | RegExp): string | undefined;
  err(msg: ErrorMessage): never;
}

export function token<TokenType = string, ErrorMessage = string>(
  fn: (lexer: MutableLexerInterface<ErrorMessage>) => TokenType
): Token<TokenType, ErrorMessage> {
  return {
    type: "token",
    lex(lexer) {
      let newLexer = lexer as Lexer;
      const output = fn({
        match(symbol) {
          const [output, lexer2] = newLexer.match(symbol);
          newLexer = lexer2;
          return output;
        },
        err: (msg) => lexer.err(msg),
      });
      return [output, newLexer];
    },
  };
}

export interface MutableParserInterface<
  State,
  ErrorType,
  ErrorMessage = string
> {
  parse<OutputType>(
    symbol: Parselet<OutputType, State, ErrorType, ErrorMessage>,
    state: State
  ): (OutputType & Positioned) | (ErrorType & Positioned);
  lex<OutputType>(
    symbol: Token<OutputType, ErrorMessage>
  ): OutputType | ErrorType;
  err(msg: ErrorMessage): never;
  isErr<OutputType>(node: OutputType | ErrorType): node is ErrorType;
  state: State;
  positionify<OutputType>(t: OutputType): OutputType & Positioned;
  isNext<OutputType>(symbol: Token<OutputType, ErrorMessage>): boolean;
  getParserSnapshot(): Parser<State, ErrorType, ErrorMessage>;
  setParserSnapshot(snapshot: Parser<State, ErrorType, ErrorMessage>): void;
}

export function parselet<NodeType, State, ErrorType, ErrorMessage = string>(
  fn: (
    parser: MutableParserInterface<State, ErrorType, ErrorMessage>
  ) => NodeType
): Parselet<NodeType, State, ErrorType, ErrorMessage> {
  return {
    type: "parselet",
    parse(parser) {
      const startPos = parser.position;
      let newParser = parser as Parser<State, ErrorType, ErrorMessage>;
      let encounteredErrNormally = false;
      try {
        const output = fn({
          parse(symbol, newState) {
            const [output, parser2] = newParser.parse(symbol, newState);
            const parser2Clone = parser2.clone();
            parser2Clone.state = newParser.state;
            newParser = parser2Clone;
            return output;
          },
          lex(symbol) {
            const [output, parser2] = newParser.lex(symbol);
            newParser = parser2;
            return output;
          },
          err: (msg) => {
            encounteredErrNormally = true;
            return parser.err(msg);
          },
          isErr: parser.isErr,
          state: parser.state,
          positionify(t) {
            return {
              ...t,
              [position]: {
                start: startPos,
                end: newParser.position,
              },
            };
          },
          isNext(symbol) {
            const [output] = newParser.lex(symbol);
            return !parser.isErr(output);
          },
          getParserSnapshot() {
            return newParser;
          },
          setParserSnapshot(snapshot) {
            newParser = snapshot;
          },
        });
        //   const newParserClone = newParser.clone();
        //   newParserClone.state = parser.state;
        return [output, newParser];
      } catch (err) {
        if (encounteredErrNormally) {
          const errAsNode = err as ErrorType;
          return [errAsNode, newParser];
        } else {
          const errAsNode = newParser.options.makeUnhandledError(err);
          return [errAsNode, newParser];
        }
      }
    },
  };
}

// TODO: Add lexer positioning info
// TODO: Add "is this the next token?"

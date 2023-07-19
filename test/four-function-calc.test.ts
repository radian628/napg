import * as napg from "../dist/index.js";

const numberToken = napg.token(/^[0-9]+/);
const opToken = napg.token(["+", "-", "*", "/"]);
const openParenToken = napg.token("(");
const closeParenToken = napg.token(")");

type FourFunctionCalcParser = napg.ParseInput<ErrorNode>;

type ErrorNode = {
  type: "error";
  reason: string;
};

type NumberNode = {
  type: "number";
  number: number;
};

type BinaryOpNode = {
  type: "binary-op";
  left: ExpressionNode;
  right: ExpressionNode;
  op: string;
};

type ExpressionNode = NumberNode | BinaryOpNode;

const parse = napg.makeParseFn<undefined, ErrorNode>({
  positionProperty: "pos",
  defaultErrorNode: (err) => {
    return {
      type: "error",
      reason: `INTERNAL UNCAUGHT ERROR: ${err?.toString()}`,
    };
  },
});

const expressionNode = napg.parselet((input: FourFunctionCalcParser) => {
  input.pushState();
  const parsed = parse(input, binaryOpNode, undefined);
  input.popState();
  if (parsed.type !== "error") return parsed;
  input.pushState();
});

const numberNode = napg.parselet<undefined, NumberNode, ErrorNode>(
  (input: FourFunctionCalcParser) => {
    const number = Number(input.expect(numberToken, "Expected a number."));

    return {
      type: "number",
      number,
    };
  }
);

const binaryOpNode = napg.parselet((input: FourFunctionCalcParser) => {
  const left = parse(input, expressionNode, undefined);
  const op = input.expect(opToken, "Expected an operator.");
  const right = parse(input, expressionNode, undefined);

  return {
    type: "expression" as const,
    left,
    right,
    op,
  };
});

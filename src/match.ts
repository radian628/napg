// opcode format:
// lower 29 bits: unicode code point
// 30th and 31st bits:
// 0: default
// 1: kleene star
// 2: union start
// 3: union end
// 4: concat start
// 5: concat end

const isConcatEnd = (opcode: number) => {
  return opcode >> 25 === 5;
};
const isUnionEnd = (opcode: number) => {
  return opcode >> 25 === 3;
};

export type PatternIter = {
  data: number[];
  index: number;
};

export type StringIterator = {
  next: () => string;
  getpos: () => number;
  setpos: (n: number) => void;
};

export function match(pattern: PatternIter, str: StringIterator) {
  function matchAny(pattern: PatternIter) {
    const opcode = pattern.data[pattern.index] >> 25;

    switch (opcode) {
      case 0: {
        const nextchar = str.next();
        return String.fromCharCode(pattern.data[pattern.index++]) === nextchar;
      }
      case 1:
        pattern.index++;
        return matchKleeneStar(pattern);
      case 2:
        pattern.index++;
        return matchUnion(pattern);
      case 4:
        pattern.index++;
        return matchConcat(pattern);
    }

    return false;
  }

  function matchConcat(pattern: PatternIter) {
    while (!isConcatEnd(pattern.data[pattern.index])) {
      if (!matchAny(pattern)) return false;
    }

    pattern.index++;

    return true;
  }

  function matchKleeneStar(pattern: PatternIter) {
    const previndex = pattern.index;

    while (matchAny(pattern)) {
      pattern.index = previndex;
    }

    return true;
  }

  function matchUnion(pattern: PatternIter) {
    while (!isUnionEnd(pattern.data[pattern.index])) {
      const pos = str.getpos();
      if (matchAny(pattern)) {
        while (!isUnionEnd(pattern.data[pattern.index])) pattern.index++;
        pattern.index++;
        return true;
      }

      str.setpos(pos);
    }

    // no variants matched
    return false;
  }

  return matchAny(pattern);
}

export function matchStr(pattern: number[], str: string) {
  let strindex = 0;
  return match(
    {
      data: pattern,
      index: 0,
    },
    {
      next: () => {
        return str[strindex++];
      },
      getpos: () => strindex,
      setpos: (i: number) => (strindex = i),
    }
  );
}

// string to pattern
export function str(string: string) {
  if (string.length === 1) return [string.codePointAt(0) as number];

  return [
    (2 << 24) * 4,
    ...string.split("").map((s) => {
      return s.codePointAt(0) as number;
    }),
    (2 << 24) * 5,
  ];
}

export function concat(...args: (number[] | string)[]) {
  return [
    (2 << 24) * 4,
    ...args
      .map((a) => {
        return typeof a === "string" ? str(a) : a;
      })
      .flat(1),
    (2 << 24) * 5,
  ];
}

// a|b
export function union(...args: (number[] | string)[]) {
  return [
    (2 << 24) * 2,
    ...args
      .map((a) => {
        return typeof a === "string" ? str(a) : a;
      })
      .flat(1),
    (2 << 24) * 3,
  ];
}

// x*
export function kleene(opcodes: number[]) {
  return [(2 << 24) * 1, ...opcodes];
}

// x?
export function maybe(opcodes: number[]) {
  return union(opcodes, str(""));
}

export function repeat(count: number, opcodes: number[]) {
  return concat(...new Array(count).fill(opcodes).flat(1));
}

export function atleast(count: number, opcodes: number[]) {
  return concat(...new Array(count).fill(opcodes).flat(1), kleene(opcodes));
}

export function between(lo: number, hi: number, opcodes: number[]) {
  return concat(
    ...new Array(lo).fill(opcodes),
    ...new Array(hi - lo).fill(maybe(opcodes))
  );
}

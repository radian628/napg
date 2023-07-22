# Roadmap

Progress on the design goals from the README:

1. Output is typesafe, so this is satisfied.
2. I've got essentially everything aside from some minor (but acceptable) ordering issues with skip tokens.
3. Essentially complete aside from the problem of attaching position and skipToken info. This is not a big deal though.
4. Essentially complete with the error node system.
5. Not implemented yet. However, parselet memoization should be fairly simple, perhaps with a trie for each state object.
   - Each parselet's cache depends on state and next chars
   - Each state is cached with a `hash` function and an `eq` function. Both have defaults that should work for typical use cases (npm `object-hash` and a simple nested object and array-based deep equality algorithm)
6. Not implemented yet.

## Incremental

Idea: Along with every node, store a parser snapshot dated immediately prior to parsing that node. Then when the source string changes, some swapping might be necessary.

When something changes, I need to do the following:

1. Perform a replace operation on the rope.
2. Parse the root node as normal.
3. When parsing a node, if it fits the following criteria, it can be memoized:
   - Its range must be entirely before or after the range that was edited
   - Its state and its position must match a known state and position. Positions are shifted to take into account the fact that there might be more or less chars in the replacement.

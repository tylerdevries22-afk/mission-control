const assert = require('node:assert/strict')
const { test } = require('node:test')
const braces = require('braces')

test('patched braces preserves ordinary glob compilation, expansion and AST serialization', () => {
  assert.equal(braces.compile('src/{lib,app}/*.ts'), 'src/(lib|app)/*.ts')
  assert.deepEqual(braces.expand('file-{1..3}.ts'), ['file-1.ts', 'file-2.ts', 'file-3.ts'])
  const pattern = 'src/{lib,app}/test.ts'
  assert.equal(braces.stringify(braces.parse(pattern)), pattern)
})

test('deep brace and parenthesis inputs fail before recursive traversal', () => {
  for (const [open, close] of [['{', '}'], ['(', ')']]) {
    const pattern = open.repeat(4096) + 'a,b' + close.repeat(4096)
    for (const operation of ['parse', 'compile', 'expand', 'stringify']) {
      assert.throws(() => braces[operation](pattern), {
        name: 'SyntaxError', message: /safe traversal limits/,
      })
    }
  }
})

test('caller-supplied deep or cyclic ASTs are bounded for every walker', () => {
  let deep = { type: 'text', value: 'safe' }
  for (let i = 0; i < 300; i++) deep = { type: 'brace', nodes: [deep] }
  const cycle = { type: 'root', nodes: [] }
  cycle.nodes.push(cycle)
  for (const ast of [deep, cycle, { type: 'root', nodes: Array(65537).fill({ type: 'text', value: 'a' }) }]) {
    for (const operation of ['compile', 'expand', 'stringify']) {
      assert.throws(() => braces[operation](ast), {
        name: 'SyntaxError', message: /safe traversal limits/,
      })
    }
  }
})

const { graphqlWXServer } = require('./dist')

var { buildSchema } = require('graphql')

// 使用 GraphQL Schema Language 创建一个 schema
var schema = buildSchema(`
  type Query {
    rollDice(numDice: Int!, numSides: Int): [Int]
  }
`)

// root 提供所有 API 入口端点相应的解析器函数
var root = {
	rollDice: (args, context) => {
		console.log({ args, context })
		const { numDice, numSides } = args
		return [numDice, numSides]
	},
}

graphqlWXServer({
	wxParams: {
		variables: {
			dice: 1,
			sides: 3,
		},
		operationName: 'RollDice',
		query: `
        query RollDice($dice: Int!, $sides: Int) {
          rollDice(numDice: $dice, numSides: $sides)
        }
      `,
	},
	context: { id: 'graphqlWXServer' },
	schema: schema,
	rootValue: root,
}).then((res) => {
	console.log(JSON.stringify(res))
})

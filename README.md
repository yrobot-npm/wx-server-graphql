# GraphQL WX-Cloud-Server Middleware

## Installation

```sh
npm install --save wx-server-graphql
```

## Simple Setup

Just mount `wx-server-graphql` as the `/graphql` handler:

graphql.js

```js
// 云函数入口文件
const cloud = require('wx-server-sdk')
const graphqlWXServer = require('wx-server-graphql')
var { buildSchema } = require('graphql')

// 使用 GraphQL Schema Language 创建一个 schema
var schema = buildSchema(`
  type Query {
    hello: String
  }
`)

// root 提供所有 API 入口端点相应的解析器函数
var root = {
	hello: () => {
		return 'Hello world!'
	},
}

cloud.init()

// 云函数入口函数
exports.main = async (event, context) =>
	graphqlWXServer({
		params: event,
		schema: schema,
		rootValue: root,
	})
```

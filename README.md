# GraphQL WX-Cloud-Server Middleware

## Installation

```sh
npm install --save wx-server-graphql
```

## Server Simple Example

Just mount `wx-server-graphql` as the `/graphql` handler:

graphql/index.js

```js
// 云函数入口文件
const cloud = require('wx-server-sdk')
const { graphqlWXServer } = require('wx-server-graphql')
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
	await graphqlWXServer({
		wxParams: event,
		context,
		schema: schema,
		rootValue: root,
	})
```

## Client Simple Example
apolloProvider.js
```js
import React from 'react'
import { ApolloClient } from 'apollo-client'
import { ApolloProvider } from '@apollo/react-hooks'
import { InMemoryCache } from 'apollo-cache-inmemory'
import { ApolloLink, Observable } from 'apollo-link'

// 利用link重置apolloClient请求grapql的方式为wx.cloud.callFunction
// 参考文档 https://www.apollographql.com/blog/apollo-link-creating-your-custom-graphql-client-c865be0ce059/
class WXLink extends ApolloLink {
	constructor(options = {}) {
		super()
		this.options = options
	}
	request(operation) {
		return new Observable((observer) => {
			wx.cloud.callFunction({
				name: this.options.name || 'graphql',
				data: operation,
				success: function (res) {
					observer.next(res)
					observer.complete()
				},
				fail: observer.error,
			})
		})
	}
}

wx.cloud.init({
	env: 'env-id',
})

const client = new ApolloClient({
	link: new WXLink({
		name: 'graphql',
	}),
	cache: new InMemoryCache(),
})

export const Provider = ({ children }) => (
	<ApolloProvider client={client}>{children}</ApolloProvider>
)
```

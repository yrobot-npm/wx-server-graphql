import type {
  ASTVisitor,
  DocumentNode,
  ValidationRule,
  ValidationContext,
  ExecutionArgs,
  ExecutionResult,
  FormattedExecutionResult,
  GraphQLError,
  GraphQLSchema,
  GraphQLFieldResolver,
  GraphQLTypeResolver,
  GraphQLFormattedError,
} from 'graphql';
import {
  Source,
  parse,
  validate,
  execute,
  formatError,
  validateSchema,
  getOperationAST,
  specifiedRules,
} from 'graphql';

type MaybePromise<T> = Promise<T> | T;

export type Options = OptionsData;


/**
 * All information about a GraphQL request.
 */
export interface RequestInfo {
  /**
   * The parsed GraphQL document.
   */
  document: DocumentNode;

  /**
   * The variable values used at runtime.
   */
  variables: { readonly [name: string]: unknown } | null;

  /**
   * The (optional) operation name requested.
   */
  operationName: string | null;

  /**
   * The result of executing the operation.
   */
  result: FormattedExecutionResult;

  /**
   * A value to pass as the context to the graphql() function.
   */
  context?: unknown;
}

export interface OptionsData {
  /**
   * props from wx-cloud-serv func param
   */
  wxParams: any;

  /**
   * A GraphQL schema from graphql-js.
   */
  schema: GraphQLSchema;

  /**
   * A value to pass as the context to this middleware.
   */
  context?: unknown;

  /**
   * An object to pass as the rootValue to the graphql() function.
   */
  rootValue?: unknown;

  /**
   * A boolean to configure whether the output should be pretty-printed.
   */
  pretty?: boolean;

  /**
   * An optional array of validation rules that will be applied on the document
   * in additional to those defined by the GraphQL spec.
   */
  validationRules?: ReadonlyArray<(ctx: ValidationContext) => ASTVisitor>;

  /**
   * An optional function which will be used to validate instead of default `validate`
   * from `graphql-js`.
   */
  customValidateFn?: (
    schema: GraphQLSchema,
    documentAST: DocumentNode,
    rules: ReadonlyArray<ValidationRule>,
  ) => ReadonlyArray<GraphQLError>;

  /**
   * An optional function which will be used to execute instead of default `execute`
   * from `graphql-js`.
   */
  customExecuteFn?: (args: ExecutionArgs) => MaybePromise<ExecutionResult>;

  /**
   * An optional function which will be used to format any errors produced by
   * fulfilling a GraphQL operation. If no function is provided, GraphQL's
   * default spec-compliant `formatError` function will be used.
   */
  customFormatErrorFn?: (error: GraphQLError) => GraphQLFormattedError;

  /**
   * An optional function which will be used to create a document instead of
   * the default `parse` from `graphql-js`.
   */
  customParseFn?: (source: Source) => DocumentNode;

  /**
   * `formatError` is deprecated and replaced by `customFormatErrorFn`. It will
   *  be removed in version 1.0.0.
   */
  formatError?: (error: GraphQLError) => GraphQLFormattedError;

  /**
   * An optional function for adding additional metadata to the GraphQL response
   * as a key-value object. The result will be added to "extensions" field in
   * the resulting JSON. This is often a useful place to add development time
   * info such as the runtime of a query or the amount of resources consumed.
   *
   * Information about the request is provided to be used.
   *
   * This function may be async.
   */
  extensions?: (
    info: RequestInfo,
  ) => MaybePromise<undefined | { [key: string]: unknown }>;

  /**
   * A resolver function to use when one is not provided by the schema.
   * If not provided, the default field resolver is used (which looks for a
   * value or method on the source value with the field's name).
   */
  fieldResolver?: GraphQLFieldResolver<unknown, unknown>;

  /**
   * A type resolver function to use when none is provided by the schema.
   * If not provided, the default type resolver is used (which looks for a
   * `__typename` field or alternatively calls the `isTypeOf` method).
   */
  typeResolver?: GraphQLTypeResolver<unknown, unknown>;
}

const httpError = (statusCode: number, message: string, errDtails = {}) => {
  return { statusCode, message, ...errDtails }
}

export async function graphqlWXServer(options: Options): Promise<any> {
  // Higher scoped variables are referred to at various stages in the asynchronous state machine below.
  let params: GraphQLParams | undefined;
  let formatErrorFn = formatError;
  let pretty = false;
  let result: ExecutionResult;

  try {
    // Parse the Request to get GraphQL request parameters.
    params = await getGraphQLParams(options.wxParams);

    const optionsData = options;
    const schema = optionsData.schema;
    const rootValue = optionsData.rootValue;
    const validationRules = optionsData.validationRules ?? [];
    const fieldResolver = optionsData.fieldResolver;
    const typeResolver = optionsData.typeResolver;
    // const extensionsFn = optionsData.extensions;
    const context = optionsData.context;
    const parseFn = optionsData.customParseFn ?? parse;
    const executeFn = optionsData.customExecuteFn ?? execute;
    const validateFn = optionsData.customValidateFn ?? validate;

    pretty = optionsData.pretty ?? false;
    formatErrorFn =
      optionsData.customFormatErrorFn ??
      optionsData.formatError ??
      formatErrorFn;

    // Assert that schema is required.
    if (schema == null) {
      throw httpError(
        500,
        'GraphQL middleware options must contain a schema.',
      );
    }

    // Get GraphQL params from the wx-cloud-server event
    const { query, variables, operationName } = params;

    // If there is no query, but GraphiQL will be displayed, do not produce
    // a result, otherwise return a 400: Bad Request.
    if (query == null) {
      throw httpError(400, 'Must provide query string.');
    }

    // Validate Schema
    const schemaValidationErrors = validateSchema(schema);
    if (schemaValidationErrors.length > 0) {
      // Return 500: Internal Server Error if invalid schema.
      throw httpError(500, 'GraphQL schema validation error.', {
        graphqlErrors: schemaValidationErrors,
      });
    }

    // Parse source to AST, reporting any syntax error.
    let documentAST;
    try {
      documentAST = parseFn(new Source(query, 'GraphQL request'));
    } catch (syntaxError) {
      // Return 400: Bad Request if any syntax errors errors exist.
      throw httpError(400, 'GraphQL syntax error.', {
        graphqlErrors: [syntaxError],
      });
    }

    // Validate AST, reporting any errors.
    const validationErrors = validateFn(schema, documentAST, [
      ...specifiedRules,
      ...validationRules,
    ]);

    if (validationErrors.length > 0) {
      // Return 400: Bad Request if any validation errors exist.
      throw httpError(400, 'GraphQL validation error.', {
        graphqlErrors: validationErrors,
      });
    }

    // Perform the execution, reporting any errors creating the context.
    try {
      result = await executeFn({
        schema,
        document: documentAST,
        rootValue,
        contextValue: context,
        variableValues: variables,
        operationName,
        fieldResolver,
        typeResolver,
      });
    } catch (contextError) {
      // Return 400: Bad Request if any execution context errors exist.
      throw httpError(400, 'GraphQL execution context error.', {
        graphqlErrors: [contextError],
      });
    }

  } catch (error) {
    result = { data: undefined, errors: error.graphqlErrors || [error] };
  }

  return result
}

export interface GraphQLParams {
  query: string | null;
  variables: { readonly [name: string]: unknown } | null;
  operationName: string | null;
  raw: boolean;
}

/**
 *  Provided the event from wx-cloud-server main func param
 *  Promise the GraphQL request parameters.
 */
export async function getGraphQLParams(
  param: any,
): Promise<GraphQLParams> {

  // GraphQL Query string.
  let query = param.query
  if (typeof query !== 'string') {
    query = null;
  }

  // Parse the variables if needed.
  let variables = param.variables
  if (typeof variables === 'string') {
    try {
      variables = JSON.parse(variables);
    } catch (error) {
      throw httpError(400, 'Variables are invalid JSON.');
    }
  } else if (typeof variables !== 'object') {
    variables = null;
  }

  // Name of GraphQL operation to execute.
  let operationName = param.operationName
  if (typeof operationName !== 'string') {
    operationName = null;
  }

  const raw = param.raw

  return { query, variables, operationName, raw };
}

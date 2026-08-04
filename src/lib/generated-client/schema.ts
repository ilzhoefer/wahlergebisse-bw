// This file is auto-generated. Do not edit manually.
// @generated
/* eslint-disable */
// biome-ignore-all lint: This file is auto-generated
// biome-ignore-all assist: This file is auto-generated
// biome-ignore-all syntax: This file is auto-generated
import type { IntrospectionQuery } from 'graphql';
export const schema = {
	__schema: {
		queryType: { name: 'Query', kind: 'OBJECT', __proto__: null },
		mutationType: null,
		subscriptionType: null,
		types: [
			{ kind: 'SCALAR', name: 'BigInt' },
			{
				kind: 'INPUT_OBJECT',
				name: 'BigIntWhereInputArgument',
				isOneOf: void 0,
				inputFields: [
					{
						name: 'AND',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: {
									name: 'BigIntWhereInputArgument',
									kind: 'INPUT_OBJECT',
									ofType: null,
									__proto__: null
								}
							}
						},
						defaultValue: void 0
					},
					{
						name: 'NOT',
						type: {
							kind: 'INPUT_OBJECT',
							name: 'BigIntWhereInputArgument',
							ofType: null,
							__proto__: null
						},
						defaultValue: void 0
					},
					{
						name: 'OR',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: {
									name: 'BigIntWhereInputArgument',
									kind: 'INPUT_OBJECT',
									ofType: null,
									__proto__: null
								}
							}
						},
						defaultValue: void 0
					},
					{
						name: 'eq',
						type: { kind: 'SCALAR', name: 'BigInt', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'gt',
						type: { kind: 'SCALAR', name: 'BigInt', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'gte',
						type: { kind: 'SCALAR', name: 'BigInt', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'in',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'BigInt', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'isNotNull',
						type: { kind: 'SCALAR', name: 'Boolean', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'isNull',
						type: { kind: 'SCALAR', name: 'Boolean', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'lt',
						type: { kind: 'SCALAR', name: 'BigInt', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'lte',
						type: { kind: 'SCALAR', name: 'BigInt', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'ne',
						type: { kind: 'SCALAR', name: 'BigInt', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'notIn',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'BigInt', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					}
				]
			},
			{ kind: 'SCALAR', name: 'Boolean' },
			{
				kind: 'INPUT_OBJECT',
				name: 'BooleanWhereInputArgument',
				isOneOf: void 0,
				inputFields: [
					{
						name: 'AND',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: {
									name: 'BooleanWhereInputArgument',
									kind: 'INPUT_OBJECT',
									ofType: null,
									__proto__: null
								}
							}
						},
						defaultValue: void 0
					},
					{
						name: 'NOT',
						type: {
							kind: 'INPUT_OBJECT',
							name: 'BooleanWhereInputArgument',
							ofType: null,
							__proto__: null
						},
						defaultValue: void 0
					},
					{
						name: 'OR',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: {
									name: 'BooleanWhereInputArgument',
									kind: 'INPUT_OBJECT',
									ofType: null,
									__proto__: null
								}
							}
						},
						defaultValue: void 0
					},
					{
						name: 'arrayContained',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'Boolean', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'arrayContains',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'Boolean', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'arrayOverlaps',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'Boolean', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'eq',
						type: { kind: 'SCALAR', name: 'Boolean', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'in',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'Boolean', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'isNotNull',
						type: { kind: 'SCALAR', name: 'Boolean', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'isNull',
						type: { kind: 'SCALAR', name: 'Boolean', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'ne',
						type: { kind: 'SCALAR', name: 'Boolean', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'notIn',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'Boolean', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					}
				]
			},
			{ kind: 'SCALAR', name: 'Bytes' },
			{ kind: 'SCALAR', name: 'Date' },
			{ kind: 'SCALAR', name: 'DateTime' },
			{
				kind: 'INPUT_OBJECT',
				name: 'DateTimeWhereInputArgument',
				isOneOf: void 0,
				inputFields: [
					{
						name: 'AND',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: {
									name: 'DateTimeWhereInputArgument',
									kind: 'INPUT_OBJECT',
									ofType: null,
									__proto__: null
								}
							}
						},
						defaultValue: void 0
					},
					{
						name: 'NOT',
						type: {
							kind: 'INPUT_OBJECT',
							name: 'DateTimeWhereInputArgument',
							ofType: null,
							__proto__: null
						},
						defaultValue: void 0
					},
					{
						name: 'OR',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: {
									name: 'DateTimeWhereInputArgument',
									kind: 'INPUT_OBJECT',
									ofType: null,
									__proto__: null
								}
							}
						},
						defaultValue: void 0
					},
					{
						name: 'arrayContained',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'DateTime', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'arrayContains',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'DateTime', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'arrayOverlaps',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'DateTime', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'eq',
						type: { kind: 'SCALAR', name: 'DateTime', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'gt',
						type: { kind: 'SCALAR', name: 'DateTime', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'gte',
						type: { kind: 'SCALAR', name: 'DateTime', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'in',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'DateTime', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'isNotNull',
						type: { kind: 'SCALAR', name: 'Boolean', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'isNull',
						type: { kind: 'SCALAR', name: 'Boolean', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'lt',
						type: { kind: 'SCALAR', name: 'DateTime', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'lte',
						type: { kind: 'SCALAR', name: 'DateTime', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'ne',
						type: { kind: 'SCALAR', name: 'DateTime', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'notIn',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'DateTime', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					}
				]
			},
			{
				kind: 'INPUT_OBJECT',
				name: 'DateWhereInputArgument',
				isOneOf: void 0,
				inputFields: [
					{
						name: 'AND',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: {
									name: 'DateWhereInputArgument',
									kind: 'INPUT_OBJECT',
									ofType: null,
									__proto__: null
								}
							}
						},
						defaultValue: void 0
					},
					{
						name: 'NOT',
						type: {
							kind: 'INPUT_OBJECT',
							name: 'DateWhereInputArgument',
							ofType: null,
							__proto__: null
						},
						defaultValue: void 0
					},
					{
						name: 'OR',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: {
									name: 'DateWhereInputArgument',
									kind: 'INPUT_OBJECT',
									ofType: null,
									__proto__: null
								}
							}
						},
						defaultValue: void 0
					},
					{
						name: 'arrayContained',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'Date', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'arrayContains',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'Date', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'arrayOverlaps',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'Date', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'eq',
						type: { kind: 'SCALAR', name: 'Date', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'gt',
						type: { kind: 'SCALAR', name: 'Date', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'gte',
						type: { kind: 'SCALAR', name: 'Date', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'ilike',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'in',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'Date', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'isNotNull',
						type: { kind: 'SCALAR', name: 'Boolean', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'isNull',
						type: { kind: 'SCALAR', name: 'Boolean', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'like',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'lt',
						type: { kind: 'SCALAR', name: 'Date', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'lte',
						type: { kind: 'SCALAR', name: 'Date', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'ne',
						type: { kind: 'SCALAR', name: 'Date', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'notIlike',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'notIn',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'Date', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'notLike',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					}
				]
			},
			{
				kind: 'OBJECT',
				name: 'ElectionDate',
				fields: [
					{
						name: 'date',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						args: []
					},
					{
						name: 'electionType',
						type: { kind: 'SCALAR', name: 'Int', ofType: null, __proto__: null },
						args: []
					}
				],
				interfaces: []
			},
			{
				kind: 'OBJECT',
				name: 'ElectionTypeOption',
				fields: [
					{
						name: 'electionDescription',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						args: []
					},
					{
						name: 'electionType',
						type: {
							kind: 'NON_NULL',
							ofType: { name: 'Int', kind: 'SCALAR', ofType: null, __proto__: null }
						},
						args: []
					}
				],
				interfaces: []
			},
			{ kind: 'SCALAR', name: 'Float' },
			{
				kind: 'INPUT_OBJECT',
				name: 'FloatWhereInputArgument',
				isOneOf: void 0,
				inputFields: [
					{
						name: 'AND',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: {
									name: 'FloatWhereInputArgument',
									kind: 'INPUT_OBJECT',
									ofType: null,
									__proto__: null
								}
							}
						},
						defaultValue: void 0
					},
					{
						name: 'NOT',
						type: {
							kind: 'INPUT_OBJECT',
							name: 'FloatWhereInputArgument',
							ofType: null,
							__proto__: null
						},
						defaultValue: void 0
					},
					{
						name: 'OR',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: {
									name: 'FloatWhereInputArgument',
									kind: 'INPUT_OBJECT',
									ofType: null,
									__proto__: null
								}
							}
						},
						defaultValue: void 0
					},
					{
						name: 'arrayContained',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'Float', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'arrayContains',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'Float', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'arrayOverlaps',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'Float', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'eq',
						type: { kind: 'SCALAR', name: 'Float', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'gt',
						type: { kind: 'SCALAR', name: 'Float', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'gte',
						type: { kind: 'SCALAR', name: 'Float', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'ilike',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'in',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'Float', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'isNotNull',
						type: { kind: 'SCALAR', name: 'Boolean', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'isNull',
						type: { kind: 'SCALAR', name: 'Boolean', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'like',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'lt',
						type: { kind: 'SCALAR', name: 'Float', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'lte',
						type: { kind: 'SCALAR', name: 'Float', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'ne',
						type: { kind: 'SCALAR', name: 'Float', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'notIlike',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'notIn',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'Float', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'notLike',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					}
				]
			},
			{ kind: 'SCALAR', name: 'ID' },
			{
				kind: 'INPUT_OBJECT',
				name: 'IDWhereInputArgument',
				isOneOf: void 0,
				inputFields: [
					{
						name: 'AND',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: {
									name: 'IDWhereInputArgument',
									kind: 'INPUT_OBJECT',
									ofType: null,
									__proto__: null
								}
							}
						},
						defaultValue: void 0
					},
					{
						name: 'NOT',
						type: {
							kind: 'INPUT_OBJECT',
							name: 'IDWhereInputArgument',
							ofType: null,
							__proto__: null
						},
						defaultValue: void 0
					},
					{
						name: 'OR',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: {
									name: 'IDWhereInputArgument',
									kind: 'INPUT_OBJECT',
									ofType: null,
									__proto__: null
								}
							}
						},
						defaultValue: void 0
					},
					{
						name: 'arrayContained',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'ID', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'arrayContains',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'ID', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'arrayOverlaps',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'ID', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'eq',
						type: { kind: 'SCALAR', name: 'ID', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'gt',
						type: { kind: 'SCALAR', name: 'ID', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'gte',
						type: { kind: 'SCALAR', name: 'ID', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'ilike',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'in',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'ID', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'isNotNull',
						type: { kind: 'SCALAR', name: 'Boolean', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'isNull',
						type: { kind: 'SCALAR', name: 'Boolean', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'like',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'lt',
						type: { kind: 'SCALAR', name: 'ID', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'lte',
						type: { kind: 'SCALAR', name: 'ID', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'ne',
						type: { kind: 'SCALAR', name: 'ID', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'notIlike',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'notIn',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'ID', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'notLike',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					}
				]
			},
			{ kind: 'SCALAR', name: 'Int' },
			{
				kind: 'INPUT_OBJECT',
				name: 'IntWhereInputArgument',
				isOneOf: void 0,
				inputFields: [
					{
						name: 'AND',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: {
									name: 'IntWhereInputArgument',
									kind: 'INPUT_OBJECT',
									ofType: null,
									__proto__: null
								}
							}
						},
						defaultValue: void 0
					},
					{
						name: 'NOT',
						type: {
							kind: 'INPUT_OBJECT',
							name: 'IntWhereInputArgument',
							ofType: null,
							__proto__: null
						},
						defaultValue: void 0
					},
					{
						name: 'OR',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: {
									name: 'IntWhereInputArgument',
									kind: 'INPUT_OBJECT',
									ofType: null,
									__proto__: null
								}
							}
						},
						defaultValue: void 0
					},
					{
						name: 'arrayContained',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'Int', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'arrayContains',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'Int', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'arrayOverlaps',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'Int', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'eq',
						type: { kind: 'SCALAR', name: 'Int', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'gt',
						type: { kind: 'SCALAR', name: 'Int', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'gte',
						type: { kind: 'SCALAR', name: 'Int', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'ilike',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'in',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'Int', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'isNotNull',
						type: { kind: 'SCALAR', name: 'Boolean', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'isNull',
						type: { kind: 'SCALAR', name: 'Boolean', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'like',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'lt',
						type: { kind: 'SCALAR', name: 'Int', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'lte',
						type: { kind: 'SCALAR', name: 'Int', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'ne',
						type: { kind: 'SCALAR', name: 'Int', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'notIlike',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'notIn',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'Int', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'notLike',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					}
				]
			},
			{ kind: 'SCALAR', name: 'JSON' },
			{
				kind: 'INPUT_OBJECT',
				name: 'JSONWhereInputArgument',
				isOneOf: void 0,
				inputFields: [
					{
						name: 'AND',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: {
									name: 'JSONWhereInputArgument',
									kind: 'INPUT_OBJECT',
									ofType: null,
									__proto__: null
								}
							}
						},
						defaultValue: void 0
					},
					{
						name: 'NOT',
						type: {
							kind: 'INPUT_OBJECT',
							name: 'JSONWhereInputArgument',
							ofType: null,
							__proto__: null
						},
						defaultValue: void 0
					},
					{
						name: 'OR',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: {
									name: 'JSONWhereInputArgument',
									kind: 'INPUT_OBJECT',
									ofType: null,
									__proto__: null
								}
							}
						},
						defaultValue: void 0
					},
					{
						name: 'arrayContained',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'JSON', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'arrayContains',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'JSON', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'arrayOverlaps',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'JSON', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'eq',
						type: { kind: 'SCALAR', name: 'JSON', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'in',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'JSON', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'isNotNull',
						type: { kind: 'SCALAR', name: 'Boolean', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'isNull',
						type: { kind: 'SCALAR', name: 'Boolean', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'ne',
						type: { kind: 'SCALAR', name: 'JSON', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'notIn',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'JSON', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					}
				]
			},
			{
				kind: 'OBJECT',
				name: 'Legend',
				fields: [
					{
						name: 'color',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						args: []
					},
					{
						name: 'entries',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'LegendEntry', kind: 'OBJECT', ofType: null, __proto__: null }
							}
						},
						args: []
					},
					{
						name: 'max',
						type: { kind: 'SCALAR', name: 'Float', ofType: null, __proto__: null },
						args: []
					},
					{
						name: 'min',
						type: { kind: 'SCALAR', name: 'Float', ofType: null, __proto__: null },
						args: []
					},
					{
						name: 'partyName',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						args: []
					},
					{
						name: 'type',
						type: {
							kind: 'NON_NULL',
							ofType: { name: 'String', kind: 'SCALAR', ofType: null, __proto__: null }
						},
						args: []
					}
				],
				interfaces: []
			},
			{
				kind: 'OBJECT',
				name: 'LegendEntry',
				fields: [
					{
						name: 'color',
						type: {
							kind: 'NON_NULL',
							ofType: { name: 'String', kind: 'SCALAR', ofType: null, __proto__: null }
						},
						args: []
					},
					{
						name: 'name',
						type: {
							kind: 'NON_NULL',
							ofType: { name: 'String', kind: 'SCALAR', ofType: null, __proto__: null }
						},
						args: []
					}
				],
				interfaces: []
			},
			{
				kind: 'OBJECT',
				name: 'MapModes',
				fields: [
					{
						name: 'possibleModes',
						type: {
							kind: 'NON_NULL',
							ofType: {
								kind: 'LIST',
								ofType: {
									kind: 'NON_NULL',
									ofType: { name: 'String', kind: 'SCALAR', ofType: null, __proto__: null }
								}
							}
						},
						args: []
					},
					{
						name: 'selectedMode',
						type: {
							kind: 'NON_NULL',
							ofType: { name: 'String', kind: 'SCALAR', ofType: null, __proto__: null }
						},
						args: []
					}
				],
				interfaces: []
			},
			{
				kind: 'OBJECT',
				name: 'PartyOption',
				fields: [
					{
						name: 'nameShort',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						args: []
					},
					{
						name: 'partyFamilyId',
						type: {
							kind: 'NON_NULL',
							ofType: { name: 'Int', kind: 'SCALAR', ofType: null, __proto__: null }
						},
						args: []
					}
				],
				interfaces: []
			},
			{
				kind: 'OBJECT',
				name: 'Query',
				fields: [
					{
						name: 'allElectionDates',
						type: {
							kind: 'NON_NULL',
							ofType: {
								kind: 'LIST',
								ofType: {
									kind: 'NON_NULL',
									ofType: { name: 'ElectionDate', kind: 'OBJECT', ofType: null, __proto__: null }
								}
							}
						},
						args: []
					},
					{
						name: 'electionTypes',
						type: {
							kind: 'NON_NULL',
							ofType: {
								kind: 'LIST',
								ofType: {
									kind: 'NON_NULL',
									ofType: {
										name: 'ElectionTypeOption',
										kind: 'OBJECT',
										ofType: null,
										__proto__: null
									}
								}
							}
						},
						args: []
					},
					{
						name: 'mapModes',
						type: {
							kind: 'NON_NULL',
							ofType: { name: 'MapModes', kind: 'OBJECT', ofType: null, __proto__: null }
						},
						args: [
							{
								name: 'electionType',
								type: {
									kind: 'NON_NULL',
									ofType: { name: 'Int', kind: 'SCALAR', ofType: null, __proto__: null }
								}
							}
						]
					},
					{
						name: 'parties',
						type: {
							kind: 'NON_NULL',
							ofType: {
								kind: 'LIST',
								ofType: {
									kind: 'NON_NULL',
									ofType: { name: 'PartyOption', kind: 'OBJECT', ofType: null, __proto__: null }
								}
							}
						},
						args: [
							{
								name: 'date',
								type: {
									kind: 'NON_NULL',
									ofType: { name: 'String', kind: 'SCALAR', ofType: null, __proto__: null }
								}
							},
							{
								name: 'electionType',
								type: {
									kind: 'NON_NULL',
									ofType: { name: 'Int', kind: 'SCALAR', ofType: null, __proto__: null }
								}
							}
						]
					},
					{
						name: 'regionData',
						type: {
							kind: 'NON_NULL',
							ofType: { name: 'RegionData', kind: 'OBJECT', ofType: null, __proto__: null }
						},
						args: [
							{
								name: 'date',
								type: {
									kind: 'NON_NULL',
									ofType: { name: 'String', kind: 'SCALAR', ofType: null, __proto__: null }
								}
							},
							{
								name: 'electionType',
								type: {
									kind: 'NON_NULL',
									ofType: { name: 'Int', kind: 'SCALAR', ofType: null, __proto__: null }
								}
							},
							{
								name: 'mapInformation',
								type: {
									kind: 'NON_NULL',
									ofType: { name: 'String', kind: 'SCALAR', ofType: null, __proto__: null }
								}
							},
							{
								name: 'mapMode',
								type: {
									kind: 'NON_NULL',
									ofType: { name: 'String', kind: 'SCALAR', ofType: null, __proto__: null }
								}
							},
							{
								name: 'party',
								type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null }
							},
							{
								name: 'voteType',
								type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null }
							}
						]
					}
				],
				interfaces: []
			},
			{
				kind: 'OBJECT',
				name: 'RegionData',
				fields: [
					{
						name: 'items',
						type: {
							kind: 'NON_NULL',
							ofType: {
								kind: 'LIST',
								ofType: {
									kind: 'NON_NULL',
									ofType: { name: 'RegionItem', kind: 'OBJECT', ofType: null, __proto__: null }
								}
							}
						},
						args: []
					},
					{
						name: 'keyField',
						type: {
							kind: 'NON_NULL',
							ofType: { name: 'String', kind: 'SCALAR', ofType: null, __proto__: null }
						},
						args: []
					},
					{
						name: 'legend',
						type: { kind: 'OBJECT', name: 'Legend', ofType: null, __proto__: null },
						args: []
					}
				],
				interfaces: []
			},
			{
				kind: 'OBJECT',
				name: 'RegionItem',
				fields: [
					{
						name: 'color',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						args: []
					},
					{
						name: 'key',
						type: {
							kind: 'NON_NULL',
							ofType: { name: 'String', kind: 'SCALAR', ofType: null, __proto__: null }
						},
						args: []
					},
					{
						name: 'notCompeting',
						type: { kind: 'SCALAR', name: 'Boolean', ofType: null, __proto__: null },
						args: []
					},
					{
						name: 'partyName',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						args: []
					},
					{
						name: 'turnoutPercent',
						type: { kind: 'SCALAR', name: 'Float', ofType: null, __proto__: null },
						args: []
					},
					{
						name: 'votePercent',
						type: { kind: 'SCALAR', name: 'Float', ofType: null, __proto__: null },
						args: []
					}
				],
				interfaces: []
			},
			{ kind: 'SCALAR', name: 'String' },
			{
				kind: 'INPUT_OBJECT',
				name: 'StringWhereInputArgument',
				isOneOf: void 0,
				inputFields: [
					{
						name: 'AND',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: {
									name: 'StringWhereInputArgument',
									kind: 'INPUT_OBJECT',
									ofType: null,
									__proto__: null
								}
							}
						},
						defaultValue: void 0
					},
					{
						name: 'NOT',
						type: {
							kind: 'INPUT_OBJECT',
							name: 'StringWhereInputArgument',
							ofType: null,
							__proto__: null
						},
						defaultValue: void 0
					},
					{
						name: 'OR',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: {
									name: 'StringWhereInputArgument',
									kind: 'INPUT_OBJECT',
									ofType: null,
									__proto__: null
								}
							}
						},
						defaultValue: void 0
					},
					{
						name: 'arrayContained',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'String', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'arrayContains',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'String', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'arrayOverlaps',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'String', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'eq',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'gt',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'gte',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'ilike',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'in',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'String', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'isNotNull',
						type: { kind: 'SCALAR', name: 'Boolean', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'isNull',
						type: { kind: 'SCALAR', name: 'Boolean', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'like',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'lt',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'lte',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'ne',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'notIlike',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					},
					{
						name: 'notIn',
						type: {
							kind: 'LIST',
							ofType: {
								kind: 'NON_NULL',
								ofType: { name: 'String', kind: 'SCALAR', ofType: null, __proto__: null }
							}
						},
						defaultValue: void 0
					},
					{
						name: 'notLike',
						type: { kind: 'SCALAR', name: 'String', ofType: null, __proto__: null },
						defaultValue: void 0
					}
				]
			}
		],
		directives: []
	}
} as IntrospectionQuery;

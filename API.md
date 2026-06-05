# API
## Functions

<dl>
<dt><a href="#generateOpenAPITypes">generateOpenAPITypes(schema, options)</a> ⇒ <code>TypeScript.NodeArray</code></dt>
<dd><p>Create the TypeScript types declarations from an Open API document</p>
</dd>
<dt><a href="#generateJSONSchemaTypes">generateJSONSchemaTypes(schema, options)</a> ⇒ <code>TypeScript.NodeArray</code></dt>
<dd><p>Create the TypeScript types declarations from a JSONSchema document</p>
</dd>
<dt><a href="#toSource">toSource(nodes)</a> ⇒</dt>
<dd><p>Returns source from a list of TypeScript statements</p>
</dd>
</dl>

<a name="generateOpenAPITypes"></a>

## generateOpenAPITypes(schema, options) ⇒ <code>TypeScript.NodeArray</code>
Create the TypeScript types declarations from an Open API document

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| schema | <code>OpenAPI</code> |  |
| options | <code>Object</code> |  |
| options.baseName | <code>string</code> |  |
| options.basePath | <code>string</code> |  |
| options.filterStatuses | <code>Array.&lt;(number\|&quot;default&quot;)&gt;</code> | Filter generated types per HTTP status |
| options.generateUnusedSchemas | <code>boolean</code> | Generate schemas even if the API doesn't use it |
| options.camelizeInputs | <code>boolean</code> | Use camel case for API inputs |
| options.brandedTypes | <code>Array.&lt;string&gt;</code> | Brand types by names |
| options.brandedFormats | <code>Array.&lt;string&gt;</code> | Brand formats by names |
| options.patternTypes | <code>Array.&lt;string&gt;</code> \| <code>&quot;all&quot;</code> | Try to generate types from patterns |
| options.expandPatternChars | <code>boolean</code> | Expand some character classes into literal unions when generating pattern-based types |
| options.typedFormats | <code>Object</code> | Substitute string format by a type |
| options.generateRealEnums | <code>boolean</code> | Generate TypeScript enums |
| options.tuplesFromFixedArraysLengthLimit | <code>number</code> | Fix the maximum tuple size |
| options.exportNamespaces | <code>boolean</code> | Decide if the export must be made through namespaces |
| options.requireCleanAPI | <code>boolean</code> | Stricter API required (enable if you can improve the API) |

<a name="generateJSONSchemaTypes"></a>

## generateJSONSchemaTypes(schema, options) ⇒ <code>TypeScript.NodeArray</code>
Create the TypeScript types declarations from a JSONSchema document

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| schema | <code>JSONSchema.Document</code> |  |
| options | <code>Object</code> |  |
| options.baseName | <code>string</code> |  |
| options.brandedTypes | <code>Array.&lt;string&gt;</code> | Brand types by names |
| options.brandedFormats | <code>Array.&lt;string&gt;</code> | Brand formats by names |
| options.patternTypes | <code>Array.&lt;string&gt;</code> \| <code>&quot;all&quot;</code> | Try to generate types from patterns |
| options.expandPatternChars | <code>boolean</code> | Expand some character classes into literal unions when generating pattern-based types |
| options.typedFormats | <code>Object</code> | Substitute string format by a type |
| options.generateRealEnums | <code>boolean</code> | Generate TypeScript enums |
| options.tuplesFromFixedArraysLengthLimit | <code>number</code> | Fix the maximum tuple size |
| options.exportNamespaces | <code>boolean</code> | Decide if the export must be made through namespaces |

<a name="toSource"></a>

## toSource(nodes) ⇒
Returns source from a list of TypeScript statements

**Kind**: global function  
**Returns**: string  

| Param | Type |
| --- | --- |
| nodes | <code>TypedPropertyDescriptor.NodeArray</code> | 


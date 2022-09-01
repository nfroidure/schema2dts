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

| Param | Type |
| --- | --- |
| schema | <code>JSONSchema.Document</code> | 
| options | <code>Object</code> | 
| options.baseName | <code>string</code> | 
| options.filterStatuses | <code>Array.&lt;number&gt;</code> | 
| options.generateUnusedSchemas | <code>boolean</code> | 
| options.camelizeInputs | <code>boolean</code> | 
| options.brandedTypes | <code>Array.&lt;string&gt;</code> | 

<a name="generateJSONSchemaTypes"></a>

## generateJSONSchemaTypes(schema, options) ⇒ <code>TypeScript.NodeArray</code>
Create the TypeScript types declarations from a JSONSchema document

**Kind**: global function  

| Param | Type |
| --- | --- |
| schema | <code>JSONSchema.Document</code> | 
| options | <code>Object</code> | 
| options.name | <code>string</code> | 
| options.brandedTypes | <code>Array.&lt;string&gt;</code> | 

<a name="toSource"></a>

## toSource(nodes) ⇒
Returns source from a list of TypeScript statements

**Kind**: global function  
**Returns**: string  

| Param | Type |
| --- | --- |
| nodes | <code>TypedPropertyDescriptor.NodeArray</code> | 


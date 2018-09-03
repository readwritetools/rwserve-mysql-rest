//=============================================================================
//
// File:         rwt/rwserve-mariadb/sql-utils.class.js
// Language:     ECMAScript 2015
// Copyright:    Joe Honton © 2018
// License:      CC-BY-NC-ND 4.0
// Initial date: Au 30, 2018
// Contents:     SQL strings utility functions
//
//=============================================================================

const log = require('/usr/lib/node_modules/rwserve/dist/log.class');

export default class SqlUtils {

	//> schema is an object whose properties are table name objects comprising column names
	//> tableName is used to look up and validate the specified columns 
	//> jsonString contains the names a columns to be retrieved in a SELECT
	//     ["column1","column2",...]
	//
	//< returns a string containing a comma-separated list of columns, suitable for building an SQL statement
	// errors may be thrown and must be caught by the caller, terminating the request with status code SC.BAD_REQUEST_400
	static assembleSelectColumns(schema, tableName, jsonString) {
		if (jsonString == '')
			return '*';				// if not specified, select all columns 
		try {
			var json = JSON.parse(jsonString);
		}
		catch (err) {
			throw new Error(`Unable to parse json string from 'columns' parameter: ${err.message}`);
		}
		
		if (json.constructor.name != 'Array')
			throw new Error(`Expecting an array in 'columns' parameter`);
		
		var columnsSQL = [];
		for (let i=0; i < json.length; i++) {
			var columnName = json[i];
			if (columnName.indexOf('count(*)') === 0)		// count(*) AS cnt
				columnsSQL.push(columnName);  				// do not wrap
			else if (!SqlUtils.isValidColumnName(schema, tableName, columnName))
				throw new Error(`Unconfigured column name ${columnName} in 'columns' parameter`);
			else
				columnsSQL.push(SqlUtils.wrapName(columnName));
		}
		
		return columnsSQL.join(',');
	}

	//> schema is an object whose properties are table name objects comprising column names
	//> tableName is used to look up and validate the specified columns 
	//> arr contains the names of columns for an INSERT or UPDATE
	//     ["column1","column2",...]
	//
	//< returns a string containing a comma-separated list of columns, suitable for building an SQL statement
	// errors may be thrown and must be caught by the caller, terminating the request with status code SC.BAD_REQUEST_400
	static assembleColumns(schema, tableName, arr) {
		var columnsSQL = [];
		for (let i=0; i < arr.length; i++) {
			var columnName = arr[i];
			if (!SqlUtils.isValidColumnName(schema, tableName, columnName))
				throw new Error(`Unconfigured column name ${columnName} in payload`);
			else
				columnsSQL.push(SqlUtils.wrapName(columnName));
		}
		
		return '(' + columnsSQL.join(',') + ')';
	}
	
	//> arr contains the values for columns of an INSERT or UPDATE
	//< returns a string containing a comma-separated list of column values, suitable for building an SQL statement
	static assembleValues(arr) {
		var valuesSQL = [];
		for (let i=0; i < arr.length; i++)
			valuesSQL.push(SqlUtils.wrapValue(arr[i]));
		
		return '(' + valuesSQL.join(',') + ')';
	}
	
	//> schema is an object whose properties are table name objects comprising column names
	//> tableName is used to look up and validate the specified columns 
	//> json contains properties with values which will be converted into `column name` = "column value" SQL strings
	static assembleSetClause(schema, tableName, json) {
		
		if (json.constructor.name != 'Object')
			throw new Error(`Expecting an Object containing properties with values in the payload`);

		var pairs = [];
		var entries = Object.entries(json);
		for (let i=0; i < entries.length; i++) {
			var [columnName, columnValue] = entries[i];
			
			if (!SqlUtils.isValidColumnName(schema, tableName, columnName))
				throw new Error(`Unconfigured column name ${columnName} in payload`);

			columnName = SqlUtils.wrapName(columnName);				// column_name    --> `column_name`
			var columnValue = SqlUtils.wrapValue(columnValue);		// column's value --> "column\'s value"
			pairs.push(`${columnName} = ${columnValue}`);
		}
		
		return 'SET ' + pairs.join(', ');
	}
	
	//> schema is an object whose properties are table name objects comprising column names
	//> tableName is used to look up and validate the specified columns 
	//> jsonString contains WHERE conditions specified in one of these ways:
	//		a) a single column and value with an implied "=" comparison operator
	//      	["column","value"]
	//		b) a single column and value with an explicit comparison operator (LIKE, NOT LIKE, =, <>, <, <=, >, >=)
	//			["column","comparison","value"]
	//		c) multiple conditions, each with a column, comparison operator, value, and connector (AND, OR)
	//			[["column","comparison","value","connector"],
	//			  ["column","comparison","value","connector"]]
	//			
	//< returns a string containing a WHERE clause suitable for building an SQL statement
	// errors may be thrown and must be caught by the caller, terminating the request with status code SC.BAD_REQUEST_400
	static assembleWhere(schema, tableName, jsonString) {
		if (jsonString == '')
			return '';
		try {
			var json = JSON.parse(jsonString);
		}
		catch (err) {
			throw new Error(`Unable to parse json string from 'where' parameter: ${err.message}`);
		}
		
		if (json.constructor.name != 'Array')
			throw new Error(`Expecting an array in 'where' parameter`);
		
		// pattern a)
		if (json.length == 2 && json[0].constructor.name == 'String') {
			var columnName = json[0];
			if (!SqlUtils.isValidColumnName(schema, tableName, columnName))
				throw new Error(`Unconfigured column name ${columnName} in 'where' parameter`);

			columnName = SqlUtils.wrapName(columnName);				// column_name    --> `column_name`
			var columnValue = SqlUtils.wrapValue(json[1]);			// column's value --> "column\'s value"
			return `WHERE ${columnName} = ${columnValue}`;
		}

		// pattern b)
		else if (json.length == 3 && json[0].constructor.name == 'String') {
			var columnName = json[0];
			if (!SqlUtils.isValidColumnName(schema, tableName, columnName))
				throw new Error(`Unconfigured column name ${columnName} in 'where' parameter`);
			columnName = SqlUtils.wrapName(columnName);	

			var operator = json[1];
			if (!SqlUtils.isValidConditionalOperator(operator))
				throw new Error(`Invalid conditional operator '${operator}' in 'where' parameter`);
			
			var columnValue = SqlUtils.wrapValue(json[2]);
			
			return `WHERE ${columnName} ${operator} ${columnValue}`;
		}
		
		// pattern c)
		else if (json.length > 0 && json[0].constructor.name == 'Array') {
			
			var parts = [];
			parts.push('WHERE');
			var allConditions = json;
			
			for (let i=0; i < allConditions.length; i++) {
				var oneCondition = allConditions[i];
				if (oneCondition.constructor.name != 'Array' && (oneCondition.length == 3 || oneCondition.length == 4))
					throw new Error(`Invalid Array of Arrays in 'where' parameter`);
				
				var columnName = oneCondition[0];
				if (!SqlUtils.isValidColumnName(schema, tableName, columnName))
					throw new Error(`Unconfigured column name ${columnName} in 'where' parameter`);
				columnName = SqlUtils.wrapName(columnName);

				var operator = oneCondition[1];
				if (!SqlUtils.isValidConditionalOperator(operator))
					throw new Error(`Invalid conditional operator '${operator}' in 'where' parameter`);
				
				var columnValue = SqlUtils.wrapValue(oneCondition[2]);

				var oneSQL = `(${columnName} ${operator} ${columnValue})`;

				// every condition but the last should have 'AND' or 'OR'
				if (i < allConditions.length-1) {
					if (oneCondition.length != 4)
						throw new Error(`Missing connector in 'where' parameter`);
					var connector = oneCondition[3];
					if (!SqlUtils.isValidConnector(connector))
						throw new Error(`Invalid connector '${connector}' in 'where' parameter`);
					oneSQL += ` ${connector}`;
				}
				
				parts.push(oneSQL);
			}
			return parts.join(' ');
		}
		
		else
			throw new Error(`Unhandled format in 'where' parameter`);
	}

	
	//> schema is an object whose properties are table name objects comprising column names
	//> tableName is used to look up and validate the specified columns 
	//> jsonString contains ORDER BY conditions specified in one of these ways:
	//		a) a single column with an optional direction
	//      	"column"
	//			"column DESC"
	//		b) an arry of columns with optional directions
	//			["column1","column2"]
	//			["column1 DESC","column2 ASC"]
	//			
	//< returns a string containing an ORDER BY clause suitable for building an SQL statement
	// errors may be thrown and must be caught by the caller, terminating the request with status code SC.BAD_REQUEST_400
	static assembleOrderBy(schema, tableName, jsonString) {
		if (jsonString == '')
			return '';
		try {
			var json = JSON.parse(jsonString);
		}
		catch (err) {
			throw new Error(`Unable to parse json string from 'orderby' parameter: ${err.message}`);
		}
		
		// pattern a)
		if (json.constructor.name == 'String') {
			var columnWithDirection = json;
			var columnName = '';
			var direction = '';
			var posAsc = columnWithDirection.indexOf('ASC');
			var posDesc = columnWithDirection.indexOf('DESC');
			if (posDesc !== -1) {
				columnName = columnWithDirection.substr(0, posDesc).trim();
				direction = 'DESC';
			}
			else if (posAsc !== -1) {
				columnName = columnWithDirection.substr(0, posAsc).trim();
				direction = 'ASC';
			}
			
			if (!SqlUtils.isValidColumnName(schema, tableName, columnName))
				throw new Error(`Unconfigured column name ${columnName} in 'orderby' parameter`);

			columnName = SqlUtils.wrapName(columnName);
			return `ORDER BY ${columnName} ${direction}`;
		}
		
		// pattern b)
		else if (json.constructor.name == 'Array') {
			var parts = [];
			for (let i=0; i < json.length; i++) {
				var columnWithDirection = json[i];
				var columnName = '';
				var direction = '';
				var posAsc = columnWithDirection.indexOf('ASC');
				var posDesc = columnWithDirection.indexOf('DESC');
				if (posDesc !== -1) {
					columnName = columnWithDirection.substr(0, posDesc).trim();
					direction = 'DESC';
				}
				else if (posAsc !== -1) {
					columnName = columnWithDirection.substr(0, posAsc).trim();
					direction = 'ASC';
				}
				
				if (!SqlUtils.isValidColumnName(schema, tableName, columnName))
					throw new Error(`Unconfigured column name ${columnName} in 'orderby' parameter`);

				columnName = SqlUtils.wrapName(columnName);
				parts.push(`${columnName} ${direction}`);
			}
			return 'ORDER BY ' + parts.join(', ');
		}
		
		else
			throw new Error(`Unhandled format in 'orderby' parameter`);
	}

	//> configMaxRows is the maximum number of row as set in the config file
	//> limit contains a limit, represented in a JavaScript String
	//> offset contains an offset, represented in a JavaScript String
	//			
	//< returns a string containing a LIMIT clause suitable for building an SQL statement
	// errors may be thrown and must be caught by the caller, terminating the request with status code SC.BAD_REQUEST_400
	static assembleLimit(configMaxRows, limit, offset) {

		limit = parseInt(limit);
		offset = parseInt(offset);
		if (Number.isNaN(limit) || limit < 0 || limit > configMaxRows)
			throw new Error(`Value of 'limit' parameter is invalid`);
		if (Number.isNaN(offset) || offset < 0)
			throw new Error(`Value of 'offset' parameter is invalid`);
			
		if (offset == 0)
			return `LIMIT ${limit}`;
		else
			return `LIMIT ${limit} OFFSET ${offset}`;
	}
	
	// For safety, any database name, table name, or column name may be enclosed in GRAVE-ACCENTs
	// This allows SQL reserved words to be used in those contexts
	static wrapName(name) {
		return '`' + name + '`';
	}
	
	// String values that contain APOSTROPHE '\u0027', QUOTATION-MARK '\u0022', REVERSE-SOLIDUS '\u005C', or NULL '\u0000' are escaped
	// The entire string is wrapped in QUOTATION-MARKs.
	static wrapValue(value) {
		var buf = [];
		buf.push('\u0022');
		for (let i=0; i < value.length; i++) {
			var char = value[i];
			if (char == '\u0027' || char == '\u0022' || char == '\u005C' || char == '\u0000')
				buf.push('\u005C');
			buf.push(char);
		}
		buf.push('\u0022');
		return buf.join('');
	}
	
	//> schema is an object whose properites are table names
	static isValidTableName(schema, tableName) {
		return schema.hasOwnProperty(tableName);
	}
	
	//> schema is an object whose properites are table names
	static isValidColumnName(schema, tableName, columnName) {
		return (SqlUtils.isValidTableName(schema, tableName) && schema[tableName].hasOwnProperty(columnName));
	}
	
	static isValidConditionalOperator(operator) {
		return ['LIKE', 'NOT LIKE', '=', '<>', '<', '<=', '>', '>='].includes(operator);
	}

	static isValidConnector(connector) {
		return ['AND', 'OR'].includes(connector);
	}
}
//=============================================================================
//
// File:         rwserve-mysql-rest/src/index.js
// Language:     ECMAScript 2015
// Copyright:    Read Write Tools © 2018
// License:      MIT License
// Initial date: Aug 29, 2018
//
// Contents:     An RWSERVE plugin to access data from MySQL/MariaDB databases
//
//======================== Sample configuration ===============================
/*
	plugins {
		rwserve-mysql-rest {
			location `/palau/app/rwserve-mysql-rest/dbg/rwserve-mysql-rest.class.js`
			config {
				connection {
					host       8.16.32.64
					port       3306
					user       $DB-USER
					password   $DB-PASSWORD
					database   registration 
				}
				options {
					maxrows 100
				}
				schema {
					myTable1 {
						myColumn1
						myColumn2
						myColumn3
						...
					}
					...
				}
			}
		}
		router {
			`/api*`  *methods=GET,PUT,PATCH,DELETE  *plugin=rwserve-mysql-rest
		}
	}
*/
//========================= Sample CURL =======================================
//
// curl -X PUT     https://localhost:7443/api?table=customers -H content-type:application/json -d '{"customer_number": "CN001", "email_address": "friendly@mailinator.com", "account_type": "subscriber" }' -k -v
// 
// curl -X PATCH  "https://localhost:7443/api?table=customers&where=%5B%22account_type%22%2C%22subscriber%22%5D" -H content-type:application/json -d '{"account_type": "member" }'
// 
// curl -X DELETE "https://localhost:7443/api?table=customers&where=%5B%22account_type%22%2C%22expired%22%5D"
//
// curl -X GET    "https://localhost:7443/api?table=customers&columns=%5B%22customer_number%22%2C%20%22email_address%22%5D&where=%5B%22account_type%22%2C%22verified%22%5D&orderby=%22customer_number%20ASC%22&limit=10&offset=20"
//
//=============================================================================

import {log} 		from 'rwserve-plugin-sdk';
import {SC} 		from 'rwserve-plugin-sdk';
const mysql = require('mysql2/promise');
import SqlUtils 	from './sql-utils.class';

export default class RwserveMysqlRest {

	constructor(hostConfig) {
		this.hostConfig 	= hostConfig;
		this.mysqlConfig 	= hostConfig.pluginsConfig.rwserveMysqlRest;
		this.options 		= hostConfig.pluginsConfig.rwserveMysqlRest.options; 
		this.schema 		= hostConfig.pluginsConfig.rwserveMysqlRest.schema; 
		
		this.connection = null;
		this.configMaxRows = (this.options !== undefined && this.options.maxrows !== undefined) ? this.options.maxrows : '100';
		
    	Object.seal(this);
	}
	
	async startup() {
		log.debug('RwserveMysqlRest', 'v1.0.0; © 2018 Read Write Tools; MIT License'); 
		
		var connectionConfig = this.mysqlConfig.connection;
		var options = {
				host: connectionConfig.host,
				port: connectionConfig.port,
				user: connectionConfig.user,
				password: connectionConfig.password,
				database: connectionConfig.database
		};
		
		try {
			this.connection = await mysql.createConnection(options);
		}
		catch (err) {
			log.error(`Unable to connect to database ${err.message}`);
		}

	}
	
	async shutdown() {
		log.debug('RwserveMysqlRest', `Shutting down ${this.hostConfig.hostname}`);
		try {
			this.connection.destroy();
		}
		catch (err) {
			log.error(err.message);
		}
	}
	
	async processingSequence(workOrder) {
		try {
			// get the tableName from the incoming HTTP query-string and validate against the configured schema
			var tableName = workOrder.hasParameter('table') ? workOrder.getParameter('table') : '';
			if (!SqlUtils.isValidTableName(this.schema, tableName))
				throw new Error(`Unknown table '${tableName}'`);

			switch (workOrder.getMethod()) {				
				case 'GET':
					await this.select(workOrder, tableName);
					break;
					
				case 'PUT':
					await this.create(workOrder, tableName);
					break;
					
				case 'PATCH':
					await this.update(workOrder, tableName);
					break;
					
				case 'DELETE':
					await this.delete(workOrder, tableName);
					break;
				
				default:
					await this.unhandledMethod(workOrder);
					break;
			}
		}
		catch (err) {
			workOrder.addXHeader('rw-mysql-rest', 'SQL failed', err.message, SC.BAD_REQUEST_400);
			workOrder.noFurtherProcessing();
		}
	}
	
	//-------------------------------------------------------------------------
	//^ When the request is a GET, the payload is not needed.
	//  The _parameterMap may have any of these:
	//    'columns' is a json string containing the column names to retreive
	//    'where' is a json string containing WHERE conditions
	//    'orderby' is a json string containing ORDER BY columns 
	//    'limit' is a plain string containing an integer value for the LIMIT clause
	//    'offset' is a plain string containing an integer value for the OFFSET clause
	//
	//< Sets status code 200 when the retrieval is successful, and includes a payload in JSON format
	//  containing an array of objects, one for each row retrieved.
	//< Sets status code 400 when the SQL request could not be safely assembled or successfully executed
	async select(workOrder, tableName) {		
		try {
			var tableSQL = SqlUtils.wrapName(tableName);
			
			// deserialize the list of columns to get and validate against the configured schema
			var columnsJSON = workOrder.hasParameter('columns') ? workOrder.getParameter('columns') : '';
			var columnsSQL = SqlUtils.assembleSelectColumns(this.schema, tableName, columnsJSON);
			
			// deserialize the WHERE clause conditions and validate against the configured schema
			var whereJSON = workOrder.hasParameter('where') ? workOrder.getParameter('where') : '';
			var whereSQL = SqlUtils.assembleWhere(this.schema, tableName, whereJSON);
			
			// deserialize the ORDER BY clause and validate against the configured schema
			var orderByJSON = workOrder.hasParameter('orderby') ? workOrder.getParameter('orderby') : '';
			var orderBySQL = SqlUtils.assembleOrderBy(this.schema, tableName, orderByJSON);

			// deserialize the LIMIT clause, but restrict it to the number of rows specified in the configuration file. 
			var limit = workOrder.hasParameter('limit') ? workOrder.getParameter('limit') : this.configMaxRows;
			var offset = workOrder.hasParameter('offset') ? workOrder.getParameter('offset') : '0';
			var limitSQL = SqlUtils.assembleLimit(this.configMaxRows, limit, offset);

			// assemble the parts into a statement
			var sqlParts = [];
			sqlParts.push('SELECT');
			sqlParts.push(columnsSQL);
			sqlParts.push('FROM');
			sqlParts.push(tableSQL);
			sqlParts.push(whereSQL);
			sqlParts.push(orderBySQL);
			sqlParts.push(limitSQL);
			var sqlStatement = sqlParts.join(' ');
			
			var [textRows, columnDefinitions] = await this.connection.execute(sqlStatement);
			
			var jsonPayload = JSON.stringify(textRows, null, 4);
			workOrder.setOutgoingPayload(jsonPayload);
			workOrder.addStdHeader('content-type', 'application/json');
			workOrder.addStdHeader('content-length', jsonPayload.length);
			workOrder.setStatusCode(SC.OK_200);
		}
		
		// catch errors thrown by the various parts assemblers, and by SQL execute
		catch (err) {
			workOrder.addXHeader('rw-mysql-rest', 'SQL SELECT failed', err.message, SC.BAD_REQUEST_400);
			workOrder.setEmptyPayload();
			workOrder.noFurtherProcessing();
		}
	}

	//-------------------------------------------------------------------------
	//^ When the HTTP method is PUT, the payload should:
	//    1) be in content-type 'application/json'
	//    2) contain a single object whose properties are SQL column names with values.
	//    Example:
	//      {"customer_number": "CN001", "email_address": "joe@example.com"}
	//
	//< Sets status code 200 if the record was successfully created, and includes a payload in JSON format
	//  containing a single value "insertId"
	//< Sets status code 400 when the SQL request could not be safely assembled or successfully executed
	async create(workOrder, tableName) {
		try {
			var tableSQL = SqlUtils.wrapName(tableName);
			
			// make sure the payload is the correct MIME-type
			var contentType = workOrder.requestHeaders['content-type'];
			if (workOrder.requestHeaders['content-type'] != 'application/json')
				throw new Error(`content-type header should be application/json but was ${contentType}`);
				
			var jsonString = workOrder.incomingPayload;
			if (jsonString == '')
				throw new Error(`empty payload`);

			try {
				var json = JSON.parse(jsonString);
			}
			catch (err) {
				throw new Error(`Unable to parse json string from payload: ${err.message}`);
			}

			// assemble the payload's json string into column name and column value SQL strings
			var columnsArr = Object.keys(json);
			var valuesArr = Object.values(json);
			var columnsSQL = SqlUtils.assembleColumns(this.schema, tableName, columnsArr);
			var valuesSQL = SqlUtils.assembleValues(valuesArr);
			
			// assemble the parts into a statement
			var sqlParts = [];
			sqlParts.push('INSERT INTO');
			sqlParts.push(tableSQL);
			sqlParts.push(columnsSQL);
			sqlParts.push('VALUES');
			sqlParts.push(valuesSQL);
			var sqlStatement = sqlParts.join(' ');
			
			var [resultsSetHeader, dummy] = await this.connection.execute(sqlStatement);
			
			var jsonPayload = `{"insertId": "${resultsSetHeader.insertId}"}`;
			workOrder.setOutgoingPayload(jsonPayload);
			workOrder.addStdHeader('content-type', 'application/json');
			workOrder.addStdHeader('content-length', jsonPayload.length);
			workOrder.setStatusCode(SC.OK_200);
			workOrder.noFurtherProcessing();
		}
		
		// catch errors thrown by the various parts assemblers, and by SQL execute
		catch (err) {
			workOrder.addXHeader('rw-mysql-rest', 'SQL CREATE failed', err.message, SC.BAD_REQUEST_400);
			workOrder.setEmptyPayload();
			workOrder.noFurtherProcessing();
		}
	}
	
	//-------------------------------------------------------------------------
	//^ When the HTTP method is PATCH, the payload should:
	//    1) be in content-type 'application/json'
	//    2) contain a single object whose properties are SQL column names with values.
	//    Example:
	//      {"customer_number": "CN001", "email_address": "joe@example.com"}
	//  The _parameterMap should have:
	//    'where' is a json string containing WHERE conditions
	//
	//< Sets status code 200 if the records were successfully updated, and includes a payload in JSON format
	//  containing a single value "affectedRows"
	//< Sets status code 400 when the SQL request could not be safely assembled or successfully executed
	async update(workOrder, tableName) {
		try {
			var tableSQL = SqlUtils.wrapName(tableName);
			
			// make sure the payload is the correct MIME-type
			var contentType = workOrder.requestHeaders['content-type'];
			if (workOrder.requestHeaders['content-type'] != 'application/json')
				throw new Error(`content-type header should be application/json but was ${contentType}`);
				
			var jsonString = workOrder.incomingPayload;
			if (jsonString == '')
				throw new Error(`empty payload`);

			try {
				var json = JSON.parse(jsonString);
			}
			catch (err) {
				throw new Error(`Unable to parse json string from payload: ${err.message}`);
			}

			// assemble the payload's json string into `column name` = "column value" SQL strings
			var setClauseSQL = SqlUtils.assembleSetClause(this.schema, tableName, json);
			
			// deserialize the WHERE clause conditions and validate against the configured schema
			var whereJSON = workOrder.hasParameter('where') ? workOrder.getParameter('where') : '';
			var whereSQL = SqlUtils.assembleWhere(this.schema, tableName, whereJSON);
			if (whereSQL == '')
				throw new Error(`Refusing to UPDATE without a WHERE clause`);
			
			// assemble the parts into a statement
			var sqlParts = [];
			sqlParts.push('UPDATE');
			sqlParts.push(tableSQL);
			sqlParts.push(setClauseSQL);
			sqlParts.push(whereSQL);
			var sqlStatement = sqlParts.join(' ');
			
			var [resultsSetHeader, dummy] = await this.connection.execute(sqlStatement);
			
			var jsonPayload = `{"affectedRows": "${resultsSetHeader.affectedRows}"}`;
			workOrder.setOutgoingPayload(jsonPayload);
			workOrder.addStdHeader('content-type', 'application/json');
			workOrder.addStdHeader('content-length', jsonPayload.length);
			workOrder.setStatusCode(SC.OK_200);
			workOrder.noFurtherProcessing();
		}
		
		// catch errors thrown by the various parts assemblers, and by SQL execute
		catch (err) {
			workOrder.addXHeader('rw-mysql-rest', 'SQL UPDATE failed', err.message, SC.BAD_REQUEST_400);
			workOrder.setEmptyPayload();
			workOrder.noFurtherProcessing();
		}
	}

	//-------------------------------------------------------------------------
	//^ When the HTTP method is DELETE, the payload is not needed.
	//  The _parameterMap should have:
	//    'where' is a json string containing WHERE conditions
	//
	//< Sets status code 200 if the records were successfully deleted, and includes a payload in JSON format
	//  containing a single value "affectedRows"
	//< Sets status code 400 when the SQL request could not be safely assembled or successfully executed
	async delete(workOrder, tableName) {
		try {
			var tableSQL = SqlUtils.wrapName(tableName);
			
			// deserialize the WHERE clause conditions and validate against the configured schema
			var whereJSON = workOrder.hasParameter('where') ? workOrder.getParameter('where') : '';
			var whereSQL = SqlUtils.assembleWhere(this.schema, tableName, whereJSON);
			if (whereSQL == '')
				throw new Error(`Refusing to DELETE without a WHERE clause`);
			
			// assemble the parts into a statement
			var sqlParts = [];
			sqlParts.push('DELETE FROM');
			sqlParts.push(tableSQL);
			sqlParts.push(whereSQL);
			var sqlStatement = sqlParts.join(' ');
			
			var [resultsSetHeader, dummy] = await this.connection.execute(sqlStatement);
			
			var jsonPayload = `{"affectedRows": "${resultsSetHeader.affectedRows}"}`;
			workOrder.setOutgoingPayload(jsonPayload);
			workOrder.addStdHeader('content-type', 'application/json');
			workOrder.addStdHeader('content-length', jsonPayload.length);
			workOrder.setStatusCode(SC.OK_200);
			workOrder.noFurtherProcessing();
		}
		
		// catch errors thrown by the various parts assemblers, and by SQL execute
		catch (err) {
			workOrder.addXHeader('rw-mysql-rest', 'SQL DELETE failed', err.message, SC.BAD_REQUEST_400);
			workOrder.setEmptyPayload();
			workOrder.noFurtherProcessing();
		}
	}
	
	async unhandledMethod(workOrder, tableName) {
		workOrder.addXHeader('rw-mysql-rest', 'unhandled method', workOrder.getMethod(), SC.BAD_REQUEST_400);
		workOrder.setEmptyPayload();
		workOrder.noFurtherProcessing();
	}
}

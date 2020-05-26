







<figure>
	<img src='/img/plugins/mysql-rest/rwserve-mariadb-unsplash-tobias-fischer.jpg' width='100%' />
	<figcaption></figcaption>
</figure>

# MySQL REST

## Classic REST API for MySQL/MariaDB


<address>
<img src='/img/rwtools.png' width=80 /> by <a href='https://readwritetools.com' title='Read Write Tools'>Read Write Tools</a> <time datetime=2018-06-16>Jun 16, 2018</time></address>



<table>
	<tr><th>Abstract</th></tr>
	<tr><td>This plugin accesses a MySQL database using HTTP with JSON-encoded request and response bodies. Four basic methods are available: <ul><li>PUT requests to create a new row in a specified table</li> <li>PATCH requests to update specified columns of row(s) matching specified conditions</li> <li>DELETE requests to delete row(s) matching specified conditions</li> <li>GET requests to retrieve a LIMITed number of rows in a SORTed order WHERE specified conditions are met</li> </ul> </td></tr>
</table>

### Motivation

It is a common practice when developing web-based software to store and retrieve
database records using a REST API over AJAX. Of course every application's needs
will be different, but functionality to create new records, update and delete
existing records, and retrieve records one at a time or in groups, are common
needs.

This plugin allows you to fulfill those needs without any customization:
everything necessary to build a simple REST API for one or more database tables
can be **declaratively** specified in the server's configuration.

The `RWSERVE MySQL REST` plugin allows you to perform these types of HTTP
requests:

   * Create new records, one at a time, by sending JSON data containing column names
      and column values, using the HTTP `PUT` method.
   * Update an existing record or multiple records, which match specified conditions,
      by sending JSON data containing column names and column values, using the HTTP `PATCH`
method.
   * Delete an existing record or multiple records, which match specified conditions,
      using the HTTP `DELETE` method.
   * Retrieve selected record(s) from a single table, using the HTTP `GET` method, with
      these filtering capabilities:

      * Choosing which columns to retrieve.
      * Retrieving records matching one or more WHERE conditions using any of the SQL
         comparison operators (=, <>, <, <=, >, >=, LIKE, NOT LIKE).
      * SORTing records by one or more columns in ASCending or DESCending order.
      * LIMITing the number of records to get per request.
      * Setting the retrieval OFFSET position to allow *paged* access to large record
         sets.
   * Determining the number of records matching a specified set of conditions using
      the `count(*)` column name.

#### Customization

This plugin is open source and can be extended by you to provide functionality
beyond what's described above, such as:

   * Retrieving data from more than one table using JOINs.
   * Selecting record sets using nested SELECTs.
   * Limiting access to records based on session-based cookies or *JSON Web Tokens*.

#### Complementary server features

Other `Read Write Tools HTTP/2 Server` built-in modules can complement this
plugin's feature set, when enabled, providing:

   * Short term browser-side <a href='https://rwserve.readwritetools.com/cache-control.blue'>cache-control</a>
for database retrievals.
   * Compressed JSON results via <a href='https://rwserve.readwritetools.com/content-encoding.blue'>content-encoding</a>
using gzip or deflate.
   * SEO-friendly URLs using <a href='https://rwserve.readwritetools.com/resource-masks.blue'>resource masks</a>
that map to query-string URLs.
   * Restricted access to retrievals and updates based on <a href='https://rwserve.readwritetools.com/rbac.blue'>Role Based Access Controls</a>
.

### Download

The plugin module is available from <a href='https://www.npmjs.com/package/rwserve-mysql-rest'>NPM</a>
. Before proceeding, you should already have `Node.js` and `RWSERVE` configured and
tested.

This module should be installed on your web server in a well-defined place, so
that it can be discovered by `RWSERVE`. The standard place for public domain
plugins is `/srv/rwserve-plugins`.

<pre>
cd /srv/rwserve-plugins
npm install rwserve-mysql-rest
</pre>

### Configuration is Everything

Make the software available by declaring it in the `plugins` section of your
configuration file. For detailed instructions on how to do this, refer to the <a href='https://rwserve.readwritetools.com/plugins.blue'>plugins</a>
documentation on the `Read Write Tools HTTP/2 Server` website.

#### TL;DR

<pre>
plugins {
    rwserve-mysql-rest {
        location `/srv/rwserve-plugins/node_modules/rwserve-mysql-rest/dist/index.js`
        config {
            connection {
                host       localhost
                port       3306
                user       $DB-USER
                password   $DB-PASSWORD
                database   registration 
            }
            options {
                maxrows 100
            }
            schema {
                customers {
                    oid
                    customer_number
                    email_address
                    account_type
                }
            }
        }
    }
    router {
        `/api*`  *methods=GET,PUT,PATCH,DELETE  *plugin=rwserve-mysql-rest
    }    
}
</pre>

The `config` settings require some explanation.

The `connection` section specifies classic MySQL connection parameters. Refer to
the MySQL docs for more about each of those.

The `maxrows` option limits the number of rows that can be retrieved in a single
SQL SELECT query. When a LIMIT parameter is provided in a request, that limit
will be honored, but only if it is less than or equal to the `maxrows` value.

The `schema` section declares the names of tables and columns that the REST API
can access. In the example above, `customers` is a table name; `oid`, `schema_number`,
`customer_number` and `email_address` are column names. There are no limits to the
number of tables or columns that can be specified in the schema. Note that no
other column metadata — such as data type, data length, is null, etc. — is
specified here.


<table>
	<tr><th>Security</th></tr>
	<tr><td>Schema declarations are used to validate and restrict names provided in the HTTP request and to prevent bad actors from performing <b>SQL injection</b> attacks.</td></tr>
</table>

#### Cookbook

A full configuration file with typical settings for a server running on
localhost port 7443, is included in this NPM module at `etc/mysql-rest-config`. To
use this configuration file, adjust these variables if they don't match your
server setup:

<pre>
$PLUGIN-PATH='/srv/rwserve-plugins/node_modules/rwserve-mysql-rest/dist/index.js'
$PRIVATE-KEY='/etc/pki/tls/private/localhost.key'
$CERTIFICATE='/etc/pki/tls/certs/localhost.crt'
$DOCUMENTS-PATH='/srv/rwserve/configuration-docs'
$DB-USER='wwww-user'
$DB-PASSWORD='secret'
</pre>

## Usage

### Setting up the database

The discussion below uses a MySQL database created with these statements:

<pre>
CREATE DATABASE IF NOT EXISTS `registration`;
USE `registration`;

CREATE TABLE `customers` (
  `oid` mediumint(8) UNSIGNED NOT NULL,
  `customer_number` varchar(16) NOT NULL,
  `email_address` varchar(80) NOT NULL,
  `account_type` varchar(16) NOT NULL
) ENGINE=InnoDB;

ALTER TABLE `customers`
  ADD PRIMARY KEY (`oid`),
  ADD KEY `email-address-index` (`email_address`) USING BTREE;

ALTER TABLE `customers`
  MODIFY `oid` mediumint(8) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=0;
</pre>

### Assembling the request

The plugin uses HTTP **methods** to determine which type of SQL query to perform; it
uses URL **query string** parameters to determine how to perform the query; it uses
the HTTP **request body** to determine what columns and values to use in the query;
and it uses the HTTP **response body** to provide the results of the query.

#### Request body

The request body is used with `PUT` and `PATCH` methods. It should have `content-type`
of "application/json" containing an object with key-value pairs, where each key
is an SQL column name, and each value is its corresponding data.

#### Response body

The response body will always have `content-type` of "application/json". For the `PUT`
method it will contain the single value `insertID`. For the `PATCH` and `DELETE` methods
it will contain the single value `affectedRows`. For the `GET` method it will
contain an array of objects, each containing the columns and values requested.

#### SELECT columns

The `columns` query-string parameter is used only with the `GET` method. It should
be in JSON that is urlencoded. The JSON should be an array containing the column
names to retrieve. This parameter is optional, and when omitted, the query will
retrieve all columns of the specified table.

The special column `count(*)`, or its aliased version `count(*) AS cnt`, is also
allowed, and is the best way to determine how many rows match the specified
conditions.

#### FROM table

The `table` query-string parameter is required for all methods. It is plain-text
that is urlencoded.

#### WHERE conditions

The `where` query-string parameter should be provided for `GET`, `PATCH`, and `DELETE` methods.
It should be in JSON that is urlencoded. The JSON may use implicit style,
explicit style, or multi style.

   * **Implicit style** is an array containing a column name and an associated value. It
      establishes a condition using simple comparison. For example `["oid", "1234"]`,
      establishes the condition `WHERE oid = 1234`.
   * **Explicit style** is an array containing a column name, a comparison operator, and
      an associated value. It establishes a condition using the designated operator,
      which may be (=, <>, <, <=, >, >=, LIKE, NOT LIKE). For example `["email_address", "LIKE", "%.example.com"]`
, establishes the condition `WHERE email_address LIKE "%.example.com"`.
   * **Multi style** is an array containing more than one explicit style condition. In
      this style, each explicit style condition, except the last one, has a fourth
      value containing a *connector*, which is either "AND" or "OR". For example `[["email_address", "LIKE", "%.example.com", "AND"], ["account_type","=","expired"]]`
, establishes the condition `WHERE email_address LIKE "%.example.com" AND account_type = "expired"`
.

#### ORDER BY criteria

The `orderby` query-string parameter may be provided for the `GET` method only. It
should be in JSON that is urlencoded. The JSON is either in single column form
or multi column form.

   * **Single column form** is a simple JSON value. For example `"customer_number"` establishes
      the SQL clause `ORDER BY customer_number`. The JSON value may also include the
      keyword suffix "ASC" or "DESC" to establish the direction of the ordering. For
      example `"customer_number DESC"` establishes the SQL clause `ORDER BY customer_number DESC`
.
   * **Multi column form** is an array comprising more than one single column form
      values. For example `["account_type ASC", "customer_number DESC"]` establishes the
      SQL clause `ORDER BY account_type ASC, customer_number DESC`.

#### LIMIT and OFFSET rules

The `limit` query-string parameter is a simple numeric value, not using JSON, and
not needing urlencoding. For example `limit=100` establishes the SQL clause `LIMIT 100`
.

The `offset` query-string parameter is a simple numeric value, not using JSON, and
not needing urlencoding. For example `offset=200` establishes the SQL clause `OFFSET 200`
.


<table>
	<tr><th>Security</th></tr>
	<tr><td>For safety's sake, all column names used in the <code>table</code>, <code>columns</code>, <code>where</code>, and <code>orderby</code> query-string parameters must be declared in the plugin's <code>schema</code> configuration.</td></tr>
</table>

## Examples

These examples simulate AJAX requests using CURL commands. (The examples are
shown using multiple lines for visual purposes, but of course CURL expects a
single line containing all of its arguments.)

#### PUT

Create a single new record.

<pre>
curl -X PUT
  https://localhost:7443/api?table=customers
    -H content-type:application/json
    -d '{"customer_number": "CN001", "email_address": "friendly@mailinator.com", "account_type": "subscriber" }'
</pre>

This responds with status code `200` and a JSON response body containing the
auto-increment number assigned to the primary key `oid`:

<pre>
{"insertId": "42"}    
</pre>

#### PATCH

Update all records matching the conditions specified in the URL's `where` query-string.
The request body contains a JSON string containing column names and column
values that should be updated. (Omit any columns that do not need to be
updated.)

This example reassigns all records with `account_type` of "subscriber" to have the
new `account_type` of "member". The WHERE conditions follow the rules described
above, so the JSON should be `["account_type","subscriber"]`, and its urlencoded
equivalent should be `%5B%22account_type%22%2C%22subscriber%22%5D`.

<pre>
curl -X PATCH
  "https://localhost:7443/api?table=customers&where=%5B%22account_type%22%2C%22subscriber%22%5D"
    -H content-type:application/json
    -d '{"account_type": "member" }'
</pre>

This responds with status code `200` and a JSON response body containing the
number of rows affected.

<pre>
{"affectedRows": "3"}
</pre>

#### DELETE

Delete all records matching the conditions specified in the URL's `where` query-string.
The request body is empty.

This example deletes all records with `account_type` of "expired". The WHERE
conditions follow the rules described above, so the JSON should be `["account_type","expired"]`
, and its urlencoded equivalent should be `%5B%22account_type%22%2C%22expired%22%5D`
.

<pre>
curl -X DELETE
  "https://localhost:7443/api?table=customers&where=%5B%22account_type%22%2C%22expired%22%5D"
</pre>

This responds with status code `200` and a JSON response body containing the
number of rows affected.

<pre>
{"affectedRows": "2"}
</pre>

#### GET

Retrieve the column values that match the specified conditions, sort criteria,
limit and offest rules, which are specified in the URL as query string
variables. The request body is empty.

This example gets the `customer_number` and `email_address` of the 20th through the
29th customer records, alphabetically ordered by `customer_number`, where the `account_type`
is "verified". These are the URL's query string variables:

   * The **columns** parameter should be JSON encoded as `["customer_number", "email_address"]`
, and its urlencoded equivalent should be `%5B%22customer_number%22%2C%20%22email_address%22%5D`
.
   * The **where** parameter should be JSON encoded as `["account_type","verified"]`, and
      its urlencoded equivalent should be `%5B%22account_type%22%2C%22verified%22%5D`.
   * The **orderby** parameter should be JSON encoded as `"customer_number ASC"`, and its
      urlencoded equivalent should be `%22customer_number%20ASC%22`.
   * The **limit** and **offset** parameters do not use JSON and their values are simply
      digits so no urlencoding is required either.

<pre>
curl -X GET
  "https://localhost:7443/api?table=customers&columns=%5B%22customer_number%22%2C%20%22email_address%22%5D&where=%5B%22account_type%22%2C%22verified%22%5D&orderby=%22customer_number%20ASC%22&limit=10&offset=20"
</pre>

This responds with status code `200` and a JSON response body containing an array
of objects, each containing the columns and values requested:

<pre>
[
    {
        "customer_number": "CN101",
        "email_address": "truthy@mailinator.com"
    },
    {
        "customer_number": "CN102",
        "email_address": "trusty@mailinator.com"
    },
    {
        "customer_number": "CN201",
        "email_address": "tremont@mailinator.com"
    },
    {
        "customer_number": "CN202",
        "email_address": "sophmore@mailinator.com"
    },
    {
        "customer_number": "CN334",
        "email_address": "specter@mailinator.com"
    },
    {
        "customer_number": "CN339",
        "email_address": "special@mailinator.com"
    },
    {
        "customer_number": "CN487",
        "email_address": "alicia@mailinator.com"
    },
    {
        "customer_number": "CN498",
        "email_address": "arthur@mailinator.com"
    },
    {
        "customer_number": "CN532",
        "email_address": "wanda@mailinator.com"
    },
    {
        "customer_number": "CN551",
        "email_address": "victoria@mailinator.com"
    }
]
</pre>

#### Failures

When the request is not properly prepared or when MySQL is unable to execute the
query, the HTTP status code is `400`. Examine the HTTP header `rw-mysql-rest` for
the reason.

#### Deployment

Once you've tested the plugin and are ready to go live, adjust your production
web server's configuration in `/etc/rwserve/rwserve.conf` and restart it using `systemd`
. . .

<pre>
[user@host ~]# systemctl restart rwserve
</pre>

. . . then monitor its request/response activity with `journald`.

<pre>
[user@host ~]# journalctl -u rwserve -ef
</pre>

### Prerequisites

This is a plugin for the **Read Write Tools HTTP/2 Server**, which works on Linux
platforms.


<table>
	<tr><th>Software</th> <th>Minimum Version</th> <th>Most Recent Version</th></tr>
	<tr><td>Ubuntu</td> 		<td>16 Xenial Xerus</td> <td>16 Xenial Xerus</td></tr>
	<tr><td>Debian</td> 		<td>9 Stretch</td> 		<td>10 Buster</td></tr>
	<tr><td>openSUSE</td>	<td>openSUSE 15.1</td> 	<td>openSUSE 15.1</td></tr>
	<tr><td>Fedora</td> 		<td>Fedora 27</td> 		<td>Fedora 32</td></tr>
	<tr><td>CentOS</td>		<td>CentOS 7.4</td>		<td>CentOS 8.1</td></tr>
	<tr><td>RHEL</td> 		<td>RHEL 7.8</td>		<td>RHEL 8.2</td></tr>
	<tr><td>RWSERVE</td>		<td>RWSERVE 1.0.1</td>	<td>RWSERVE 1.0.47</td></tr>
	<tr><td>Node.js</td>		<td>Node.js 10.3</td>	<td>Node.js 12.17</td></tr>
</table>

### Review


<table>
	<tr><th>Lessons</th></tr>
	<tr><td>The essential parts of the plugin are: <ul><li>The mapping of HTTP methods to SQL statements.</li> <li>The use of URL query-string parameters to specify <code>columns</code>, <code>where</code>, <code>orderby</code>, <code>limit</code> and <code>offset</code>. </li> <li>The use of the HTTP request body to provide the data to be inserted or updated.</li> <li>The use of the HTTP response body to provide the results of the SQL query.</li> </ul> Find other plugins for the <code>Read Write Tools HTTP/2 Server</code> using <a href='https://www.npmjs.com/search?q=keywords:rwserve'>npm</a> with these keywords: <kbd>rwserve</kbd>, <kbd>http2</kbd>, <kbd>plugins</kbd>. </td></tr>
</table>

### License

The <span>rwserve-mysql-rest</span> plugin is licensed under the
MIT License.

<img src='/img/blue-seal-mit.png' width=80 align=right />

<details>
	<summary>MIT License</summary>
	<p>Copyright © 2020 Read Write Tools.</p>
	<p>Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:</p>
	<p>The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.</p>
	<p>THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.</p>
</details>

### Availability


<table>
	<tr><td>Source code</td> 			<td><a href='https://github.com/readwritetools/rwserve-mysql-rest'>github</a></td></tr>
	<tr><td>Package installation</td> <td><a href='https://www.npmjs.com/package/rwserve-mysql-rest'>NPM</a></td></tr>
	<tr><td>Documentation</td> 		<td><a href='https://hub.readwritetools.com/plugins/mysql-rest.blue'>Read Write Hub</a></td></tr>
</table>


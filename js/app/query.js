/*jslint browser: true, white: true, plusplus: true, eqeq: true, es5: true*/
/*global angular, console, alert, squel*/

(function () {
  'use strict';

  var app = angular.module('keira2');

  /* [Function] getUpdateQuery
   *  Description: Tracks difference between two row objects and generate UPDATE query
   *  Inputs:
   *  - tableName -> the name of the table (example: "creature_template")
   *  - whereCondition -> the WHERE condition (example: "entry = 30")
   *  - currentRow -> object of the original table
   *  - newRow -> object bound with ng-model to view
   */
  app.getUpdateQuery = function(tableName, whereCondition, currentRow, newRow) {

    var key,
        diff = false,
        query = squel.update({ replaceSingleQuotes : true, singleQuoteReplacement : "\\'" });

    query.table(tableName);

    for (key in currentRow) {
      if (currentRow[key] !== newRow[key]) {

        // Convert numeric values
        if (!isNaN(currentRow[key]) && !isNaN(newRow[key])) {
          newRow[key] = Number(newRow[key]);
        }

        query.set(key, newRow[key]);
        diff = true;
      }
    }

    if (!diff) {
      console.log("[INFO] There are no `" + tableName + "` changes");
      return "";
    }

    query.where(whereCondition);

    return "-- Table `" + tableName + "`\n" + query.toString() + ";\n\n";
  };

  /* [Function] containsRow
   *  checks if object having key is contained in array
   */
  app.containsRow = function(key, object, array) {
    var i;

    for (i = 0; i < array.length; i++) {
      if (array[i][key] == object[key]) {
        return array[i];
      }
    }

    return false;
  };

  /* [Function] getDiffDeleteInsert
   *  Description: Tracks difference between two groups of rows and generate DELETE/INSERT query
   *  Inputs:
   *  - tableName -> the name of the table (example: "creature_loot_template")
   *  - primaryKey1 -> first  primary key (example: "Entry")
   *  - primaryKey2 -> second primary key (example: "Item")
   *  - currentRows -> object of the original table   (group of rows)
   *  - newRows -> object bound with ng-model to view (group of rows)
   */
  app.getDiffDeleteInsert = function(tableName, primaryKey1, primaryKey2, currentRows, newRows) {

    if ( newRows === undefined ) { return; }

    var query, i, deleteQuery, insertQuery, cleanedNewRows, row,
        involvedRows      = [], // -> needed for DELETE
        addedOrEditedRows = []; // -> needed for INSERT

    if (Array.isArray(newRows) && newRows.length <= 0) {

      if ( (currentRows === undefined) || (Array.isArray(currentRows) &&  currentRows.length <= 0)) {
        return;
      } else {

        // all rows were deleted
        query = query = "-- DIFF `" + tableName + "` of " + primaryKey1 + " " + currentRows[0][primaryKey1] + "\n";
        query += "DELETE * FROM " + tableName + " WHERE " + primaryKey1 + " = " + currentRows[0][primaryKey1] + ";";

        return query;
      }
    }

    /* Here we need to remove the $$hashKey field from all newRows objects
     * because we don't want it inside our query
     * if we remove $$hashKey field directly from newRows objects we will break the DOM
     * then we create a copy of newRows without that field
     * clearedNewRows will be the copy of newRows objects without the $$hashKey field */
    cleanedNewRows = angular.fromJson(angular.toJson(newRows));

    deleteQuery = squel.delete().from(tableName);
    insertQuery = squel.insert({ replaceSingleQuotes : true, singleQuoteReplacement : "\\'" }).into(tableName);

    // find deleted or edited rows
    for (i = 0; i < currentRows.length; i++) {

      row = app.containsRow(primaryKey2, currentRows[i], cleanedNewRows);
      if (!row) {

        // currentRows[i] was deleted
        involvedRows.push(currentRows[i][primaryKey2]);

      } else if ( JSON.stringify(row) !== JSON.stringify(currentRows[i]) ) {

        // row was edited
        involvedRows.push(row[primaryKey2]);
        addedOrEditedRows.push(row);
      }
    }

    // find added rows
    for (i = 0; i < cleanedNewRows.length; i++) {

      if ( !app.containsRow(primaryKey2, cleanedNewRows[i], currentRows) ) {

        // cleanedNewRows[i] was added
        involvedRows.push(cleanedNewRows[i][primaryKey2]);
        addedOrEditedRows.push(cleanedNewRows[i]);
      }
    }

    // return if there are no changes
    if ( involvedRows.length <= 0 ) { return "-- There are no changes"; }

    // build queries
    deleteQuery.where(primaryKey1 + " = " + cleanedNewRows[0][primaryKey1]);
    deleteQuery.where(primaryKey2 + " IN ?", involvedRows);
    insertQuery.setFieldsRows(addedOrEditedRows);

    // compose final query
    query = query = "-- DIFF `" + tableName + "` of " + primaryKey1 + " " + newRows[0][primaryKey1] + "\n";
    query += deleteQuery.toString() + ";\n";

    if (addedOrEditedRows.length > 0) {
      query += insertQuery.toString() + ";\n";
    }

    // format query
    query = query.replace(") VALUES (", ") VALUES\n(");
    query = query.replace(/\)\, \(/g, "),\n(");

    return query;

  };

  /* [Function] getFullDeleteInsert
   *  Description: Generate the full DELETE/INSERT query of a group of rows
   *  Inputs:
   *  - tableName -> the name of the table (example: "creature_loot_template")
   *  - primaryKey1 -> first  primary key (example: "Entry")
   *  - newRows -> bound with ng-model to view (group of rows)
   */
  app.getFullDeleteInsert = function(tableName, primaryKey1, newRows) {

    if (newRows === undefined || (Array.isArray(newRows) && newRows.length <= 0) ) { return; }

    var query, i, deleteQuery, insertQuery, cleanedNewRows, tmp;

    // if we have a single object, convert it to array
    if (!Array.isArray(newRows)) {
      tmp = [];
      tmp[0] = newRows;
      newRows = tmp;
    }

    deleteQuery = squel.delete().from(tableName).where(primaryKey1 + " = " + newRows[0][primaryKey1]);

    /* Here we need to remove the $$hashKey field from all newRows objects
     * because we don't want it inside our query
     * if we remove $$hashKey field directly from newRows objects we will break the DOM
     * then we create a copy of newRows without that field
     * clearedNewRows will be the copy of newRows objects without the $$hashKey field */
    cleanedNewRows = angular.fromJson(angular.toJson(newRows));

    insertQuery = squel.insert({ replaceSingleQuotes : true, singleQuoteReplacement : "\\'" }).into(tableName).setFieldsRows(cleanedNewRows);

    query = "-- FULL `" + tableName + "` of " + primaryKey1 + " " + newRows[0][primaryKey1] + "\n";
    query += deleteQuery.toString() + ";\n";
    query += insertQuery.toString() + ";\n";

    query = query.replace(") VALUES (", ") VALUES\n(");
    query = query.replace(/\)\, \(/g, "),\n(");

    return query;
  };

}());

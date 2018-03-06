'use strict';

// [START main_body]
var google = require('googleapis');
var secrets = require('./secrets.json');

var sheetId = secrets.sheetId;
var keyId = secrets.keyId;
var auth = "API_KEY";

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/sheets.googleapis.com-nodejs-quickstart.json
var SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];  
listMajors();


/**
 * Print the names and majors of students in a sample spreadsheet:
 * https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
 */
function listMajors() {
  var sheets = google.sheets('v4');
  sheets.spreadsheets.values.get({
    auth: auth,
    key: keyId,
    spreadsheetId: sheetId,
    range: 'Consolidated PL!A1:P10',
  }, function(err, response) {
    if (err) {
      console.log('The API returned an error: ' + err);
      return;
    }
    var rows = response.data.values;
    if (rows.length == 0) {
      console.log('No data found.');
    } else {
      console.log('Name, Major:');
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        // Print columns A and E, which correspond to indices 0 and 4.
        console.log('%s, %s', row[0], row[4]);
      }
    }
  });
}
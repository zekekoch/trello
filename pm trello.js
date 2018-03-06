'use strict';

var google = require('googleapis');
var Trello = require("trello") // https://github.com/norberteder/trello

// setup trello as me
var trello = new Trello("cc24ec0031db052dc1d9d080fa5516ed", "bf58b4b32ed8c4c3a65b88195a941e6c0ef7c93e0705015e1572ab1073281e00");

// the pm board
var boardId = "jFwFCR16";
var sprintBoard = "nwGM34fP";


var weight = "1WC7Bm8E5yJ7L-vfhreMahnW8OqJbCyKT-IfT_q_4sKo";
var sheetId = "1vMySb5GT189--OBZwbCMAXd2YkR-JY3gkJC9u03icIE"
var keyId = "AIzaSyDYVCKZh2YCt_M6b5rNewwQWFyFXe8e-_4";
var auth = "API_KEY";

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/sheets.googleapis.com-nodejs-quickstart.json
var SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];  

function handleArchiveCard(error) 
{
    if (error) console.log("couldn't delete card")
    else
    { 
        console.log("delete card");
    }
}

function handleAddCard(error, trelloCard)
{
  if (error) {
      console.log('Could not add card:', error);
  }
  else {
      console.log('Added card:', trelloCard);
  }
}

// get sheet from google
getSheet();

var rows;
var tickets = new Array();
var pms = {};
var themes = {};
var quadmesters = {};

class Ticket 
{
  constructor (theme, boulder, feature, description, swag, pm, pgm, scrumTeam, quadmester, priority)
  {
    this.theme = theme;
    this.boulder = boulder;
    this.feature = feature;
    this.description = description;
    this.swag = swag;
    this.pm = pm;
    this.pgm = pgm;
    this.scrumTeam = scrumTeam;
    this.quadmester = quadmester;
    this.priority = priority;
  }
}

/**
 * Print the names and majors of students in a sample spreadsheet:
 * https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
 */
function getSheet() {
  var sheets = google.sheets('v4');
  sheets.spreadsheets.values.get({
    auth: auth,
    key: keyId,
    spreadsheetId: sheetId,
    range: 'Consolidated PL!A2:P500',
  }, function(err, response) {
    if (err) {
      console.log('The API returned an error: ' + err);
      return;
    }
    var rows = response.data.values;
    if (rows.length == 0) {
      console.log('No data found.');
    } else {
      // skip the header row
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
//        constructor (theme, boulder, feature, description, swag, pm, pgm, scrumTeam, quadmester, priority)

        tickets[i] = new Ticket(row[0], row[1], row[2], row[3], row[5], row[7], row[8], row[9], row[11], row[15]);

        var val = new String(tickets[i].pm);
        pms[val] = val;

        val = new String(tickets[i].quadmester).toLowerCase();
        if (val != 'duplicate' && val != 'undefined' && val != 'later' && val != 'target period')
          quadmesters[val] = val;
        else
          console.log(val);
      }

      // i now have my tickets so I need to create the trello board

      // first I want to create a list per quadmester
      trello.getListsOnBoard(boardId)
      .then((lists) => // once the function return it calls then
      {
        // loop over the quadmesters and make sure I have a 
        // list for each one
        for (var quad in quadmesters)
        {
          var hasList = false;
          var currentQuadsTickets = tickets.filter(
            function(ticket) 
            {
              return ticket.quadmester == quadmesters[quad];
            }
          );
          // find any of the items in the current quadmester
          var currentItem = lists.find(
            function(element) 
            {
              // i lowercased the quadmesters since the pms are sloppy
              return element.name.toLowerCase() == quadmesters[quad];
            }
          );
          if (currentItem)  // this means I found the item already
          {
              // if I already have a list then I can start adding items to that
              console.log('found list:' + quadmesters[quad]);
              addCardsToListFromQuadmester(currentItem.id, currentQuadsTickets);
          }
          else
          {
            // otherwise i need to create a new list
            trello.addListToBoard(boardId, quadmesters[quad])
            .then((currentItem) => // this can take a while so I use a promise (to get called when I'm done)
            {
              console.log('created list: ' + currentItem.name);  
              addCardsToListFromQuadmester(currentItem.id, currentQuadsTickets);
            })
            .catch((error) =>
            {
              console.log('error adding list to board');
            });
          }
        }
        return lists;
      })
      .then((lists) => {
        console.log(lists);          
      })
      .catch((error) => {
        console.log('error in get list on board' + error);
      }); 
    }    
  });
}

function addCardsToListFromQuadmester(listId, tickets)
{
  for (const ticket in tickets) {
    if (tickets.hasOwnProperty(ticket)) 
    {
      addCardsToListFromTicket(listId, tickets[ticket]);                  
    }
  }
}

function addCardsToListFromTicket(listId, ticket)
{
  var title = ticket.feature + " (" + ticket.swag + ")";
  trello.addCard(title, ticket.description, listId)
  .then((data) => 
  {
    console.log(data);
  })
  .catch((error) => 
  {
    console.log(error);
  })
}
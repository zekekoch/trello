'use strict';

var google = require('googleapis');
var Trello = require("trello") // https://github.com/norberteder/trello
var secrets = require('./secrets.json');

// this holds the tickets coming out of our google spreadsheet
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

class Tickets 
{
  constructor() 
  {
    this.items = [];
  }

  add(ticket) 
  {
    if (this.add.count == undefined)
      this.add.count = 0;
    else
      this.add.count++;

    // associative array for the pms
    this.pms[ticket.pm] = ticket.pm;

    this.items[this.add.count] = ticket;
    return ticket;
  }

  getQuad(quad)
  {
    // this is just the tickets that are in the current quadmester
    return currentQuadsTickets = this.items.filter(
      function(ticket) 
      {
        return ticket.quadmester == quad;
      }
    );
    return
  }

}

var tickets = new Tickets()

// setup trello as me
var trello = new Trello(secrets.trelloKey, secrets.trelloToken);

// the pm board
var boardId = secrets.boardId;
var sprintBoard = secrets.sprintBoard;

var sheetId = secrets.sheetId;
var keyId = secrets.keyId;
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

var rows;
var pms = {};
var themes = {};
var quadmesters = {};

// get sheet from google, this also kicks off the rest of the code
// yay asyncness
getSheet();

function archiveAllLists()
{
  
}

function getSheet() {
  var sheets = google.sheets('v4');
  sheets.spreadsheets.values.get({
    auth: auth,
    key: secrets.keyId,
    spreadsheetId: secrets.sheetId,
    range: 'Consolidated PL!A2:P500', // somehow I'm still getting the header row so I'm not sure the range is doing anything
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

        // icky constants, i know...
        var ticket = tickets.add(new Ticket(row[0], row[1], row[2], row[3], row[5], row[7], row[8], row[9], row[11], row[15]));

        val = new String(tickets[i].quadmester).toLowerCase();
        switch (val) {
          case 'duplicate':
          case 'undefined':
          case 'later':
          case 'target period':
            // console.log('skipping ' + val);
            // do nothing          
            break;
          default:
            // console.log('found ' + val);
            quadmesters[val] = val;
            break;
        }
      }
      // print out the quadmesters, aren't they pretty?
      for (const quad in quadmesters) {
        if (quadmesters.hasOwnProperty(quad)) {
          const q = quadmesters[quad];
          for(var i = 1;i <= 7;i++)
          {
            quadmesters[q + "-" + i] = q + " S" + i;
          }          
        }
      }
      console.log(quadmesters);

      // i now have my tickets so I need to create the trello board
      // i'm assuming that the previous stuff works somewhat synchronously, but I'm bluffing
      // never a great thing when you're programming, but it seems to be working now...

      // i'm new to promises, so i'm sure this syntax is ugly
      // why oh why is js so weird...

      // first I want to create a list per quadmester
      trello.getListsOnBoard(boardId)
      .then((lists) => // once the function return it calls then()
      {
        // loop over the quadmesters and make sure I have a 
        // list for each one
        for (var quad in quadmesters)
        {
          console.log("processing " + quadmesters[quad]);
          var hasList = false;

          // look for any items in the current quadmester
          // lists sn an object array 
          var currentItem = lists.find(
            function(element) 
            {
              // i lowercased the quadmesters since the pdgms are sloppy
              return element.name.toLowerCase() == quadmesters[quad];
            }
          );
          if (currentItem)  // this means I found the quadmester
          {
              // if I already have a list then I can start adding items to that
              console.log('found list:' + quadmesters[quad]);
              addCardsToListFromQuadmester(currentItem.id, tickets.getQuad(quadmesters[quad]));
          }
          else
          {
            // BUG BUG: right now i'm duplicating any sprint that doesn't have tickets
            //          fix this when I get back from lunch (or later)

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
        // i've created all of the lists now I should order them
        for (const key in object) {
          if (object.hasOwnProperty(key)) {
            const element = object[key];
            
          }
        }
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
'use strict';

var google = require('googleapis');
var Trello = require('trello'); // https://github.com/norberteder/trello
var secrets = require('./secrets.json');
var request = require("request");

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
    if (quadmester)
      this.quadmester = quadmester.toLowerCase();

    this.priority = priority;
  }
}

class Tickets 
{
  constructor() 
  {
    this.items = [];
    this.pms = {};
    this.quadmesters = {};
    this.scrumTeams = {};

    this.scrumTeamColors = 
    {
      // orange = 5a947e8835b91abfde48f9ba
      //Integrations:"pink",
      Contributor:"5a947e8835b91abfde48f9bc",
      //BAM: "purple",

      MIB:"5a947e8835b91abfde48f9be",
      //Organizations:"sky",
      Partner:"5a947e8835b91abfde48f9bf",

      eComm:"5a947e8835b91abfde48f9bd",
      //SNAP:"lime",

      Infra:"5a947e8835b91abfde48f9bb",
      //SRE:"black"
    };
  }

  addTickets(rows)
  {
    if (rows.length == 0) 
    {
      console.log('No data found.');
      return;
    } 
    // skip the header row
    for (let i = 0; i < rows.length; i++) 
    {
      let row = rows[i];

      // icky constants, i know...
      let ticket = tickets.add(new Ticket(row[0], row[1], row[2], row[3], row[5], row[7], row[8], row[9], row[11], row[15]));
    }
  }

  add(ticket) 
  {
    // poor man's static variable, there must be a better idiom in js
    if (this.length == undefined)
      this.length = 0;
    else
      this.length++;

    // add the ticket to the list of tickets
    this.items[this.length] = ticket;

    // create an associative array for the pms & scrumteams
    this.pms[ticket.pm] = ticket.pm;
    this.scrumTeams[ticket.scrumTeam] = ticket.scrumTeam;

    // if it's a new team their color is null
    if(this.scrumTeamColors[ticket.scrumTeam] == null) // null or undefined
      this.scrumTeamColors[ticket.scrumTeam] = 'null';

    // skip the garbage quadmesters
    let quadmester = ticket.quadmester;
    switch (quadmester) {
      case 'duplicate':
      case undefined:
      case 'later':
      case 'target period':
        // console.log('skipping ' + val);
        // do nothing          
        break;
      default:
        // console.log('found ' + val);
        // create the quadmesters
        this.quadmesters[quadmester] = quadmester;
        
        // add 7 sprints per quadmester
        for(let sprint = 1;sprint <= 7;sprint++)
        {
          this.quadmesters[quadmester + "-" + sprint] = quadmester + " S" + sprint;
        }          
        break;
    }

    return ticket;
  }

  getQuad(quad)
  {
    // this is just the tickets that are in the current quadmester
    return this.items.filter(
      function(ticket) 
      {
        return ticket.quadmester == quad;
      }
    );  
  }
}

var tickets = new Tickets();

// setup trello as me
var trello = new Trello(secrets.trelloKey, secrets.trelloToken);

// the pm board

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/sheets.googleapis.com-nodejs-quickstart.json
// zeke: I don't know if this line does anything...
var SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];  

// get sheet from google, this also kicks off the rest of the code
// yay asyncness
getSheet();

function clearListsFromBoard(trelloLists)
{

  for (const listKey in trelloLists) 
  {
    const list = trelloLists[listKey];
    let url = '/1/lists/' + list.id + '/closed';
    let options = { value:'true'};
    trello.makeRequest("PUT", url, options)
    .then((result) => 
    {
      console.log(result);
    })
    .catch((error) => 
    {
      console.log("error closing lists: " + error);
      throw new Error(error);
    });
  }
}

function addCardsToListFromQuadmester(listId, tickets)
{
  if (tickets)
  {
    for (const ticket in tickets) 
    {
        addCardsToListFromTicket(listId, tickets[ticket]);                  
    }
  }
  else
  {
    console.log('tickets is undefined');
  }
}

function addCardsToListFromTicket(listId, ticket)
{
  let title = ticket.feature + " (" + ticket.swag + ")";
  //console.log('adding ticket to ' + listId + ':' + title);

  let extraParams = {
    desc: ticket.description,
    idLabels: tickets.scrumTeamColors[ticket.scrumTeam],
    pos: 0
  };

  trello.addCardWithExtraParams(title, extraParams, listId)
  .then((data) => 
  {
    console.log('suceeded');
    // console.log(data);
  })
  .catch((error) => 
  {
    console.log(error);
    throw new Error(error);
  })
}

function getSheet() 
{
  let rows = {};
  let sheets = google.sheets('v4');
  var req =  
  {
    auth: "API_KEY",
    key: secrets.keyId,
    spreadsheetId: secrets.sheetId,
    range: 'Consolidated PL!A2:P500'
  };

  sheets.spreadsheets.values.get(req, processGoogleSheet);
}

function processGoogleSheet(err, response)
{
  {
    if (err) 
    {
      console.log('The google sheets API returned an error: ' + err);
      throw new Error(err);
    }

    tickets.addTickets(response.data.values);

    // i now have my tickets so I need to create the trello board
    // i'm assuming that the previous stuff works somewhat synchronously, but I'm bluffing
    // never a great thing when you're programming, but it seems to be working for now...

    // i'm new to promises, so i'm sure this syntax is ugly
    // why oh why is js so weird...

    // first I want to create a list per quadmester
    trello.getListsOnBoard(secrets.boardId)
    .then
    (
      (trelloLists) => // once the function return it calls then()
      {
        // a trelloList has id, idBoard, name, pos etc

        // start by clearling the lists
        clearListsFromBoard(trelloLists);
        return trelloLists;
      }
    )
    .then
    (
      (trelloLists) =>
      {
        // loop over the quadmesters and get a list of tickets for each one
        for (let quad in tickets.quadmesters)
        {
          console.log("processing " + tickets.quadmesters[quad]);

          // look for a trelloList for the current quadmester  
          let trelloList = trelloLists.find((list) =>
            {
              // i lowercased the quadmesters since the pdgms are sloppy
              if (list.closed == true)
                return false;
              else if (list.name.toLowerCase() == tickets.quadmesters[quad]) 
                return true;
              else
                return false;
            }
          );

          // if I find that trelloList then I don't need to create it 
          if (trelloList)
          {
              // great, I can start adding items to that
              console.log('found trelloList:' + tickets.quadmesters[quad]);
              addCardsToListFromQuadmester(trelloList.id, tickets.getQuad(tickets.quadmesters[quad]));
          }
          else
          {
            // BUG BUG: right now i'm duplicating any sprint that doesn't have tickets
            //          fix this when I get back from lunch (or later)

            // otherwise i need to create a new list
            trello.addListToBoard(secrets.boardId, tickets.quadmesters[quad])
            .then
            (
              (list) => // this can take a while so I use a promise (to get called when I'm done)
              {
                //console.log('created list: ' + list.name);  
                let quadsTickets = tickets.getQuad(tickets.quadmesters[quad]);
                // if there are any tickets for this quadmester then let's add them
                if (quadsTickets.length > 0)
                  addCardsToListFromQuadmester(list.id, quadsTickets);
              }
            )
            .catch
            (
              (error) =>
              {
                console.log('error adding list to board: ' + error);
                throw new Error(error);
              }
            );
          }
        }
        return trelloLists;
      }
    )
    .then
    (
      (trelloLists) => 
      {
        // TODO: i've created all of the lists now I should order them
        //console.log(trelloLists);          
      }
    )
    .catch
    (
      (error) => 
      {
        console.log('error in get list on board ' + error);
        //throw new Error(error);
      }
    ); 
  }
}